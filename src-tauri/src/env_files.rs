//! Lecture et écriture des fichiers `.env` d'un projet.

use crate::config_store;

#[tauri::command]
pub async fn list_env_files_cmd(project_root: String) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = std::path::Path::new(&project_root);
        if path.exists() {
            Ok(config_store::list_env_files_in_dir(path))
        } else {
            Ok(vec![".env".to_string()])
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

fn sanitize_env_filename(file_name: Option<String>) -> Result<String, String> {
    let name = file_name.unwrap_or_else(|| ".env".to_string());
    let trimmed = name.trim();
    // Un seul composant « normal » : pas de séparateur, de préfixe de lecteur (« C: ») ni de « .. ».
    let is_single_component = {
        let mut components = std::path::Path::new(trimmed).components();
        matches!(components.next(), Some(std::path::Component::Normal(_))) && components.next().is_none()
    };
    if !is_single_component
        || trimmed.contains("..")
        || trimmed.contains(':')
        || (!trimmed.starts_with(".env") && !trimmed.ends_with(".env"))
    {
        return Err("Nom de fichier d'environnement non autorisé.".to_string());
    }
    Ok(trimmed.to_string())
}

#[tauri::command]
pub async fn read_env_file(project_root: String, file_name: Option<String>) -> Result<String, String> {
    let sanitized_name = sanitize_env_filename(file_name)?;
    tauri::async_runtime::spawn_blocking(move || {
        let path = std::path::Path::new(&project_root).join(sanitized_name);
        if path.exists() {
            std::fs::read_to_string(path).map_err(|e| e.to_string())
        } else {
            Ok(String::new())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn save_env_file(
    project_root: String,
    file_name: Option<String>,
    content: String,
) -> Result<(), String> {
    let sanitized_name = sanitize_env_filename(file_name)?;
    tauri::async_runtime::spawn_blocking(move || {
        let path = std::path::Path::new(&project_root).join(sanitized_name);
        config_store::atomic_write_without_backup(&path, &content)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::sanitize_env_filename;

    #[test]
    fn accepts_plain_env_file_names() {
        assert_eq!(sanitize_env_filename(None).unwrap(), ".env");
        assert_eq!(sanitize_env_filename(Some(".env.local".into())).unwrap(), ".env.local");
        assert_eq!(sanitize_env_filename(Some("prod.env".into())).unwrap(), "prod.env");
    }

    #[test]
    fn rejects_paths_and_drive_prefixes() {
        for bad in ["../.env", "sub/.env", "sub\\.env", "C:.env", "C:x.env", "/abs.env", "notes.txt", "..env"] {
            assert!(sanitize_env_filename(Some(bad.into())).is_err(), "{bad} should be rejected");
        }
    }
}
