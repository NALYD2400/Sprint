//! Tunnels publics localtunnel : un process par port, arrêt explicite, nettoyage à la fermeture.

use crate::CREATE_NO_WINDOW;
use parking_lot::Mutex;
use serde::Serialize;
use std::os::windows::process::CommandExt;
use std::process::Stdio;
use std::time::Duration;

/// Version épinglée : `npx -y localtunnel` sans version téléchargerait la dernière à chaque appel.
const LOCALTUNNEL_VERSION: &str = "2.0.2";

struct ActiveTunnel {
    port: u16,
    pid: u32,
    url: String,
}

#[derive(Clone, Serialize)]
pub struct TunnelInfo {
    pub port: u16,
    pub url: String,
}

static TUNNELS: Mutex<Vec<ActiveTunnel>> = Mutex::new(Vec::new());
static STARTING: Mutex<Vec<u16>> = Mutex::new(Vec::new());

fn tunnel_url_from_line(line: &str) -> Option<String> {
    let url = line.split("your url is:").nth(1)?.trim();
    url.starts_with("https://").then(|| url.to_string())
}

fn kill_pid(pid: u32) {
    if pid == 0 {
        return;
    }
    let mut command = std::process::Command::new("taskkill");
    command
        .args(["/F", "/T", "/PID", &pid.to_string()])
        .creation_flags(CREATE_NO_WINDOW);
    let _ = command.output();
}

fn forget_tunnel(pid: u32) {
    TUNNELS.lock().retain(|tunnel| tunnel.pid != pid);
}

/// `Some(url)` si ce port a déjà un tunnel. `None` si le démarrage est réservé.
fn begin_start(port: u16) -> Result<Option<String>, String> {
    let tunnels = TUNNELS.lock();
    if let Some(url) = tunnels.iter().find(|tunnel| tunnel.port == port).map(|tunnel| tunnel.url.clone()) {
        return Ok(Some(url));
    }
    drop(tunnels);
    let mut starting = STARTING.lock();
    if starting.contains(&port) {
        return Err("Un tunnel est déjà en cours de création pour ce port.".into());
    }
    starting.push(port);
    Ok(None)
}

fn end_start(port: u16) {
    STARTING.lock().retain(|item| *item != port);
}

pub fn stop_all_tunnels() {
    let pids: Vec<u32> = {
        let mut tunnels = TUNNELS.lock();
        tunnels.drain(..).map(|tunnel| tunnel.pid).collect()
    };
    for pid in pids {
        kill_pid(pid);
    }
}

#[tauri::command]
pub fn list_tunnels_cmd() -> Vec<TunnelInfo> {
    TUNNELS
        .lock()
        .iter()
        .map(|tunnel| TunnelInfo {
            port: tunnel.port,
            url: tunnel.url.clone(),
        })
        .collect()
}

#[tauri::command]
pub fn stop_localtunnel_cmd(port: u16) -> Result<(), String> {
    let pid = {
        let mut tunnels = TUNNELS.lock();
        let index = tunnels.iter().position(|tunnel| tunnel.port == port);
        match index {
            Some(index) => tunnels.remove(index).pid,
            None => return Err("Aucun tunnel actif sur ce port.".into()),
        }
    };
    kill_pid(pid);
    Ok(())
}

#[tauri::command]
pub async fn start_localtunnel_cmd(port: u16) -> Result<String, String> {
    if let Some(url) = begin_start(port)? {
        return Ok(url);
    }
    let result = open_tunnel(port).await;
    end_start(port);
    result
}

async fn open_tunnel(port: u16) -> Result<String, String> {
    let mut cmd = tokio::process::Command::new("cmd.exe");
    cmd.arg("/C")
        .arg(format!("npx -y localtunnel@{LOCALTUNNEL_VERSION} --port {port}"));
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::null());

    let mut child = cmd.spawn().map_err(|error| {
        format!("Impossible de lancer npx (Node.js est-il installé ?) : {error}")
    })?;
    let pid = child.id().ok_or("Impossible d'obtenir le PID du tunnel")?;
    let stdout = child.stdout.take().ok_or("Sortie du tunnel indisponible")?;

    let (tx, rx) = tokio::sync::oneshot::channel();
    tauri::async_runtime::spawn(async move {
        use tokio::io::{AsyncBufReadExt, BufReader};
        let mut reader = BufReader::new(stdout).lines();
        let mut announce = Some(tx);
        let started = tokio::time::Instant::now();
        loop {
            let waiting = announce.is_some();
            let next = if !waiting {
                reader.next_line().await
            } else {
                let left = Duration::from_secs(20).saturating_sub(started.elapsed());
                if left.is_zero() {
                    if let Some(sender) = announce.take() {
                        let _ = sender.send(None);
                    }
                    break;
                }
                match tokio::time::timeout(left, reader.next_line()).await {
                    Ok(line) => line,
                    Err(_) => {
                        if let Some(sender) = announce.take() {
                            let _ = sender.send(None);
                        }
                        break;
                    }
                }
            };
            match next {
                Ok(Some(line)) => {
                    if let Some(url) = tunnel_url_from_line(&line) {
                        if let Some(sender) = announce.take() {
                            TUNNELS.lock().push(ActiveTunnel {
                                port,
                                pid,
                                url: url.clone(),
                            });
                            if sender.send(Some(url)).is_err() {
                                forget_tunnel(pid);
                                kill_pid(pid);
                                break;
                            }
                        }
                    }
                }
                _ => {
                    if let Some(sender) = announce.take() {
                        let _ = sender.send(None);
                    }
                    break;
                }
            }
        }
        let got_url = announce.is_none();
        if !got_url {
            kill_pid(pid);
            forget_tunnel(pid);
        }
    });
    tauri::async_runtime::spawn(async move {
        let _ = child.wait().await;
        forget_tunnel(pid);
    });

    match rx.await {
        Ok(Some(url)) => Ok(url),
        _ => {
            kill_pid(pid);
            forget_tunnel(pid);
            Err("localtunnel n'a pas renvoyé d'URL (délai 20 s dépassé). Vérifiez que npx et Node.js sont installés.".into())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::tunnel_url_from_line;

    #[test]
    fn reads_the_https_url_and_ignores_other_lines() {
        assert_eq!(
            tunnel_url_from_line("your url is: https://sprint.loca.lt"),
            Some("https://sprint.loca.lt".into())
        );
        assert_eq!(tunnel_url_from_line("your url is: http://insecure.example"), None);
        assert_eq!(tunnel_url_from_line("still connecting"), None);
    }
}
