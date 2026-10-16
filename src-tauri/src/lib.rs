pub mod config_store;
mod env_files;
mod port_inspector;
mod process_manager;
mod project_scanner;
mod shortcut;
mod system;
mod system_metrics;
mod tray_menu;
mod tunnel;
mod updater;

use config_store::{
    load_projects, load_settings, save_projects, save_settings, AppSettings, ProjectConfig,
};
use parking_lot::Mutex;
use process_manager::ProcessManager;
use project_scanner::{detect_stack, get_git_branch, DetectedStack};
use std::collections::HashMap;
use tauri::{AppHandle, Manager, State};

/// Fenêtres Windows lancées sans console (évite un terminal qui clignote).
pub(crate) const CREATE_NO_WINDOW: u32 = 0x08000000;

pub struct AppState {
    pub process_manager: ProcessManager,
}

pub(crate) fn shutdown_all_managed_processes(app: &AppHandle) {
    let state = app.state::<Mutex<AppState>>();
    state.lock().process_manager.stop_all_servers();
    tunnel::stop_all_tunnels();
}

#[tauri::command]
fn hide_window_cmd(window: tauri::Window) {
    let _ = window.hide();
}

#[tauri::command]
async fn exit_app(app: AppHandle) -> Result<(), String> {
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        shutdown_all_managed_processes(&app_handle);
    })
    .await
    .map_err(|e| e.to_string())?;
    app.exit(0);
    Ok(())
}

#[tauri::command]
async fn relaunch_app_cmd(app: AppHandle) -> Result<(), String> {
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        shutdown_all_managed_processes(&app_handle);
    })
    .await
    .map_err(|e| e.to_string())?;
    app.restart();
}

#[tauri::command]
async fn get_projects_cmd(app: AppHandle) -> Result<Vec<ProjectConfig>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut projects = load_projects();
        let active = app.state::<Mutex<AppState>>()
            .lock().process_manager.get_active_pids();
        for prj in &mut projects {
            for server in &mut prj.servers {
                if active.contains_key(&server.id) {
                    server.state = "running".to_string();
                }
            }
            prj.branch = get_git_branch(&prj.root);
            if prj.framework.is_none() {
                let stack = detect_stack(&prj.root);
                prj.framework = Some(stack.framework);
            }
        }
        projects
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn save_projects_cmd(app: AppHandle, projects: Vec<ProjectConfig>) -> Result<(), String> {
    save_projects(&projects)?;
    tray_menu::request_refresh(&app);
    Ok(())
}

#[tauri::command]
fn get_settings_cmd() -> AppSettings {
    load_settings()
}

#[tauri::command]
fn save_settings_cmd(settings: AppSettings) -> Result<(), String> {
    save_settings(&settings)
}

#[tauri::command]
fn detect_stack_cmd(path: String) -> DetectedStack {
    detect_stack(&path)
}

#[tauri::command]
fn start_server_cmd(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
    server_id: String,
    cwd: String,
    command: String,
    env: Option<HashMap<String, String>>,
) -> Result<u32, String> {
    let process_mgr = &state.lock().process_manager;
    process_mgr.start_server(app, server_id, cwd, command, env.unwrap_or_default())
}

#[tauri::command]
async fn stop_server_cmd(app: AppHandle, server_id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<Mutex<AppState>>();
        let result = state.lock().process_manager.stop_server(&app, &server_id);
        result
    })
    .await
    .map_err(|e| e.to_string())?
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::AppleScript,
            Some(vec!["--autostart"]),
        ))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(Mutex::new(AppState {
            process_manager: ProcessManager::new(),
        }))
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
            system_metrics::start_metrics_poller(app.handle().clone());

            let initial_shortcut = config_store::load_saved_shortcut();
            if let Err(e) = shortcut::register_shortcut_internal(app.handle(), &initial_shortcut) {
                eprintln!("Sprint: {}", e);
            }

            tray_menu::setup(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                if window.label() != "main" || load_settings().minimize_to_tray {
                    let _ = window.hide();
                } else {
                    let app = window.app_handle().clone();
                    tauri::async_runtime::spawn_blocking(move || {
                        shutdown_all_managed_processes(&app);
                        app.exit(0);
                    });
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            hide_window_cmd,
            tray_menu::get_tray_state_cmd,
            tray_menu::tray_action_cmd,
            exit_app,
            relaunch_app_cmd,
            get_projects_cmd,
            save_projects_cmd,
            get_settings_cmd,
            save_settings_cmd,
            detect_stack_cmd,
            start_server_cmd,
            stop_server_cmd,
            port_inspector::get_ports_cmd,
            port_inspector::kill_port_cmd,
            port_inspector::ping_port_cmd,
            system::open_vscode,
            system::open_explorer,
            system::open_config_dir_cmd,
            system::get_local_ip_cmd,
            system::open_browser,
            system::send_windows_notification,
            system::set_autostart_cmd,
            system::is_autostart_cmd,
            env_files::list_env_files_cmd,
            env_files::read_env_file,
            env_files::save_env_file,
            tunnel::start_localtunnel_cmd,
            shortcut::register_global_shortcut_cmd,
            updater::download_update_cmd,
            updater::install_update_and_relaunch_cmd,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
