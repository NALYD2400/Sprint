use parking_lot::Mutex;
use serde::Serialize;
use std::collections::HashMap;
use std::os::windows::process::CommandExt;
use std::process::Stdio;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::io::BufReader;
use tokio::process::Child;

use crate::CREATE_NO_WINDOW;

#[derive(Debug, Clone, Serialize)]
pub struct LogPayload {
    pub server_id: String,
    pub line: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct StatusPayload {
    pub server_id: String,
    pub state: String,
    pub pid: Option<u32>,
    pub intentional: bool,
    pub exit_code: Option<i32>,
    pub exit_error: Option<String>,
}

pub struct ProcessManager {
    processes: Arc<Mutex<HashMap<String, u32>>>,
}

fn remove_owned_process(processes: &mut HashMap<String, u32>, server_id: &str, pid: u32) -> bool {
    if processes.get(server_id) != Some(&pid) {
        return false;
    }
    processes.remove(server_id);
    true
}

/// Lit les lignes d'un flux de sortie en tolérant l'encodage non-UTF-8
/// (cp850/cp1252 courant sur Windows FR). `read_until` + `from_utf8_lossy`
/// remplacent `lines()` qui abandonne silencieusement sur des octets invalides.
async fn stream_output<R: tokio::io::AsyncBufRead + Unpin, F: Fn(String)>(
    mut reader: R,
    emit_line: F,
) {
    use tokio::io::AsyncBufReadExt;

    let mut buf = Vec::with_capacity(512);
    loop {
        buf.clear();
        match reader.read_until(b'\n', &mut buf).await {
            Ok(0) => break,
            Ok(_) => {
                let line = String::from_utf8_lossy(&buf);
                let line = line.trim_end_matches(['\n', '\r']);
                if !line.is_empty() {
                    emit_line(line.to_string());
                }
            }
            Err(_) => break,
        }
    }
}

impl ProcessManager {
    pub fn new() -> Self {
        Self {
            processes: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    #[allow(clippy::too_many_arguments)]
    pub fn start_server(
        &self,
        app: AppHandle,
        server_id: String,
        cwd: String,
        command: String,
        env: HashMap<String, String>,
    ) -> Result<u32, String> {
        let mut processes = self.processes.lock();

        if processes.contains_key(&server_id) {
            return Err("Ce serveur est déjà en cours d'exécution.".to_string());
        }

        let mut cmd = tokio::process::Command::new("cmd.exe");
        cmd.arg("/C").arg(&command);
        cmd.current_dir(&cwd);
        cmd.creation_flags(CREATE_NO_WINDOW);
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        for (k, v) in env {
            cmd.env(k, v);
        }

        let mut child: Child = cmd
            .spawn()
            .map_err(|e| format!("Impossible de lancer le processus: {}", e))?;

        let pid = child.id().ok_or("Impossible d'obtenir le PID")?;
        processes.insert(server_id.clone(), pid);

        let app_handle = app.clone();
        let s_id = server_id.clone();

        // Emit running status
        let _ = app.emit(
            "server-status-changed",
            StatusPayload {
                server_id: s_id.clone(),
                state: "running".to_string(),
                pid: Some(pid),
                intentional: false,
                exit_code: None,
                exit_error: None,
            },
        );

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        // Stream stdout
        if let Some(stdout) = stdout {
            let app_out = app_handle.clone();
            let s_out = s_id.clone();
            tauri::async_runtime::spawn(async move {
                let reader = BufReader::new(stdout);
                stream_output(reader, move |line| {
                    let _ = app_out.emit(
                        "server-log-line",
                        LogPayload {
                            server_id: s_out.clone(),
                            line,
                        },
                    );
                })
                .await;
            });
        }

        // Stream stderr
        if let Some(stderr) = stderr {
            let app_err = app_handle.clone();
            let s_err = s_id.clone();
            tauri::async_runtime::spawn(async move {
                let reader = BufReader::new(stderr);
                stream_output(reader, move |line| {
                    let _ = app_err.emit(
                        "server-log-line",
                        LogPayload {
                            server_id: s_err.clone(),
                            line,
                        },
                    );
                })
                .await;
            });
        }

        // Monitor child exit
        let processes_ref = self.processes.clone();
        let app_exit = app_handle.clone();
        let s_exit = s_id.clone();
        tauri::async_runtime::spawn(async move {
            let exit = child.wait().await;
            let exited_normally = exit.as_ref().map(|status| status.success()).unwrap_or(false);
            let exit_code = exit.as_ref().ok().and_then(|status| status.code());
            let exit_error = exit.err().map(|error| error.to_string());
            let owns_process = {
                let mut map = processes_ref.lock();
                // A stopped process can exit after a replacement has already started.
                remove_owned_process(&mut map, &s_exit, pid)
            };
            if !owns_process {
                return;
            }
            let _ = app_exit.emit(
                "server-status-changed",
                StatusPayload {
                    server_id: s_exit,
                    state: "stopped".to_string(),
                    pid: None,
                    intentional: exited_normally,
                    exit_code,
                    exit_error,
                },
            );
        });

        Ok(pid)
    }

    pub fn stop_server(&self, app: &AppHandle, server_id: &str) -> Result<(), String> {
        let mut processes = self.processes.lock();
        let pid_opt = processes.get(server_id).copied();

        if let Some(pid) = pid_opt {
            let mut kill_cmd = std::process::Command::new("taskkill");
            kill_cmd
                .args(["/F", "/T", "/PID", &pid.to_string()])
                .creation_flags(CREATE_NO_WINDOW);
            let output = kill_cmd
                .output()
                .map_err(|e| format!("Erreur d'exécution de taskkill: {}", e))?;
            if !output.status.success() {
                return Err(format!(
                    "Échec de l'arrêt du processus {}: {}",
                    pid,
                    String::from_utf8_lossy(&output.stderr).trim()
                ));
            }
            processes.remove(server_id);
            drop(processes);
            let _ = app.emit(
                "server-status-changed",
                StatusPayload {
                    server_id: server_id.to_string(),
                    state: "stopped".to_string(),
                    pid: None,
                    intentional: true,
                    exit_code: None,
                    exit_error: None,
                },
            );
            Ok(())
        } else {
            Err("Ce serveur n'est pas en cours d'exécution.".to_string())
        }
    }

    pub fn stop_all_servers(&self) {
        let mut processes = self.processes.lock();
        for (_id, pid) in processes.drain() {
            let mut kill_cmd = std::process::Command::new("taskkill");
            kill_cmd
                .args(["/F", "/T", "/PID", &pid.to_string()])
                .creation_flags(CREATE_NO_WINDOW);
            let _ = kill_cmd.output();
        }
    }

    pub fn is_running(&self, server_id: &str) -> bool {
        let processes = self.processes.lock();
        processes.contains_key(server_id)
    }

    pub fn get_active_pids(&self) -> HashMap<String, u32> {
        let processes = self.processes.lock();
        processes.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn late_exit_does_not_remove_a_replacement_process() {
        let mut running = HashMap::from([("server".to_string(), 222)]);
        assert!(!remove_owned_process(&mut running, "server", 111));
        assert_eq!(running["server"], 222);
        assert!(remove_owned_process(&mut running, "server", 222));
        assert!(running.is_empty());
        assert!(!remove_owned_process(&mut running, "server", 222));
    }
}
