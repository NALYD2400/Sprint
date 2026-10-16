//! Tunnels publics localtunnel : partage d'un port local, nettoyés à la fermeture de Sprint.

use crate::CREATE_NO_WINDOW;
use parking_lot::Mutex;
use std::os::windows::process::CommandExt;

/// Version épinglée de localtunnel : `npx -y localtunnel` téléchargerait la dernière version à chaque appel.
const LOCALTUNNEL_VERSION: &str = "2.0.2";

/// PIDs des tunnels localtunnel actifs, pour les nettoyer à la fermeture.
static TUNNEL_PIDS: Mutex<Vec<u32>> = Mutex::new(Vec::new());

pub fn stop_all_tunnels() {
    let pids: Vec<u32> = {
        let mut guard = TUNNEL_PIDS.lock();
        std::mem::take(&mut *guard)
    };
    for pid in pids {
        let mut c = std::process::Command::new("taskkill");
        c.args(["/F", "/T", "/PID", &pid.to_string()])
            .creation_flags(CREATE_NO_WINDOW);
        let _ = c.output();
    }
}

#[tauri::command]
pub async fn start_localtunnel_cmd(port: u16) -> Result<String, String> {
    let mut cmd = tokio::process::Command::new("cmd.exe");
    cmd.arg("/C")
        .arg(format!("npx -y localtunnel@{} --port {}", LOCALTUNNEL_VERSION, port));
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd.stdout(std::process::Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| {
        format!(
            "Impossible de lancer npx (Node.js est-il installé ?): {}",
            e
        )
    })?;

    let pid = child.id().unwrap_or(0);
    if pid > 0 {
        TUNNEL_PIDS.lock().push(pid);
    }

    if let Some(stdout) = child.stdout.take() {
        use tokio::io::{AsyncBufReadExt, BufReader};
        let mut reader = BufReader::new(stdout).lines();
        let timeout = tokio::time::sleep(tokio::time::Duration::from_secs(20));
        tokio::pin!(timeout);

        loop {
            tokio::select! {
                line = reader.next_line() => {
                    match line {
                        Ok(Some(line_text)) => {
                            if line_text.contains("your url is:") {
                                let url = line_text.replace("your url is:", "").trim().to_string();
                                if url.starts_with("https://") {
                                    return Ok(url);
                                }
                            }
                        }
                        _ => break,
                    }
                }
                _ = &mut timeout => break,
            }
        }
    }

    let _ = child.start_kill();
    if pid > 0 {
        TUNNEL_PIDS.lock().retain(|&p| p != pid);
    }
    Err("localtunnel n'a pas renvoyé d'URL (délai 20s dépassé). Vérifiez que npx et Node.js sont installés.".into())
}
