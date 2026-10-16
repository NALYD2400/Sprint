//! Raccourci clavier global qui affiche ou masque la fenêtre principale.

use crate::config_store;
use parking_lot::Mutex;
use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

static REGISTERED_SHORTCUT: Mutex<Option<String>> = Mutex::new(None);

pub fn register_shortcut_internal(app: &AppHandle, shortcut: &str) -> Result<(), String> {
    if shortcut.is_empty() {
        let mut current = REGISTERED_SHORTCUT.lock();
        if let Some(previous) = current.as_ref() {
            app.global_shortcut().unregister(previous.as_str()).map_err(|e| e.to_string())?;
        }
        *current = None;
        return Ok(());
    }

    let normalized = shortcut
        .replace("Control", "CommandOrControl")
        .replace("Ctrl", "CommandOrControl")
        .replace("ctrl", "CommandOrControl")
        .replace("Cmd", "Super")
        .replace("Meta", "Super");

    normalized
        .parse::<Shortcut>()
        .map_err(|_| format!("Raccourci clavier invalide : « {} »", shortcut))?;

    let mut current = REGISTERED_SHORTCUT.lock();
    if current.as_deref() == Some(&normalized) && app.global_shortcut().is_registered(normalized.as_str()) { return Ok(()); }

    app.global_shortcut()
        .on_shortcut(normalized.as_str(), move |app_handle, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                if let Some(window) = app_handle.get_webview_window("main") {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                    } else {
                        let _ = window.show();
                        let _ = window.unminimize();
                        let _ = window.set_focus();
                    }
                }
            }
        })
        .map_err(|e| {
            format!(
                "Impossible d'enregistrer le raccourci (déjà utilisé ?): {}",
                e
            )
        })?;

    if let Some(previous) = current.as_ref() {
        if let Err(error) = app.global_shortcut().unregister(previous.as_str()) {
            let _ = app.global_shortcut().unregister(normalized.as_str());
            return Err(error.to_string());
        }
    }
    *current = Some(normalized);

    Ok(())
}

#[tauri::command]
pub fn register_global_shortcut_cmd(app: AppHandle, shortcut: String) -> Result<(), String> {
    let previous = config_store::load_saved_shortcut();
    register_shortcut_internal(&app, &shortcut)?;
    if let Err(error) = config_store::save_saved_shortcut(&shortcut) {
        let _ = register_shortcut_internal(&app, &previous);
        return Err(error);
    }
    Ok(())
}
