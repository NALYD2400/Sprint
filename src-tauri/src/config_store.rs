use crate::project_lock::ProjectLock;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
static CONFIG_WRITE_LOCK: parking_lot::Mutex<()> = parking_lot::Mutex::new(());

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    #[serde(default = "default_hex")]
    pub custom_hex: String,
    #[serde(default = "default_true")]
    pub canvas_bg: bool,
    #[serde(default = "default_false")]
    pub auto_restart: bool,
    #[serde(default = "default_true")]
    pub hide_stopped_servers: bool,
    #[serde(default = "default_true")]
    pub clean_ansi_logs: bool,
    #[serde(default = "default_true")]
    pub minimize_to_tray: bool,
    #[serde(default = "default_true")]
    pub notif_windows: bool,
    #[serde(default = "default_true")]
    pub notif_app: bool,
    #[serde(default = "default_shortcut")]
    pub global_shortcut: String,
    #[serde(default = "default_false")]
    pub autostart: bool,
}

fn default_hex() -> String {
    "#a855f7".to_string()
}
fn default_shortcut() -> String {
    "Ctrl+Alt+P".to_string()
}
fn default_true() -> bool {
    true
}
fn default_false() -> bool {
    false
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            custom_hex: default_hex(),
            canvas_bg: true,
            auto_restart: false,
            hide_stopped_servers: true,
            clean_ansi_logs: true,
            minimize_to_tray: true,
            notif_windows: true,
            notif_app: true,
            global_shortcut: default_shortcut(),
            autostart: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    pub id: String,
    pub name: String,
    pub command: String,
    pub port: u16,
    pub state: String,
    #[serde(default)]
    pub env: std::collections::HashMap<String, String>,
    #[serde(rename = "ramLimit", default)]
    pub ram_limit: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectConfig {
    pub id: String,
    pub name: String,
    pub root: String,
    pub color: String,
    #[serde(default)]
    pub framework: Option<String>,
    #[serde(default)]
    pub branch: Option<String>,
    #[serde(default)]
    pub servers: Vec<ServerConfig>,
}

#[derive(Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub(crate) enum ProjectChange {
    AddProject {
        project: ProjectConfig,
    },
    EditProject {
        project_id: String,
        name: Option<String>,
        color: Option<String>,
    },
    RemoveProject {
        project_id: String,
    },
    AddServer {
        project_id: String,
        server: ServerConfig,
    },
    EditServer {
        project_id: String,
        server_id: String,
        name: Option<String>,
        command: Option<String>,
        port: Option<u16>,
        #[serde(default, deserialize_with = "ram_limit_patch")]
        ram_limit: Option<Option<u32>>,
    },
    RemoveServer {
        project_id: String,
        server_id: String,
    },
}

fn ram_limit_patch<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<Option<u32>>, D::Error> {
    Option::<u32>::deserialize(deserializer).map(Some)
}

pub fn get_config_dir() -> PathBuf {
    let base = dirs_next::config_dir().unwrap_or_else(|| PathBuf::from("."));
    let dir = base.join("sprint");
    if !dir.exists() {
        let legacy = base.join("portly");
        if legacy.exists() {
            let _ = fs::create_dir_all(&dir);
            let projects_file = dir.join("projects.json");
            if let Ok(_guard) = ProjectLock::acquire(&projects_file) {
                if !projects_file.exists() {
                    if let Ok(content) = fs::read_to_string(legacy.join("projects.json")) {
                        let _ = atomic_write(&projects_file, &content);
                    }
                }
            }
            if let Ok(content) = fs::read_to_string(legacy.join("settings.json")) {
                let _ = fs::write(dir.join("settings.json"), content);
            }
        }
    }
    let _ = fs::create_dir_all(&dir);
    dir
}

pub fn get_projects_file() -> PathBuf {
    get_config_dir().join("projects.json")
}

pub fn get_settings_file() -> PathBuf {
    get_config_dir().join("settings.json")
}

pub fn get_crash_log_file() -> PathBuf {
    get_config_dir().join("crash.log")
}

/// Écriture atomique : écrit dans un fichier temporaire puis renomme.
/// Ajoute un suffixe au nom complet (`.env.local` → `.env.local.bak`).
/// `with_extension` remplacerait l'extension et ferait collisionner `.env` et `.env.local`.
pub fn with_suffix(path: &Path, suffix: &str) -> PathBuf {
    let mut name = path.file_name().unwrap_or_default().to_os_string();
    name.push(".");
    name.push(suffix);
    path.with_file_name(name)
}

pub fn atomic_write(path: &Path, contents: &str) -> Result<(), String> {
    write_atomically(path, contents, true)
}

/// Comme `atomic_write`, sans copie `.bak` : les fichiers `.env` contiennent des secrets
/// et ne doivent pas être dupliqués à côté du projet.
pub fn atomic_write_without_backup(path: &Path, contents: &str) -> Result<(), String> {
    write_atomically(path, contents, false)
}

fn write_atomically(path: &Path, contents: &str, keep_backup: bool) -> Result<(), String> {
    let _write_guard = CONFIG_WRITE_LOCK.lock();
    let tmp_path = with_suffix(path, "tmp");

    let result = (|| {
        fs::write(&tmp_path, contents)
            .map_err(|e| format!("Erreur écriture {}: {}", tmp_path.display(), e))?;
        if keep_backup && path.exists() {
            let bak_path = with_suffix(path, "bak");
            fs::copy(path, &bak_path)
                .map_err(|e| format!("Erreur sauvegarde {}: {}", bak_path.display(), e))?;
        }
        fs::rename(&tmp_path, path)
            .map_err(|e| format!("Erreur finalisation {}: {}", path.display(), e))
    })();

    if result.is_err() {
        let _ = fs::remove_file(&tmp_path);
    }
    result
}

pub fn load_projects() -> Vec<ProjectConfig> {
    let file = get_projects_file();
    match read_projects(&file) {
        Ok(projects) => projects,
        Err(error) if error.kind() == ErrorKind::InvalidData => {
            // Relire sous verrou avant de déplacer le fichier : MCP a pu le remplacer.
            let Ok(_guard) = ProjectLock::acquire(&file) else {
                return Vec::new();
            };
            match read_projects(&file) {
                Ok(projects) => projects,
                Err(error) if error.kind() == ErrorKind::InvalidData => {
                    let stamp = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_nanos();
                    let quarantine = file.with_file_name(format!("projects.corrupt-{stamp}.json"));
                    match fs::rename(&file, &quarantine) {
                        Ok(()) => eprintln!(
                            "Sprint: catalogue illisible ({error}), déplacé dans {}",
                            quarantine.display()
                        ),
                        Err(reason) => eprintln!(
                            "Sprint: impossible d’isoler le catalogue illisible : {reason}"
                        ),
                    }
                    Vec::new()
                }
                Err(error) => {
                    eprintln!("Sprint: impossible de lire le catalogue : {error}");
                    Vec::new()
                }
            }
        }
        Err(error) => {
            eprintln!("Sprint: impossible de lire le catalogue : {error}");
            Vec::new()
        }
    }
}

fn read_projects(file: &Path) -> std::io::Result<Vec<ProjectConfig>> {
    let contents = match fs::read_to_string(file) {
        Ok(contents) => contents,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error),
    };
    let mut projects: Vec<ProjectConfig> = serde_json::from_str(&contents)
        .map_err(|error| std::io::Error::new(ErrorKind::InvalidData, error))?;
    for server in projects.iter_mut().flat_map(|project| &mut project.servers) {
        server.state = "stopped".into();
        if server.ram_limit == Some(0) {
            server.ram_limit = None;
        }
    }
    Ok(projects)
}

/// Réservé à la restauration explicite d'une sauvegarde.
pub fn save_projects(projects: &[ProjectConfig]) -> Result<(), String> {
    let file = get_projects_file();
    let _guard = ProjectLock::acquire(&file)?;
    persist_projects(&file, projects)
}

pub(crate) fn change_projects(change: ProjectChange) -> Result<Vec<ProjectConfig>, String> {
    change_projects_at(&get_projects_file(), change)
}

fn change_projects_at(file: &Path, change: ProjectChange) -> Result<Vec<ProjectConfig>, String> {
    let _guard = ProjectLock::acquire(file)?;
    let mut projects = read_projects(file)
        .map_err(|error| format!("Impossible de lire le catalogue Sprint : {error}"))?;
    apply_project_change(&mut projects, change)?;
    persist_projects(file, &projects)?;
    Ok(projects)
}

fn apply_project_change(
    projects: &mut Vec<ProjectConfig>,
    change: ProjectChange,
) -> Result<(), String> {
    fn find_project<'a>(
        projects: &'a mut [ProjectConfig],
        id: &str,
    ) -> Result<&'a mut ProjectConfig, String> {
        projects
            .iter_mut()
            .find(|project| project.id == id)
            .ok_or_else(|| "Ce projet ne figure plus dans Sprint.".into())
    }

    match change {
        ProjectChange::AddProject { project } => projects.push(project),
        ProjectChange::EditProject {
            project_id,
            name,
            color,
        } => {
            let project = find_project(projects, &project_id)?;
            if let Some(name) = name {
                project.name = name;
            }
            if let Some(color) = color {
                project.color = color;
            }
        }
        ProjectChange::RemoveProject { project_id } => {
            projects.retain(|project| project.id != project_id);
        }
        ProjectChange::AddServer { project_id, server } => {
            find_project(projects, &project_id)?.servers.push(server);
        }
        ProjectChange::EditServer {
            project_id,
            server_id,
            name,
            command,
            port,
            ram_limit,
        } => {
            let server = find_project(projects, &project_id)?
                .servers
                .iter_mut()
                .find(|server| server.id == server_id)
                .ok_or("Ce serveur ne figure plus dans Sprint.")?;
            if let Some(name) = name {
                server.name = name;
            }
            if let Some(command) = command {
                server.command = command;
            }
            if let Some(port) = port {
                server.port = port;
            }
            if let Some(ram_limit) = ram_limit {
                server.ram_limit = ram_limit;
            }
        }
        ProjectChange::RemoveServer {
            project_id,
            server_id,
        } => {
            if let Ok(project) = find_project(projects, &project_id) {
                project.servers.retain(|server| server.id != server_id);
            }
        }
    }
    Ok(())
}

fn persist_projects(file: &Path, projects: &[ProjectConfig]) -> Result<(), String> {
    validate_projects(projects)?;
    let json = serde_json::to_string_pretty(projects).map_err(|e| e.to_string())?;
    atomic_write(file, &json)
}

fn validate_projects(projects: &[ProjectConfig]) -> Result<(), String> {
    let mut project_ids = std::collections::HashSet::new();
    let mut server_ids = std::collections::HashSet::new();
    for project in projects {
        if project.id.trim().is_empty() || !project_ids.insert(&project.id) {
            return Err("Chaque projet doit avoir un identifiant unique.".to_string());
        }
        if project.name.trim().is_empty() || project.root.trim().is_empty() {
            return Err("Le nom et le dossier du projet sont obligatoires.".to_string());
        }
        for server in &project.servers {
            if server.id.trim().is_empty() || !server_ids.insert(&server.id) {
                return Err("Chaque serveur doit avoir un identifiant unique.".to_string());
            }
            if server.name.trim().is_empty() || server.command.trim().is_empty() {
                return Err("Le nom et la commande du serveur sont obligatoires.".to_string());
            }
            if server.ram_limit == Some(0) {
                return Err("La limite RAM doit être supérieure à zéro.".to_string());
            }
        }
    }
    Ok(())
}

pub fn get_shortcut_file() -> PathBuf {
    get_config_dir().join("shortcut.txt")
}

pub fn load_saved_shortcut() -> String {
    let file = get_shortcut_file();
    if file.exists() {
        if let Ok(content) = fs::read_to_string(&file) {
            let trimmed = content.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
    }
    "Ctrl+Alt+P".to_string()
}

pub fn save_saved_shortcut(shortcut: &str) -> Result<(), String> {
    atomic_write(&get_shortcut_file(), shortcut)
}

pub fn load_settings() -> AppSettings {
    let file = get_settings_file();
    if file.exists() {
        if let Ok(content) = fs::read_to_string(&file) {
            if let Ok(settings) = serde_json::from_str::<AppSettings>(&content) {
                return settings;
            }
        }
    }
    AppSettings {
        global_shortcut: load_saved_shortcut(),
        ..AppSettings::default()
    }
}

pub fn save_settings(settings: &AppSettings) -> Result<(), String> {
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    atomic_write(&get_settings_file(), &json)
}

pub fn list_env_files_in_dir(project_root: &Path) -> Vec<String> {
    let mut list = Vec::new();
    if let Ok(entries) = fs::read_dir(project_root) {
        for entry in entries.flatten() {
            if let Ok(file_name) = entry.file_name().into_string() {
                if file_name == ".env" || file_name.starts_with(".env.") {
                    list.push(file_name);
                }
            }
        }
    }
    if list.is_empty() {
        list.push(".env".to_string());
    } else {
        list.sort();
    }
    list
}

#[cfg(test)]
mod validation_tests {
    use super::*;
    fn project() -> ProjectConfig {
        serde_json::from_value(serde_json::json!({ "id": "project", "name": "Test", "root": "C:/test", "color": "#a855f7", "icon": "folder", "servers": [
            { "id": "server", "name": "Dev", "command": "npm run dev", "port": 3000, "state": "stopped", "healthy": false }
        ] })).unwrap()
    }
    #[test]
    fn imports_reject_duplicate_project_and_server_ids() {
        let first = project();
        assert!(validate_projects(std::slice::from_ref(&first)).is_ok());
        assert!(validate_projects(&[first.clone(), first.clone()]).is_err());
        let mut second = first.clone();
        second.id = "other-project".to_string();
        assert!(validate_projects(&[first, second]).is_err());
    }
    #[test]
    fn invalid_commands_and_memory_limits_are_rejected_without_writing_files() {
        let mut invalid = project();
        invalid.servers[0].command = " ".to_string();
        assert!(validate_projects(&[invalid]).is_err());
        let mut invalid = project();
        invalid.servers[0].ram_limit = Some(0);
        assert!(validate_projects(&[invalid]).is_err());
        assert!(validate_projects(&[]).is_ok());
    }

    #[test]
    fn edits_preserve_external_projects_and_untouched_server_fields() {
        let directory = tempfile::tempdir().unwrap();
        let file = directory.path().join("projects.json");
        let mut first = project();
        first.servers[0].port = 0;
        first.servers[0].ram_limit = None;
        let mut external = project();
        external.id = "mcp-project".into();
        external.servers[0].id = "mcp-server".into();
        persist_projects(&file, &[first, external]).unwrap();

        let edit = serde_json::from_value(serde_json::json!({
            "type": "editServer", "projectId": "project", "serverId": "server", "name": "Bureau"
        }))
        .unwrap();
        let saved = change_projects_at(&file, edit).unwrap();
        assert_eq!(saved[1].id, "mcp-project");
        let server = &saved[0].servers[0];
        assert_eq!(server.name, "Bureau");
        assert_eq!(server.port, 0);
        assert_eq!(server.ram_limit, None);
    }

    #[test]
    fn ram_limit_patch_distinguishes_missing_values_from_explicit_removal() {
        let mut project = project();
        project.servers[0].ram_limit = Some(500);
        let mut projects = vec![project];
        for (fields, expected) in [
            (serde_json::json!({"name": "Bureau"}), Some(500)),
            (serde_json::json!({"ramLimit": null}), None),
        ] {
            let mut change = serde_json::json!({ "type": "editServer", "projectId": "project", "serverId": "server" });
            change
                .as_object_mut()
                .unwrap()
                .extend(fields.as_object().unwrap().clone());
            apply_project_change(&mut projects, serde_json::from_value(change).unwrap()).unwrap();
            assert_eq!(projects[0].servers[0].ram_limit, expected);
        }
    }

    #[test]
    fn concurrent_writes_preserve_the_current_file_and_previous_backup() {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir =
            std::env::temp_dir().join(format!("sprint-write-test-{}-{stamp}", std::process::id()));
        fs::create_dir(&dir).unwrap();
        let file = dir.join("config.json");
        atomic_write(&file, "initial").unwrap();
        let first_path = file.clone();
        let second_path = file.clone();
        let first = std::thread::spawn(move || atomic_write(&first_path, "first"));
        let second = std::thread::spawn(move || atomic_write(&second_path, "second"));
        first.join().unwrap().unwrap();
        second.join().unwrap().unwrap();
        let current = fs::read_to_string(&file).unwrap();
        let previous = fs::read_to_string(with_suffix(&file, "bak")).unwrap();
        assert!(current == "first" || current == "second");
        assert!(previous == "first" || previous == "second");
        assert_ne!(current, previous);
        fs::remove_file(&file).unwrap();
        fs::remove_file(with_suffix(&file, "bak")).unwrap();
        fs::remove_dir(&dir).unwrap();
    }

    #[test]
    fn env_variants_keep_separate_backups() {
        let dir = std::env::temp_dir().join(format!("sprint-env-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let base = dir.join(".env");
        let local = dir.join(".env.local");
        atomic_write(&base, "BASE=1").unwrap();
        atomic_write(&local, "LOCAL=1").unwrap();
        atomic_write(&local, "LOCAL=2").unwrap();
        assert_eq!(
            fs::read_to_string(with_suffix(&local, "bak")).unwrap(),
            "LOCAL=1"
        );
        assert!(!with_suffix(&base, "bak").exists());
        assert_eq!(fs::read_to_string(&base).unwrap(), "BASE=1");
        assert_ne!(with_suffix(&base, "tmp"), with_suffix(&local, "tmp"));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn secret_files_are_written_without_backup_copies() {
        let dir = std::env::temp_dir().join(format!("sprint-env-nobak-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join(".env");
        atomic_write_without_backup(&file, "TOKEN=1").unwrap();
        atomic_write_without_backup(&file, "TOKEN=2").unwrap();
        assert_eq!(fs::read_to_string(&file).unwrap(), "TOKEN=2");
        assert!(!with_suffix(&file, "bak").exists());
        assert!(!with_suffix(&file, "tmp").exists());
        fs::remove_dir_all(&dir).unwrap();
    }
}
