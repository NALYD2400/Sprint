//! Intégrations avec Windows et les outils de l'utilisateur : éditeur, explorateur, navigateur,
//! notifications et démarrage automatique.

use crate::config_store;
use crate::CREATE_NO_WINDOW;
use std::os::windows::process::CommandExt;
use tauri::AppHandle;
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_notification::NotificationExt;

/// Le chemin est transmis à `cmd /C` : on refuse les dossiers inexistants et les caractères
/// que cmd interprète, pour qu'aucune commande ne puisse être injectée dans l'argument.
fn is_safe_cmd_path(path: &str) -> bool {
    !path.is_empty()
        && !path.contains(['"', '&', '|', '<', '>', '^', '%', '!'])
        && std::path::Path::new(path).is_dir()
}

#[tauri::command]
pub async fn open_vscode(path: String) -> Result<(), String> {
    if !is_safe_cmd_path(&path) {
        return Err("Dossier de projet introuvable ou chemin non pris en charge.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        // `code` est un script `code.cmd` : il n'est trouvé que via cmd.exe, pas par CreateProcess.
        let output = std::process::Command::new("cmd")
            .args(["/C", "code"])
            .arg(&path)
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| format!("Impossible de lancer cmd.exe: {}", e))?;
        if output.status.success() {
            Ok(())
        } else {
            Err(format!(
                "Impossible de lancer VS Code ('code' dans le PATH ?): {}",
                String::from_utf8_lossy(&output.stderr).trim()
            ))
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn open_explorer(path: String) -> Result<(), String> {
    std::process::Command::new("explorer")
        .arg(&path)
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_local_ip_cmd() -> String {
    if let Ok(socket) = std::net::UdpSocket::bind("0.0.0.0:0") {
        if socket.connect("8.8.8.8:80").is_ok() {
            if let Ok(addr) = socket.local_addr() {
                return addr.ip().to_string();
            }
        }
    }
    "127.0.0.1".to_string()
}

#[tauri::command]
pub fn open_config_dir_cmd() -> Result<String, String> {
    let dir = config_store::get_config_dir();
    let dir_str = dir.to_string_lossy().to_string();
    std::process::Command::new("explorer")
        .arg(&dir)
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(dir_str)
}

#[tauri::command]
pub fn open_browser(url: String) -> Result<(), String> {
    let lower = url.to_lowercase();
    if !lower.starts_with("http://") && !lower.starts_with("https://") {
        return Err("Seules les URLs http(s) peuvent être ouvertes.".into());
    }
    open::that(url).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn send_windows_notification(app: AppHandle, title: String, body: String) {
    let _ = app.notification().builder().title(title).body(body).show();
}

#[tauri::command]
pub fn set_autostart_cmd(app: AppHandle, enable: bool) -> Result<(), String> {
    if enable {
        app.autolaunch().enable().map_err(|e| e.to_string())
    } else {
        app.autolaunch().disable().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn is_autostart_cmd(app: AppHandle) -> Result<bool, String> {
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::is_safe_cmd_path;

    #[test]
    fn cmd_paths_must_be_existing_directories_without_shell_metacharacters() {
        let dir = std::env::temp_dir();
        assert!(is_safe_cmd_path(&dir.to_string_lossy()));
        assert!(!is_safe_cmd_path(&dir.join("missing-folder").to_string_lossy()));
        assert!(!is_safe_cmd_path(&format!("{}\\x&calc", dir.display())));
        assert!(!is_safe_cmd_path("\"C:\\a\" & calc"));
        assert!(!is_safe_cmd_path(""));
    }
}
