use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::sync::atomic::{AtomicU8, Ordering};

use parking_lot::Mutex;
use serde::Serialize;
use tauri::menu::{MenuBuilder, MenuItem, MenuItemBuilder, PredefinedMenuItem, Submenu};
use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Listener, Manager};

use crate::config_store::{load_projects, ProjectConfig};
use crate::{shutdown_all_managed_processes, AppState};

const IDLE: u8 = 0;
const STARTING: u8 = 1;
const STOPPING: u8 = 2;
const QUITTING: u8 = 3;
const START_SERVER_PREFIX: &str = "tray_start_server:";
const STOP_SERVER_PREFIX: &str = "tray_stop_server:";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ServerAction {
    Start,
    Stop,
    Logs,
    Preview,
    Folder,
}

struct TrayMenuState {
    status: MenuItem<tauri::Wry>,
    servers: Submenu<tauri::Wry>,
    quit: MenuItem<tauri::Wry>,
    activity: AtomicU8,
    rendered: Mutex<Option<MenuModel>>,
}

#[derive(Debug, PartialEq, Eq)]
struct MenuModel {
    status: String,
    servers_label: String,
    can_open_servers: bool,
    can_quit: bool,
    servers: Vec<ServerMenuEntry>,
}

#[derive(Debug, PartialEq, Eq)]
struct ServerMenuEntry {
    id: String,
    label: String,
    project_root: String,
    running: bool,
    port: u16,
    configured: bool,
}

fn compact_name(name: &str, max: usize) -> String {
    let name = name.split_whitespace().collect::<Vec<_>>().join(" ");
    if name.chars().count() <= max {
        return name;
    }
    format!(
        "{}…",
        name.chars().take(max - 1).collect::<String>().trim_end()
    )
}

fn server_label(project: &ProjectConfig, server: &crate::config_store::ServerConfig) -> String {
    let project_name = compact_name(
        &project.name,
        if project.servers.len() > 1 { 20 } else { 30 },
    );
    let label = if project.servers.len() == 1 {
        project_name
    } else {
        let name = server.name.to_lowercase();
        let short = match name.as_str() {
            "tauri app (desktop)"
            | "tauri desktop (app)"
            | "application tauri (développement)"
            | "application windows"
            | "application windows (développement)" => "App",
            "site web (local)" | "web dev server" | "site web local" | "portfolio web (local)" => {
                "Web"
            }
            _ => &server.name,
        };
        format!("{project_name} · {}", compact_name(short, 14))
    };
    if server.port == 0 {
        label
    } else {
        format!("{label} :{}", server.port)
    }
}

fn decode_menu_icon(data_url: &str) -> Option<tauri::image::Image<'static>> {
    use base64::{engine::general_purpose::STANDARD, Engine};
    use std::io::Cursor;
    let (_, encoded) = data_url.split_once(";base64,")?;
    let bytes = STANDARD.decode(encoded).ok()?;
    if bytes.len() > 512 * 1024 {
        return None;
    }
    let mut reader = image::ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .ok()?;
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(2048);
    limits.max_image_height = Some(2048);
    limits.max_alloc = Some(20 * 1024 * 1024);
    reader.limits(limits);
    let image = reader
        .decode()
        .ok()?
        .resize(16, 16, image::imageops::FilterType::Lanczos3)
        .to_rgba8();
    let mut canvas = image::RgbaImage::new(16, 16);
    image::imageops::overlay(
        &mut canvas,
        &image,
        (16 - image.width()) as i64 / 2,
        (16 - image.height()) as i64 / 2,
    );
    Some(tauri::image::Image::new_owned(canvas.into_raw(), 16, 16))
}

fn server_count(count: usize) -> String {
    format!("{count} serveur{}", if count == 1 { "" } else { "s" })
}

fn menu_status_icon(
    logo: Option<&tauri::image::Image<'_>>,
    running: bool,
) -> tauri::image::Image<'static> {
    let mut pixels = logo
        .map(|image| image.rgba().to_vec())
        .unwrap_or_else(|| vec![0; 16 * 16 * 4]);
    let (cx, cy) = if logo.is_some() {
        (12.0, 12.0)
    } else {
        (7.5, 7.5)
    };
    let color = if running {
        [34, 197, 94]
    } else {
        [239, 68, 68]
    };
    for y in 0..16 {
        for x in 0..16 {
            let distance = ((x as f32 - cx).powi(2) + (y as f32 - cy).powi(2)).sqrt();
            let index = (y * 16 + x) * 4;
            if distance <= 2.5 {
                pixels[index..index + 4].copy_from_slice(&[color[0], color[1], color[2], 255]);
            } else if distance <= 3.5 {
                pixels[index..index + 4].copy_from_slice(&[24, 28, 30, 255]);
            }
        }
    }
    tauri::image::Image::new_owned(pixels, 16, 16)
}

fn menu_model(projects: &[ProjectConfig], running: &HashSet<String>, activity: u8) -> MenuModel {
    let mut servers: Vec<_> = projects
        .iter()
        .flat_map(|project| {
            project.servers.iter().map(|server| ServerMenuEntry {
                id: server.id.clone(),
                label: server_label(project, server),
                project_root: project.root.clone(),
                running: running.contains(&server.id),
                port: server.port,
                configured: true,
            })
        })
        .collect();
    // A removed project may still own a live managed process. Keep its stop action.
    let configured: HashSet<_> = projects
        .iter()
        .flat_map(|project| project.servers.iter().map(|server| &server.id))
        .collect();
    let mut removed: Vec<_> = running
        .iter()
        .filter(|id| !configured.contains(id))
        .collect();
    removed.sort();
    servers.extend(removed.into_iter().map(|id| ServerMenuEntry {
        id: id.clone(),
        label: format!("Serveur retiré · {}", compact_name(id, 20)),
        project_root: String::new(),
        running: true,
        port: 0,
        configured: false,
    }));
    let status = match activity {
        STARTING => "Démarrage en cours…".to_string(),
        STOPPING => "Arrêt en cours…".to_string(),
        QUITTING => "Fermeture de Sprint…".to_string(),
        _ if running.is_empty() => "Aucun serveur en cours".to_string(),
        _ => format!("{} en cours", server_count(running.len())),
    };
    MenuModel {
        status,
        servers_label: format!("Serveurs ({})", servers.len()),
        can_open_servers: activity == IDLE && !servers.is_empty(),
        can_quit: activity == IDLE,
        servers,
    }
}

fn server_action_from_menu_id(id: &str) -> Option<(ServerAction, &str)> {
    [
        (START_SERVER_PREFIX, ServerAction::Start),
        (STOP_SERVER_PREFIX, ServerAction::Stop),
        ("tray_logs_server:", ServerAction::Logs),
        ("tray_preview_server:", ServerAction::Preview),
        ("tray_folder_server:", ServerAction::Folder),
    ]
    .into_iter()
    .find_map(|(prefix, action)| {
        id.strip_prefix(prefix)
            .filter(|id| !id.is_empty())
            .map(|id| (action, id))
    })
}

fn server_action_enabled(server: &ServerMenuEntry, action: ServerAction) -> bool {
    match action {
        ServerAction::Start => server.configured && !server.running,
        ServerAction::Stop => server.running,
        ServerAction::Logs => server.configured,
        ServerAction::Preview => server.configured && server.port > 0,
        ServerAction::Folder => server.configured && !server.project_root.is_empty(),
    }
}

fn populate_server_menu(
    app: &AppHandle,
    submenu: &Submenu<tauri::Wry>,
    servers: &[ServerMenuEntry],
) -> tauri::Result<()> {
    for item in submenu.items()? {
        submenu.remove(&item)?;
    }
    // Decode each project once per rebuild; native menus keep only tiny RGBA images.
    let mut icons = HashMap::new();
    for server in servers {
        let icon = icons.entry(server.project_root.clone()).or_insert_with(|| {
            if server.project_root.is_empty() {
                return None;
            }
            crate::project_icons::load_project_icon(Path::new(&server.project_root), |icon| {
                decode_menu_icon(&icon.data_url)
            })
        });
        let actions = Submenu::with_id_and_icon(
            app,
            format!("tray_server:{}", server.id),
            server.label.replace('&', "&&"),
            true,
            Some(menu_status_icon(icon.as_ref(), server.running)),
        )?;
        let status = MenuItemBuilder::new(if server.running {
            "En cours"
        } else {
            "Arrêté"
        })
        .enabled(false)
        .build(app)?;
        actions.append(&status)?;
        actions.append(&PredefinedMenuItem::separator(app)?)?;
        for (prefix, text, action) in [
            (START_SERVER_PREFIX, "Démarrer", ServerAction::Start),
            (STOP_SERVER_PREFIX, "Arrêter", ServerAction::Stop),
            ("tray_logs_server:", "Ouvrir les logs", ServerAction::Logs),
            (
                "tray_preview_server:",
                "Ouvrir l’aperçu web",
                ServerAction::Preview,
            ),
            (
                "tray_folder_server:",
                "Ouvrir le dossier",
                ServerAction::Folder,
            ),
        ] {
            let item = MenuItemBuilder::with_id(format!("{prefix}{}", server.id), text)
                .enabled(server_action_enabled(server, action))
                .build(app)?;
            actions.append(&item)?;
        }
        submenu.append(&actions)?;
    }
    Ok(())
}

fn show_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn refresh(app: &AppHandle) {
    let Some(menu) = app.try_state::<TrayMenuState>() else {
        return;
    };
    // Serialize snapshots as well as rendering so an older refresh cannot
    // overwrite a newer server count after concurrent status events.
    let mut rendered = menu.rendered.lock();
    let projects = load_projects();
    let running = app
        .state::<Mutex<AppState>>()
        .lock()
        .process_manager
        .get_active_pids()
        .into_keys()
        .collect();
    let model = menu_model(&projects, &running, menu.activity.load(Ordering::SeqCst));
    if rendered.as_ref() == Some(&model) {
        return;
    }
    if rendered
        .as_ref()
        .is_none_or(|previous| previous.servers != model.servers)
    {
        if let Err(error) = populate_server_menu(app, &menu.servers, &model.servers) {
            eprintln!("Sprint: impossible de mettre à jour la liste des serveurs : {error}");
            return;
        }
    }
    let _ = menu.status.set_text(&model.status);
    let _ = menu.servers.set_text(&model.servers_label);
    let _ = menu.servers.set_enabled(model.can_open_servers);
    let _ = menu.quit.set_enabled(model.can_quit);
    if let Some(tray) = app.tray_by_id("main_tray") {
        let _ = tray.set_tooltip(Some(format!("Sprint · {}", model.status)));
    }
    *rendered = Some(model);
    let _ = app.emit("tray-state-changed", ());
}

pub fn request_refresh(app: &AppHandle) {
    let app = app.clone();
    // A status event may be emitted while the process manager is locked.
    // Queue the refresh instead of reading that state inside the event callback.
    tauri::async_runtime::spawn_blocking(move || refresh(&app));
}

fn run_action(app: &AppHandle, activity: u8, server_id: Option<String>) -> Result<(), String> {
    let menu = app.state::<TrayMenuState>();
    if menu
        .activity
        .compare_exchange(IDLE, activity, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err("Une action est déjà en cours.".to_string());
    }
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        refresh(&app);
        if activity == QUITTING {
            shutdown_all_managed_processes(&app);
            app.exit(0);
            return;
        }
        let mut errors = Vec::new();
        if activity == STARTING {
            for project in load_projects() {
                for server in project.servers {
                    if server_id.as_ref().is_some_and(|id| id != &server.id) {
                        continue;
                    }
                    let state = app.state::<Mutex<AppState>>();
                    let guard = state.lock();
                    if guard.process_manager.is_running(&server.id) {
                        continue;
                    }
                    if let Err(error) = guard.process_manager.start_server(
                        app.clone(),
                        server.id,
                        project.root.clone(),
                        server.command,
                        server.env,
                    ) {
                        errors.push(format!("{} : {error}", server.name));
                    }
                }
            }
        } else {
            // Include managed servers whose project was removed while running.
            let ids: Vec<_> = app
                .state::<Mutex<AppState>>()
                .lock()
                .process_manager
                .get_active_pids()
                .into_keys()
                .collect();
            for id in ids {
                if server_id.as_ref().is_some_and(|target| target != &id) {
                    continue;
                }
                let state = app.state::<Mutex<AppState>>();
                let result = state.lock().process_manager.stop_server(&app, &id);
                if let Err(error) = result {
                    errors.push(error);
                }
            }
        }
        app.state::<TrayMenuState>()
            .activity
            .store(IDLE, Ordering::SeqCst);
        refresh(&app);
        if !errors.is_empty() {
            show_window(&app);
            let _ = app.emit("tray-action-error", errors.join("\n"));
        }
    });
    Ok(())
}

#[derive(Serialize)]
pub struct TraySnapshot {
    projects: Vec<ProjectConfig>,
    activity: u8,
    running_count: usize,
}

#[tauri::command]
pub async fn get_tray_state_cmd(app: AppHandle) -> Result<TraySnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let running = app
            .state::<Mutex<AppState>>()
            .lock()
            .process_manager
            .get_active_pids();
        let mut projects = load_projects();
        for project in &mut projects {
            for server in &mut project.servers {
                if running.contains_key(&server.id) {
                    server.state = "running".to_string();
                }
            }
        }
        TraySnapshot {
            projects,
            running_count: running.len(),
            activity: app.state::<TrayMenuState>().activity.load(Ordering::SeqCst),
        }
    })
    .await
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn tray_action_cmd(
    app: AppHandle,
    action: String,
    server_id: Option<String>,
    tab: Option<String>,
) -> Result<(), String> {
    match action.as_str() {
        "open" => {
            show_window(&app);
            if let Some(tab) = tab {
                if !["dashboard", "projects", "terminal", "settings", "browser"]
                    .contains(&tab.as_str())
                {
                    return Err("Page inconnue.".to_string());
                }
                app.emit(
                    "tray-navigate",
                    serde_json::json!({ "tab": tab, "serverId": server_id }),
                )
                .map_err(|error| error.to_string())?;
            }
            Ok(())
        }
        "start-all" => run_action(&app, STARTING, None),
        "stop-all" => run_action(&app, STOPPING, None),
        "quit" => run_action(&app, QUITTING, None),
        "toggle-server" => {
            let id = server_id.ok_or("Serveur manquant.")?;
            if !load_projects()
                .iter()
                .any(|project| project.servers.iter().any(|server| server.id == id))
            {
                return Err("Ce serveur n’existe plus.".to_string());
            }
            let running = app
                .state::<Mutex<AppState>>()
                .lock()
                .process_manager
                .is_running(&id);
            run_action(&app, if running { STOPPING } else { STARTING }, Some(id))
        }
        _ => Err("Action inconnue.".to_string()),
    }
}

fn handle_server_action(
    app: &AppHandle,
    action: ServerAction,
    server_id: &str,
) -> Result<(), String> {
    if action == ServerAction::Stop {
        return run_action(app, STOPPING, Some(server_id.to_string()));
    }
    let projects = load_projects();
    let project = projects
        .iter()
        .find(|project| project.servers.iter().any(|server| server.id == server_id))
        .ok_or("Ce serveur n’existe plus.")?;
    match action {
        ServerAction::Start => run_action(app, STARTING, Some(server_id.to_string())),
        ServerAction::Logs | ServerAction::Preview => {
            let tab = if action == ServerAction::Logs {
                "terminal"
            } else {
                "browser"
            };
            let url = if action == ServerAction::Preview {
                let server = project
                    .servers
                    .iter()
                    .find(|server| server.id == server_id && server.port > 0)
                    .ok_or("Ce serveur n’a pas de port d’aperçu.")?;
                Some(format!("http://localhost:{}/", server.port))
            } else {
                None
            };
            show_window(app);
            app.emit(
                "tray-navigate",
                serde_json::json!({ "tab": tab, "serverId": server_id, "url": url }),
            )
            .map_err(|error| error.to_string())
        }
        ServerAction::Folder => {
            let root = Path::new(&project.root)
                .canonicalize()
                .map_err(|_| "Le dossier du projet est introuvable.")?;
            if !root.is_dir() {
                return Err("Le dossier du projet est introuvable.".into());
            }
            open::that(root).map_err(|error| error.to_string())
        }
        ServerAction::Stop => unreachable!(),
    }
}

pub fn setup(app: &tauri::App) -> tauri::Result<()> {
    let show = MenuItemBuilder::with_id("tray_show", "Ouvrir Sprint").build(app)?;
    let settings = MenuItemBuilder::with_id("tray_settings", "Paramètres").build(app)?;
    let status = MenuItemBuilder::with_id("tray_status", "Aucun serveur en cours")
        .enabled(false)
        .build(app)?;
    let servers = Submenu::with_id(app, "tray_servers", "Serveurs", false)?;
    let quit = MenuItemBuilder::with_id("tray_quit", "Quitter Sprint").build(app)?;
    let menu = MenuBuilder::new(app)
        .items(&[&show, &settings])
        .separator()
        .items(&[&status, &servers])
        .separator()
        .item(&quit)
        .build()?;
    app.manage(TrayMenuState {
        status,
        servers,
        quit,
        activity: AtomicU8::new(IDLE),
        rendered: Mutex::new(None),
    });
    let mut tray = TrayIconBuilder::with_id("main_tray")
        .tooltip("Sprint")
        .menu(&menu)
        .show_menu_on_left_click(true);
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.on_menu_event(|app, event| match event.id.as_ref() {
        "tray_show" => show_window(app),
        "tray_settings" => {
            show_window(app);
            let _ = app.emit("tray-navigate", "settings");
        }
        "tray_quit" => {
            let _ = run_action(app, QUITTING, None);
        }
        id => {
            if let Some((action, server_id)) = server_action_from_menu_id(id) {
                let app = app.clone();
                let server_id = server_id.to_string();
                tauri::async_runtime::spawn_blocking(move || {
                    if let Err(error) = handle_server_action(&app, action, &server_id) {
                        show_window(&app);
                        let _ = app.emit("tray-action-error", error);
                    }
                });
            }
        }
    })
    .on_tray_icon_event(|tray, event| {
        if matches!(
            event,
            TrayIconEvent::DoubleClick {
                button: MouseButton::Left,
                ..
            }
        ) {
            show_window(tray.app_handle());
        }
    })
    .build(app)?;
    let handle = app.handle().clone();
    app.listen("server-status-changed", move |_| request_refresh(&handle));
    request_refresh(app.handle());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ids(values: &[&str]) -> HashSet<String> {
        values.iter().map(|id| id.to_string()).collect()
    }

    fn projects(values: &[&str]) -> Vec<ProjectConfig> {
        vec![ProjectConfig {
            id: "project".into(),
            name: "Mon projet".into(),
            root: String::new(),
            color: String::new(),
            framework: None,
            branch: None,
            servers: values
                .iter()
                .map(|id| crate::config_store::ServerConfig {
                    id: id.to_string(),
                    name: format!("Serveur {id}"),
                    command: String::new(),
                    port: 3000,
                    state: "stopped".into(),
                    env: Default::default(),
                    ram_limit: None,
                })
                .collect(),
        }]
    }

    #[test]
    fn idle_actions_follow_configured_and_running_servers() {
        let empty = menu_model(&projects(&[]), &ids(&[]), IDLE);
        assert!(!empty.can_open_servers && empty.can_quit);
        assert!(empty.servers.is_empty());
        let stopped = menu_model(&projects(&["a", "b"]), &ids(&[]), IDLE);
        assert!(stopped.can_open_servers);
        assert_eq!(stopped.servers_label, "Serveurs (2)");
        assert!(server_action_enabled(
            &stopped.servers[0],
            ServerAction::Start
        ));
        assert!(!server_action_enabled(
            &stopped.servers[0],
            ServerAction::Stop
        ));
        let mixed = menu_model(&projects(&["a", "b"]), &ids(&["a"]), IDLE);
        assert!(mixed.can_open_servers);
        assert_eq!(mixed.status, "1 serveur en cours");
        assert_eq!(mixed.servers_label, "Serveurs (2)");
        let running = menu_model(&projects(&["a", "b"]), &ids(&["a", "b"]), IDLE);
        assert!(running.servers.iter().all(|server| !server_action_enabled(
            server,
            ServerAction::Start
        ) && server_action_enabled(
            server,
            ServerAction::Stop
        )));
    }

    #[test]
    fn removed_project_does_not_hide_a_managed_process() {
        let model = menu_model(&projects(&[]), &ids(&["removed"]), IDLE);
        assert!(model.can_open_servers);
        assert_eq!(model.servers[0].id, "removed");
        assert!(server_action_enabled(&model.servers[0], ServerAction::Stop));
        for action in [
            ServerAction::Start,
            ServerAction::Logs,
            ServerAction::Preview,
            ServerAction::Folder,
        ] {
            assert!(!server_action_enabled(&model.servers[0], action));
        }
    }

    #[test]
    fn actions_are_disabled_while_a_batch_is_in_progress() {
        for activity in [STARTING, STOPPING, QUITTING] {
            let model = menu_model(&projects(&["a", "b"]), &ids(&["a"]), activity);
            assert!(!model.can_open_servers && !model.can_quit);
        }
    }

    #[test]
    fn submenu_entries_identify_the_project_server_and_port_and_refresh_after_rename() {
        let mut projects = projects(&["a", "b"]);
        let first = menu_model(&projects, &ids(&[]), IDLE);
        assert_eq!(first.servers[0].label, "Mon projet · Serveur a :3000");
        projects[0].name = "R&D".into();
        projects[0].servers[0].port = 0;
        let renamed = menu_model(&projects, &ids(&[]), IDLE);
        assert_ne!(first, renamed);
        assert_eq!(renamed.servers[0].label, "R&D · Serveur a");
    }

    #[test]
    fn submenu_selection_targets_one_server_and_parent_never_triggers_a_batch() {
        for id in ["a", "server:two", "serveur-é"] {
            let menu_id = format!("{START_SERVER_PREFIX}{id}");
            assert_eq!(
                server_action_from_menu_id(&menu_id),
                Some((ServerAction::Start, id))
            );
            let menu_id = format!("{STOP_SERVER_PREFIX}{id}");
            assert_eq!(
                server_action_from_menu_id(&menu_id),
                Some((ServerAction::Stop, id))
            );
            for (prefix, action) in [
                ("tray_logs_server:", ServerAction::Logs),
                ("tray_preview_server:", ServerAction::Preview),
                ("tray_folder_server:", ServerAction::Folder),
            ] {
                assert_eq!(
                    server_action_from_menu_id(&format!("{prefix}{id}")),
                    Some((action, id))
                );
            }
        }
        for id in [
            "tray_start",
            "tray_stop",
            "tray_start_server:",
            "tray_stop_server:",
            "start-all",
            "stop-all",
            "tray_servers",
            "tray_server:a",
            "tray_logs_server:",
            "tray_preview_server:",
            "tray_folder_server:",
        ] {
            assert_eq!(server_action_from_menu_id(id), None);
        }
    }

    #[test]
    fn compact_labels_keep_the_port_and_distinguish_servers() {
        let mut projects = projects(&["a", "b"]);
        let project = &mut projects[0];
        project.name = "SR Editer".into();
        project.servers[0].name = "Tauri App (Desktop)".into();
        project.servers[0].port = 4313;
        project.servers[1].name = "Site Web (Local)".into();
        assert_eq!(
            server_label(project, &project.servers[0]),
            "SR Editer · App :4313"
        );
        assert_eq!(
            server_label(project, &project.servers[1]),
            "SR Editer · Web :3000"
        );
        project.name = "Projet très long avec beaucoup de détails".into();
        project.servers[0].name = "Serveur personnalisé avec beaucoup de détails".into();
        let label = server_label(project, &project.servers[0]);
        assert!(label.chars().count() <= 44);
        assert!(label.ends_with(":4313"));
        project.servers.truncate(1);
        assert_eq!(
            server_label(project, &project.servers[0]),
            "Projet très long avec beaucou… :4313"
        );
    }

    #[test]
    fn native_logos_are_bounded_transparent_thumbnails() {
        use base64::{engine::general_purpose::STANDARD, Engine};
        let icon = decode_menu_icon(&format!(
            "data:image/png;base64,{}",
            STANDARD.encode(include_bytes!("../icons/128x128.png"))
        ))
        .unwrap();
        assert_eq!((icon.width(), icon.height()), (16, 16));
        assert_eq!(icon.rgba().len(), 16 * 16 * 4);
        assert!(decode_menu_icon("data:image/png;base64,invalid").is_none());
        assert!(decode_menu_icon("data:image/svg+xml;base64,PHN2Zy8+").is_none());
    }

    #[test]
    fn server_keeps_its_position_and_updates_available_actions_when_its_state_changes() {
        let projects = projects(&["a", "b"]);
        let stopped = menu_model(&projects, &ids(&[]), IDLE);
        assert_eq!(stopped.servers.len(), 2);
        assert!(stopped.servers.iter().all(|server| !server.running));
        let active = menu_model(&projects, &ids(&["a"]), IDLE);
        assert_eq!(active.servers.len(), 2);
        assert_eq!(active.servers[0].id, "a");
        assert!(active.servers[0].running);
        assert!(!server_action_enabled(
            &active.servers[0],
            ServerAction::Start
        ));
        assert!(server_action_enabled(
            &active.servers[0],
            ServerAction::Stop
        ));
        assert!(server_action_enabled(
            &active.servers[1],
            ServerAction::Start
        ));
        assert_eq!(menu_model(&projects, &ids(&[]), IDLE), stopped);
    }

    #[test]
    fn preview_requires_a_port_and_navigation_does_not_require_a_running_process() {
        let mut projects = projects(&["web", "desktop"]);
        projects[0].servers[1].port = 0;
        projects[0].root = "D:/Projet".into();
        let model = menu_model(&projects, &ids(&[]), IDLE);
        assert!(server_action_enabled(
            &model.servers[0],
            ServerAction::Preview
        ));
        assert!(!server_action_enabled(
            &model.servers[1],
            ServerAction::Preview
        ));
        for server in &model.servers {
            assert!(server_action_enabled(server, ServerAction::Logs));
            assert!(server_action_enabled(server, ServerAction::Folder));
        }
    }

    #[test]
    fn status_dots_are_red_when_stopped_and_green_when_running_with_or_without_logos() {
        for running in [false, true] {
            let expected = if running {
                [34, 197, 94, 255]
            } else {
                [239, 68, 68, 255]
            };
            let empty = menu_status_icon(None, running);
            assert_eq!(
                &empty.rgba()[(8 * 16 + 8) * 4..(8 * 16 + 8) * 4 + 4],
                &expected
            );
            let logo = tauri::image::Image::new_owned(vec![180; 16 * 16 * 4], 16, 16);
            let icon = menu_status_icon(Some(&logo), running);
            assert_eq!(
                &icon.rgba()[(12 * 16 + 12) * 4..(12 * 16 + 12) * 4 + 4],
                &expected
            );
            assert_eq!(&icon.rgba()[..4], &logo.rgba()[..4]);
            assert_eq!((icon.width(), icon.height()), (16, 16));
        }
    }
}
