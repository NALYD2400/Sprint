use std::collections::HashSet;
use std::sync::atomic::{AtomicU8, Ordering};

use parking_lot::Mutex;
use serde::Serialize;
use tauri::menu::{MenuBuilder, MenuItem, MenuItemBuilder};
use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Listener, Manager};

use crate::config_store::{load_projects, ProjectConfig};
use crate::{shutdown_all_managed_processes, AppState};

const IDLE: u8 = 0;
const STARTING: u8 = 1;
const STOPPING: u8 = 2;
const QUITTING: u8 = 3;

struct TrayMenuState {
    status: MenuItem<tauri::Wry>,
    start: MenuItem<tauri::Wry>,
    stop: MenuItem<tauri::Wry>,
    quit: MenuItem<tauri::Wry>,
    activity: AtomicU8,
    rendered: Mutex<Option<MenuModel>>,
}

#[derive(Debug, PartialEq, Eq)]
struct MenuModel {
    status: String,
    start_label: String,
    stop_label: String,
    can_start: bool,
    can_stop: bool,
    can_quit: bool,
}

fn server_count(count: usize) -> String {
    format!("{count} serveur{}", if count == 1 { "" } else { "s" })
}

fn menu_model(configured: &HashSet<String>, running: &HashSet<String>, activity: u8) -> MenuModel {
    let stopped = configured.difference(running).count();
    let status = match activity {
        STARTING => "Démarrage en cours…".to_string(),
        STOPPING => "Arrêt en cours…".to_string(),
        QUITTING => "Fermeture de Sprint…".to_string(),
        _ if running.is_empty() => "Aucun serveur en cours".to_string(),
        _ => format!("{} en cours", server_count(running.len())),
    };
    MenuModel {
        status,
        start_label: if stopped == 0 {
            "Démarrer les serveurs".to_string()
        } else {
            format!("Démarrer {}", server_count(stopped))
        },
        stop_label: if running.is_empty() {
            "Arrêter les serveurs".to_string()
        } else {
            format!("Arrêter {}", server_count(running.len()))
        },
        can_start: activity == IDLE && stopped > 0,
        can_stop: activity == IDLE && !running.is_empty(),
        can_quit: activity == IDLE,
    }
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
    let configured = load_projects()
        .into_iter()
        .flat_map(|project| project.servers.into_iter().map(|server| server.id))
        .collect();
    let running = app
        .state::<Mutex<AppState>>()
        .lock()
        .process_manager
        .get_active_pids()
        .into_keys()
        .collect();
    let model = menu_model(&configured, &running, menu.activity.load(Ordering::SeqCst));
    if rendered.as_ref() == Some(&model) {
        return;
    }
    let _ = menu.status.set_text(&model.status);
    let _ = menu.start.set_text(&model.start_label);
    let _ = menu.stop.set_text(&model.stop_label);
    let _ = menu.start.set_enabled(model.can_start);
    let _ = menu.stop.set_enabled(model.can_stop);
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
                if !["dashboard", "projects", "terminal", "settings"].contains(&tab.as_str()) {
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

pub fn setup(app: &tauri::App) -> tauri::Result<()> {
    let show = MenuItemBuilder::with_id("tray_show", "Ouvrir Sprint").build(app)?;
    let settings = MenuItemBuilder::with_id("tray_settings", "Paramètres").build(app)?;
    let status = MenuItemBuilder::with_id("tray_status", "Aucun serveur en cours")
        .enabled(false)
        .build(app)?;
    let start = MenuItemBuilder::with_id("tray_start", "Démarrer les serveurs")
        .enabled(false)
        .build(app)?;
    let stop = MenuItemBuilder::with_id("tray_stop", "Arrêter les serveurs")
        .enabled(false)
        .build(app)?;
    let quit = MenuItemBuilder::with_id("tray_quit", "Quitter Sprint").build(app)?;
    let menu = MenuBuilder::new(app)
        .items(&[&show, &settings])
        .separator()
        .items(&[&status, &start, &stop])
        .separator()
        .item(&quit)
        .build()?;
    app.manage(TrayMenuState {
        status,
        start,
        stop,
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
        "tray_start" => {
            let _ = run_action(app, STARTING, None);
        }
        "tray_stop" => {
            let _ = run_action(app, STOPPING, None);
        }
        "tray_quit" => {
            let _ = run_action(app, QUITTING, None);
        }
        _ => {}
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

    #[test]
    fn idle_actions_follow_configured_and_running_servers() {
        let empty = menu_model(&ids(&[]), &ids(&[]), IDLE);
        assert!(!empty.can_start && !empty.can_stop && empty.can_quit);
        let stopped = menu_model(&ids(&["a", "b"]), &ids(&[]), IDLE);
        assert!(stopped.can_start && !stopped.can_stop);
        assert_eq!(stopped.start_label, "Démarrer 2 serveurs");
        let mixed = menu_model(&ids(&["a", "b"]), &ids(&["a"]), IDLE);
        assert!(mixed.can_start && mixed.can_stop);
        assert_eq!(mixed.status, "1 serveur en cours");
        assert_eq!(mixed.start_label, "Démarrer 1 serveur");
        let running = menu_model(&ids(&["a", "b"]), &ids(&["a", "b"]), IDLE);
        assert!(!running.can_start && running.can_stop);
        assert_eq!(running.stop_label, "Arrêter 2 serveurs");
    }

    #[test]
    fn removed_project_does_not_hide_a_managed_process() {
        let model = menu_model(&ids(&[]), &ids(&["removed"]), IDLE);
        assert!(!model.can_start && model.can_stop);
        assert_eq!(model.stop_label, "Arrêter 1 serveur");
    }

    #[test]
    fn actions_are_disabled_while_a_batch_is_in_progress() {
        for activity in [STARTING, STOPPING, QUITTING] {
            let model = menu_model(&ids(&["a", "b"]), &ids(&["a"]), activity);
            assert!(!model.can_start && !model.can_stop && !model.can_quit);
        }
    }

}
