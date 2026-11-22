//! Tunnels publics localtunnel : un process par port, arrêt explicite, nettoyage à la fermeture.

use crate::{port_inspector::kill_pid, CREATE_NO_WINDOW};
use parking_lot::Mutex;
use serde::Serialize;
use std::process::Stdio;
use std::time::Duration;

/// Version épinglée : `npx -y localtunnel` sans version téléchargerait la dernière à chaque appel.
const LOCALTUNNEL_VERSION: &str = "2.0.2";

struct Tunnel {
    port: u16,
    pid: u32,
    url: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct TunnelInfo {
    pub port: u16,
    pub url: Option<String>,
}

#[derive(Default)]
struct Tunnels {
    processes: Vec<Tunnel>,
    closing: bool,
}

static TUNNELS: Mutex<Tunnels> = Mutex::new(Tunnels {
    processes: Vec::new(),
    closing: false,
});

fn tunnel_url_from_line(line: &str) -> Option<String> {
    let url = line.split("your url is:").nth(1)?.trim();
    url.starts_with("https://").then(|| url.to_string())
}

fn forget_tunnel(pid: u32) {
    TUNNELS.lock().processes.retain(|tunnel| tunnel.pid != pid);
}

impl Tunnels {
    fn stop(
        &mut self,
        index: usize,
        kill: impl FnOnce(u32) -> Result<(), String>,
    ) -> Result<(), String> {
        let tunnel = &self.processes[index];
        kill(tunnel.pid).map_err(|error| {
            format!(
                "Impossible d’arrêter le tunnel du port {} : {error}",
                tunnel.port
            )
        })?;
        self.processes.remove(index);
        Ok(())
    }
}

pub fn stop_all_tunnels() -> Result<(), String> {
    let mut tunnels = TUNNELS.lock();
    let mut errors = Vec::new();
    for index in (0..tunnels.processes.len()).rev() {
        if let Err(error) = tunnels.stop(index, kill_pid) {
            errors.push(error);
        }
    }
    if !errors.is_empty() {
        return Err(errors.join("\n"));
    }
    tunnels.closing = true;
    Ok(())
}

pub fn cancel_shutdown() {
    TUNNELS.lock().closing = false;
}

#[tauri::command]
pub fn list_tunnels_cmd() -> Vec<TunnelInfo> {
    TUNNELS
        .lock()
        .processes
        .iter()
        .map(|tunnel| TunnelInfo {
            port: tunnel.port,
            url: tunnel.url.clone(),
        })
        .collect()
}

#[tauri::command]
pub async fn stop_localtunnel_cmd(port: u16) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut tunnels = TUNNELS.lock();
        let index = tunnels
            .processes
            .iter()
            .position(|tunnel| tunnel.port == port)
            .ok_or("Aucun tunnel actif sur ce port.")?;
        tunnels.stop(index, kill_pid)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn start_localtunnel_cmd(port: u16) -> Result<String, String> {
    let (pid, mut child) = {
        let mut tunnels = TUNNELS.lock();
        if tunnels.closing {
            return Err("Sprint est en cours de fermeture.".into());
        }
        if let Some(tunnel) = tunnels.processes.iter().find(|tunnel| tunnel.port == port) {
            return tunnel.url.clone().ok_or_else(|| {
                "Un tunnel est déjà en cours de création ou d’arrêt sur ce port.".into()
            });
        }

        let mut cmd = tokio::process::Command::new("cmd.exe");
        cmd.arg("/C").arg(format!(
            "npx -y localtunnel@{LOCALTUNNEL_VERSION} --port {port}"
        ));
        cmd.creation_flags(CREATE_NO_WINDOW);
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::null());

        let child = cmd.spawn().map_err(|error| {
            format!("Impossible de lancer npx (Node.js est-il installé ?) : {error}")
        })?;
        let pid = child.id().ok_or("Impossible d'obtenir le PID du tunnel")?;
        tunnels.processes.push(Tunnel {
            port,
            pid,
            url: None,
        });
        (pid, child)
    };

    let stdout = child.stdout.take();
    tauri::async_runtime::spawn(async move {
        if child.wait().await.is_ok() {
            forget_tunnel(pid);
        }
    });
    let (tx, rx) = tokio::sync::oneshot::channel();
    tauri::async_runtime::spawn(async move {
        use tokio::io::{AsyncBufReadExt, BufReader};
        let result = async {
            let stdout = stdout.ok_or("Sortie du tunnel indisponible.")?;
            let mut reader = BufReader::new(stdout).lines();
            let read_url = async {
                while let Some(line) = reader
                    .next_line()
                    .await
                    .map_err(|error| error.to_string())?
                {
                    if let Some(url) = tunnel_url_from_line(&line) {
                        return Ok(url);
                    }
                }
                Err::<String, String>(
                    "localtunnel s’est arrêté avant de communiquer son URL.".into(),
                )
            };
            let url = tokio::time::timeout(Duration::from_secs(20), read_url)
                .await
                .map_err(|_| "localtunnel n’a pas communiqué d’URL dans les 20 secondes.")??;
            {
                let mut tunnels = TUNNELS.lock();
                let tunnel = tunnels
                    .processes
                    .iter_mut()
                    .find(|tunnel| tunnel.pid == pid)
                    .ok_or("Le tunnel s’est arrêté pendant le démarrage.")?;
                tunnel.url = Some(url.clone());
            }
            Ok::<_, String>((url, reader))
        }
        .await;

        let error = match result {
            Ok((url, mut reader)) => {
                if tx.send(Ok(url)).is_ok() {
                    while matches!(reader.next_line().await, Ok(Some(_))) {}
                    return;
                }
                let _ = stop_failed_start(pid).await;
                return;
            }
            Err(error) => error,
        };
        let error = match stop_failed_start(pid).await {
            Ok(()) => error,
            Err(reason) => format!("{error} {reason}"),
        };
        let _ = tx.send(Err(error));
    });
    rx.await
        .map_err(|_| "Le démarrage du tunnel a été interrompu.".to_string())?
}

async fn stop_failed_start(pid: u32) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut tunnels = TUNNELS.lock();
        if let Some(index) = tunnels
            .processes
            .iter()
            .position(|tunnel| tunnel.pid == pid)
        {
            tunnels.stop(index, kill_pid)?;
        }
        Ok(())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::{tunnel_url_from_line, Tunnel, Tunnels};

    #[test]
    fn failed_stop_retains_the_tunnel_for_another_attempt() {
        let mut tunnels = Tunnels {
            processes: vec![Tunnel {
                port: 3000,
                pid: 1234,
                url: Some("https://sprint.loca.lt".into()),
            }],
            closing: false,
        };
        let error = tunnels.stop(0, |_| Err("accès refusé".into())).unwrap_err();
        assert!(error.contains("3000"));
        assert!(error.contains("accès refusé"));
        assert_eq!(
            tunnels.processes[0].url.as_deref(),
            Some("https://sprint.loca.lt")
        );
        tunnels
            .stop(0, |pid| {
                assert_eq!(pid, 1234);
                Ok(())
            })
            .unwrap();
        assert!(tunnels.processes.is_empty());
    }

    #[test]
    fn reads_the_https_url_and_ignores_other_lines() {
        assert_eq!(
            tunnel_url_from_line("your url is: https://sprint.loca.lt"),
            Some("https://sprint.loca.lt".into())
        );
        assert_eq!(
            tunnel_url_from_line("your url is: http://insecure.example"),
            None
        );
        assert_eq!(tunnel_url_from_line("still connecting"), None);
    }
}
