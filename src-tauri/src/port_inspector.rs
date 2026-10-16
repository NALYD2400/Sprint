//! Inspection des ports TCP en écoute et arrêt des processus qui les occupent.

use crate::CREATE_NO_WINDOW;
use netstat2::{AddressFamilyFlags, ProtocolFlags, ProtocolSocketInfo, TcpState};
use serde::Serialize;
use std::collections::HashMap;
use std::os::windows::process::CommandExt;
use std::process::Command;
use sysinfo::{ProcessRefreshKind, RefreshKind, System};

#[derive(Debug, Clone, Serialize)]
pub struct PortEntry {
    pub protocol: String,
    pub local_address: String,
    pub port: u16,
    pub pid: u32,
    pub process_name: String,
}

/// Processus système qu'un clic « Arrêter » sur un port ne doit jamais interrompre.
const PROTECTED_PROCESSES: &[&str] = &[
    "system", "smss", "csrss", "wininit", "winlogon", "services", "lsass", "svchost",
    "fontdrvhost", "dwm", "explorer", "sihost", "spoolsv", "registry", "memory compression",
];

/// Vrai si le processus est un composant système (ou un nom inconnu, impossible à vérifier).
fn is_protected_process(process_name: &str) -> bool {
    let lower = process_name.trim().to_ascii_lowercase();
    let name = lower.trim_end_matches(".exe");
    name.is_empty() || name == "unknown" || PROTECTED_PROCESSES.contains(&name)
}

/// Liste les ports TCP en écoute via l'API native Windows (GetExtendedTcpTable),
/// indépendamment de la langue du système (netstat affiche "ÉCOUTE" en français).
pub fn get_active_ports() -> Result<Vec<PortEntry>, String> {
    let process_map = get_all_process_names();

    let af_flags = AddressFamilyFlags::IPV4 | AddressFamilyFlags::IPV6;
    let proto_flags = ProtocolFlags::TCP;
    let sockets_info = netstat2::get_sockets_info(af_flags, proto_flags)
        .map_err(|e| format!("Erreur scan des ports système: {}", e))?;

    let mut entries: Vec<PortEntry> = Vec::new();

    for socket in sockets_info {
        let tcp = match socket.protocol_socket_info {
            ProtocolSocketInfo::Tcp(tcp) => tcp,
            _ => continue,
        };

        if tcp.state != TcpState::Listen {
            continue;
        }

        let pid = socket.associated_pids.first().copied().unwrap_or(0);
        if pid == 0 {
            continue;
        }

        let proc_name = process_map
            .get(&pid)
            .cloned()
            .unwrap_or_else(|| "Unknown".to_string());

        entries.push(PortEntry {
            protocol: "TCP".to_string(),
            local_address: format!("[{}]:{}", tcp.local_addr, tcp.local_port),
            port: tcp.local_port,
            pid,
            process_name: proc_name,
        });
    }

    entries.sort_by_key(|e| e.port);
    entries.dedup_by_key(|e| (e.port, e.pid));
    Ok(entries)
}

/// Associe les PID aux noms de processus via sysinfo (remplace le parsing
/// localisé et fragile de `tasklist /FO CSV`).
fn get_all_process_names() -> HashMap<u32, String> {
    let sys = System::new_with_specifics(
        RefreshKind::new().with_processes(ProcessRefreshKind::everything()),
    );

    sys.processes()
        .iter()
        .map(|(pid, process)| {
            let name = process
                .exe()
                .and_then(|p| p.file_stem())
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| process.name().to_string());
            (pid.as_u32(), name)
        })
        .collect()
}

/// Tue un process et tout son arbre (/T), en propageant l'erreur.
pub fn kill_pid(pid: u32) -> Result<(), String> {
    let output = Command::new("taskkill")
        .args(["/F", "/T", "/PID", &pid.to_string()])
        .creation_flags(CREATE_NO_WINDOW)
        .output();

    match output {
        Ok(out) if out.status.success() => Ok(()),
        Ok(out) => Err(String::from_utf8_lossy(&out.stderr).trim().to_string()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub async fn get_ports_cmd() -> Result<Vec<PortEntry>, String> {
    tauri::async_runtime::spawn_blocking(get_active_ports)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn kill_port_cmd(pid: u32) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        // PID 0/4 (système) et Sprint lui-même ne doivent jamais être tués depuis l'UI.
        if pid <= 4 || pid == std::process::id() {
            return Err("Ce processus ne peut pas être arrêté depuis Sprint.".to_string());
        }
        // Seul un PID qui écoute actuellement un port peut être tué.
        let entries = get_active_ports()?;
        let Some(entry) = entries.iter().find(|entry| entry.pid == pid) else {
            return Err("Ce processus n'écoute plus de port.".to_string());
        };
        // Les services Windows (svchost, lsass…) hébergent souvent des ports : on ne les arrête jamais.
        if is_protected_process(&entry.process_name) {
            return Err(format!(
                "« {} » est un processus protégé : Sprint ne peut pas l'arrêter.",
                entry.process_name
            ));
        }
        kill_pid(pid)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn ping_port_cmd(port: u16) -> Result<bool, String> {
    let addr_v4 = format!("127.0.0.1:{}", port);
    if let Ok(Ok(_)) = tokio::time::timeout(
        std::time::Duration::from_millis(400),
        tokio::net::TcpStream::connect(&addr_v4),
    )
    .await
    {
        return Ok(true);
    }

    let addr_v6 = format!("[::1]:{}", port);
    if let Ok(Ok(_)) = tokio::time::timeout(
        std::time::Duration::from_millis(400),
        tokio::net::TcpStream::connect(&addr_v6),
    )
    .await
    {
        return Ok(true);
    }

    Ok(false)
}

#[cfg(test)]
mod tests {
    use super::is_protected_process;

    #[test]
    fn system_processes_cannot_be_stopped_from_the_port_view() {
        assert!(is_protected_process("svchost"));
        assert!(is_protected_process("svchost.exe"));
        assert!(is_protected_process("LSASS.EXE"));
        assert!(is_protected_process("Unknown"));
        assert!(!is_protected_process("node"));
        assert!(!is_protected_process("python"));
    }
}
