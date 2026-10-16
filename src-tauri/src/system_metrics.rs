use parking_lot::Mutex;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::{Duration, Instant};
use sysinfo::{ProcessRefreshKind, RefreshKind, System};
use tauri::{AppHandle, Emitter, Manager};

use crate::config_store::load_projects;
use crate::AppState;

#[derive(Debug, Clone, Serialize)]
pub struct ServerMetric {
    pub server_id: String,
    pub pid: u32,
    pub cpu_usage: f32,
    pub ram_mb: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct SystemMetricsPayload {
    pub cpu_usage: f32,
    pub ram_used_mb: f64,
    pub ram_total_mb: f64,
    pub managed_cpu_pct: f32,
    pub managed_ram_mb: f64,
    pub active_servers_count: usize,
    pub server_metrics: HashMap<String, ServerMetric>,
}

const RESTART_COOLDOWN: Duration = Duration::from_secs(30);

fn collect_metrics(
    system: &mut System,
    active_pids: &HashMap<String, u32>,
) -> SystemMetricsPayload {
    system.refresh_cpu_usage();
    system.refresh_memory();
    // Le suivi système reste disponible à l'arrêt, sans scanner les processus.
    if !active_pids.is_empty() {
        system.refresh_processes_specifics(ProcessRefreshKind::new().with_cpu().with_memory());
    }

    let mut server_metrics = HashMap::new();
    let mut total_cpu: f32 = 0.0;
    let mut total_ram_bytes: u64 = 0;
    let mut children: HashMap<u32, Vec<u32>> = HashMap::new();
    for (pid, process) in system.processes() {
        if let Some(parent) = process.parent() {
            children
                .entry(parent.as_u32())
                .or_default()
                .push(pid.as_u32());
        }
    }
    let cpu_count = system.cpus().len().max(1) as f32;
    let mut counted = HashSet::new();

    for (server_id, root_pid) in active_pids {
        let mut srv_cpu: f32 = 0.0;
        let mut srv_ram: u64 = 0;

        // Somme les métriques du process racine et de ses enfants
        for pid in descendant_pids(&children, *root_pid) {
            if let Some(process) = system.process(sysinfo::Pid::from_u32(pid)) {
                srv_cpu += process.cpu_usage() / cpu_count;
                srv_ram += process.memory();
                if counted.insert(pid) {
                    total_cpu += process.cpu_usage() / cpu_count;
                    total_ram_bytes += process.memory();
                }
            }
        }

        server_metrics.insert(
            server_id.clone(),
            ServerMetric {
                server_id: server_id.clone(),
                pid: *root_pid,
                cpu_usage: srv_cpu,
                ram_mb: (srv_ram as f64) / (1024.0 * 1024.0),
            },
        );
    }

    SystemMetricsPayload {
        cpu_usage: system.global_cpu_info().cpu_usage(),
        ram_used_mb: (system.used_memory() as f64) / (1024.0 * 1024.0),
        ram_total_mb: (system.total_memory() as f64) / (1024.0 * 1024.0),
        managed_cpu_pct: total_cpu,
        managed_ram_mb: (total_ram_bytes as f64) / (1024.0 * 1024.0),
        active_servers_count: active_pids.len(),
        server_metrics,
    }
}

pub fn start_metrics_poller(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let sys = Arc::new(Mutex::new(System::new_with_specifics(
            RefreshKind::new().with_processes(ProcessRefreshKind::new().with_cpu().with_memory()),
        )));
        let last_restart: Arc<Mutex<HashMap<String, Instant>>> =
            Arc::new(Mutex::new(HashMap::new()));

        loop {
            tokio::time::sleep(Duration::from_secs(2)).await;

            let Some(state) = app.try_state::<Mutex<AppState>>() else {
                continue;
            };
            let active_pids = state.lock().process_manager.get_active_pids();

            let mut to_restart: Vec<(String, u32)> = Vec::new();

            let metrics = collect_metrics(&mut sys.lock(), &active_pids);

            // Auto-Guard RAM : redémarre un serveur qui dépasse sa limite
            // configurée, avec un cooldown anti crash-loop.
            if !active_pids.is_empty() {
                let projects = load_projects();
                let mut restarts = last_restart.lock();
                for prj in &projects {
                    for srv in &prj.servers {
                        if let Some(limit) = srv.ram_limit {
                            if let Some(m) = metrics.server_metrics.get(&srv.id) {
                                if m.ram_mb > limit as f64 {
                                    let now = Instant::now();
                                    let cooldown_ok = restarts.get(&srv.id).is_none_or(|t| {
                                        now.duration_since(*t) >= RESTART_COOLDOWN
                                    });
                                    if cooldown_ok {
                                        restarts.insert(srv.id.clone(), now);
                                        to_restart.push((srv.id.clone(), m.pid));
                                    }
                                }
                            }
                        }
                    }
                }
            }

            let _ = app.emit("system-metrics", metrics);

            for (server_id, pid) in to_restart {
                eprintln!(
                    "Sprint Auto-Guard: le serveur {} (PID {}) dépasse sa limite RAM — redémarrage.",
                    server_id, pid
                );
                restart_server(&app, &server_id).await;
            }
        }
    });
}

async fn restart_server(app: &AppHandle, server_id: &str) {
    let projects = load_projects();
    let found = projects.iter().find_map(|prj| {
        prj.servers
            .iter()
            .find(|srv| srv.id == server_id)
            .map(|srv| (prj.root.clone(), srv.clone()))
    });

    let Some((root, srv)) = found else { return };

    {
        let state = app.state::<Mutex<AppState>>();
        if state
            .lock()
            .process_manager
            .stop_server(app, server_id)
            .is_err()
        {
            return;
        }
    }

    // Laisse le taskkill /T se propager avant de relancer
    tokio::time::sleep(Duration::from_millis(1200)).await;

    let state = app.state::<Mutex<AppState>>();
    let result = state.lock().process_manager.start_server(
        app.clone(),
        server_id.to_string(),
        root,
        srv.command,
        srv.env,
    );
    if let Err(e) = result {
        eprintln!(
            "Sprint Auto-Guard: échec du redémarrage de {}: {}",
            server_id, e
        );
    }
}

fn descendant_pids(children: &HashMap<u32, Vec<u32>>, root: u32) -> HashSet<u32> {
    let mut result = HashSet::new();
    let mut pending = vec![root];
    while let Some(pid) = pending.pop() {
        if result.insert(pid) {
            if let Some(descendants) = children.get(&pid) {
                pending.extend(descendants);
            }
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn descendants_include_nested_children_and_tolerate_cycles() {
        let tree = HashMap::from([(1, vec![2, 3]), (2, vec![4]), (4, vec![1]), (9, vec![10])]);
        assert_eq!(descendant_pids(&tree, 1), HashSet::from([1, 2, 3, 4]));
        assert_eq!(descendant_pids(&tree, 8), HashSet::from([8]));
    }

    #[test]
    fn system_resources_remain_available_without_managed_servers() {
        let metrics = collect_metrics(&mut System::new(), &HashMap::new());
        assert!(metrics.ram_total_mb > 0.0);
        assert!(metrics.ram_used_mb > 0.0);
        assert!(metrics.ram_used_mb <= metrics.ram_total_mb);
        assert!(metrics.cpu_usage.is_finite());
        assert_eq!(metrics.managed_ram_mb, 0.0);
        assert_eq!(metrics.managed_cpu_pct, 0.0);
        assert_eq!(metrics.active_servers_count, 0);
        assert!(metrics.server_metrics.is_empty());
    }

    #[test]
    fn managed_resources_include_a_real_running_process() {
        let pids = HashMap::from([("test-process".to_string(), std::process::id())]);
        let metrics = collect_metrics(&mut System::new(), &pids);
        assert_eq!(metrics.active_servers_count, 1);
        assert!(metrics.managed_ram_mb > 0.0);
        assert!(metrics.managed_cpu_pct.is_finite());
        let process = &metrics.server_metrics["test-process"];
        assert_eq!(process.pid, std::process::id());
        assert!(process.ram_mb > 0.0);
    }
}
