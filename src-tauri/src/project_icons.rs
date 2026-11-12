//! Bounded, read-only logo discovery for the projects already registered in Sprint.
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Serialize;
use std::{
    collections::HashMap,
    fs,
    io::Read,
    path::{Path, PathBuf},
};

use crate::config_store::load_projects;
const MAX_ICON_BYTES: u64 = 512 * 1024;
const MAX_DOCUMENT_BYTES: u64 = 128 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectIcon {
    pub(crate) data_url: String,
}

fn read_bounded(path: &Path, limit: u64) -> Option<Vec<u8>> {
    let file = fs::File::open(path).ok()?;
    let metadata = file.metadata().ok()?;
    if !metadata.is_file() || metadata.len() == 0 || metadata.len() > limit {
        return None;
    }
    let mut bytes = Vec::new();
    file.take(limit + 1).read_to_end(&mut bytes).ok()?;
    (bytes.len() as u64 <= limit).then_some(bytes)
}

fn inside_root(root: &Path, relative: &Path) -> Option<PathBuf> {
    if relative.is_absolute() {
        return None;
    }
    let candidate = root.join(relative).canonicalize().ok()?;
    candidate.starts_with(root).then_some(candidate)
}

fn read_document(root: &Path, relative: &str) -> Option<String> {
    String::from_utf8(read_bounded(
        &inside_root(root, Path::new(relative))?,
        MAX_DOCUMENT_BYTES,
    )?)
    .ok()
}

fn quoted_attribute<'a>(tag: &'a str, name: &str) -> Option<&'a str> {
    let lower = tag.to_ascii_lowercase();
    for (index, _) in lower.match_indices(name) {
        if index > 0 && !lower.as_bytes()[index - 1].is_ascii_whitespace() {
            continue;
        }
        let Some(remaining) = tag[index + name.len()..].trim_start().strip_prefix('=') else {
            continue;
        };
        let remaining = remaining.trim_start();
        let quote = remaining.chars().next()?;
        if quote != '\'' && quote != '"' {
            return None;
        }
        return remaining[1..].split(quote).next();
    }
    None
}

fn declared_web_icons(html: &str) -> Vec<String> {
    let lower = html.to_ascii_lowercase();
    lower
        .match_indices("<link")
        .take(64)
        .filter_map(|(index, _)| {
            let tag = html[index + 5..].split('>').next()?;
            let rel = quoted_attribute(tag, "rel")?.to_ascii_lowercase();
            if !rel
                .split_whitespace()
                .any(|value| matches!(value, "icon" | "apple-touch-icon" | "mask-icon"))
            {
                return None;
            }
            let href = quoted_attribute(tag, "href")?.split(['?', '#']).next()?;
            if href.contains(':') || href.starts_with("//") || href.contains('\\') {
                return None;
            }
            Some(href.trim_start_matches('/').to_string())
        })
        .collect()
}

fn image_data(root: &Path, relative: &Path) -> Option<ProjectIcon> {
    let candidate = inside_root(root, relative)?;
    let bytes = read_bounded(&candidate, MAX_ICON_BYTES)?;
    let extension = candidate.extension()?.to_str()?.to_ascii_lowercase();
    let mime = match extension.as_str() {
        "png" if bytes.starts_with(b"\x89PNG\r\n\x1a\n") => "image/png",
        "ico" if bytes.starts_with(&[0, 0, 1, 0]) => "image/x-icon",
        "webp" if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") => "image/webp",
        "jpg" | "jpeg" if bytes.starts_with(&[0xff, 0xd8, 0xff]) => "image/jpeg",
        "svg" if std::str::from_utf8(&bytes).ok()?.contains("<svg") => "image/svg+xml",
        _ => return None,
    };
    Some(ProjectIcon {
        data_url: format!("data:{mime};base64,{}", STANDARD.encode(bytes)),
    })
}

fn configured_icons(root: &Path, config_file: &str, prefix: &str) -> Vec<PathBuf> {
    let Some(config) = read_document(root, config_file)
        .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok())
    else {
        return Vec::new();
    };
    let Some(icons) = config
        .pointer("/bundle/icon")
        .and_then(|value| value.as_array())
    else {
        return Vec::new();
    };
    let mut icons: Vec<PathBuf> = icons
        .iter()
        .take(24)
        .filter_map(|value| value.as_str())
        .map(|value| Path::new(prefix).join(value))
        .collect();
    // Prefer a larger PNG, while keeping installer-only formats out of the webview.
    icons.sort_by_key(|path| {
        let name = path.to_string_lossy().to_ascii_lowercase();
        if name.ends_with(".png") && !name.contains("32x32") {
            0
        } else if name.ends_with(".png") {
            1
        } else {
            2
        }
    });
    icons
}

pub(crate) fn detect_project_icon(project_root: &Path) -> Option<ProjectIcon> {
    load_project_icon(project_root, Some)
}

pub(crate) fn load_project_icon<T>(
    project_root: &Path,
    mut convert: impl FnMut(ProjectIcon) -> Option<T>,
) -> Option<T> {
    let root = project_root.canonicalize().ok()?;
    if !root.is_dir() {
        return None;
    }
    let mut candidates = configured_icons(&root, "src-tauri/tauri.conf.json", "src-tauri");
    candidates.extend(configured_icons(&root, "tauri.conf.json", ""));
    // App branding before web favicons, which may still be scaffold defaults.
    candidates.extend(
        [
            "src-tauri/icons/icon.png",
            "src-tauri/icons/128x128.png",
            "src-tauri/icons/icon.ico",
        ]
        .map(PathBuf::from),
    );
    for file in ["index.html", "public/index.html"] {
        if let Some(html) = read_document(&root, file) {
            for icon in declared_web_icons(&html) {
                candidates.push(Path::new("public").join(&icon));
                candidates.push(PathBuf::from(icon));
            }
        }
    }
    candidates.extend(
        [
            "public/favicon.png",
            "public/favicon.ico",
            "public/icon.png",
            "public/apple-touch-icon.png",
            "src/app/icon.png",
            "src/app/favicon.ico",
            "app/icon.png",
            "app/favicon.ico",
            "static/favicon.png",
            "static/favicon.ico",
            "public/logo.png",
            "public/logo.webp",
            "public/logo.svg",
            "assets/icon.png",
            "assets/logo.png",
            "favicon.png",
            "favicon.ico",
            "icon.png",
            "logo.png",
            "logo.svg",
        ]
        .map(PathBuf::from),
    );
    candidates
        .into_iter()
        .find_map(|candidate| image_data(&root, &candidate).and_then(&mut convert))
}

#[tauri::command]
pub async fn get_project_icons_cmd() -> Result<HashMap<String, ProjectIcon>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        load_projects()
            .into_iter()
            .filter_map(|project| {
                detect_project_icon(Path::new(&project.root)).map(|icon| (project.id, icon))
            })
            .collect()
    })
    .await
    .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    static SEQUENCE: AtomicUsize = AtomicUsize::new(0);
    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "sprint-icons-{}-{}",
                std::process::id(),
                SEQUENCE.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }
        fn write(&self, file: &str, bytes: &[u8]) {
            let path = self.0.join(file);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, bytes).unwrap();
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    #[test]
    fn project_icons_prefer_tauri_branding() {
        let fixture = Fixture::new();
        fixture.write(
            "src-tauri/tauri.conf.json",
            br#"{"bundle":{"icon":["icons/custom.svg"]}}"#,
        );
        fixture.write(
            "src-tauri/icons/custom.svg",
            br#"<svg xmlns="http://www.w3.org/2000/svg"/>"#,
        );
        fixture.write("public/favicon.ico", &[0, 0, 1, 0, 1, 0]);
        assert!(detect_project_icon(&fixture.0)
            .unwrap()
            .data_url
            .starts_with("data:image/svg+xml"));
    }
    #[test]
    fn project_icons_read_local_html_link() {
        let fixture = Fixture::new();
        fixture.write(
            "index.html",
            br#"<LINK href='/brand/app.svg?v=2' REL='shortcut icon'>"#,
        );
        fixture.write("public/brand/app.svg", b"<svg></svg>");
        assert!(detect_project_icon(&fixture.0)
            .unwrap()
            .data_url
            .starts_with("data:image/svg+xml"));
    }
    #[test]
    fn project_icons_reject_outside_paths_and_remote_urls() {
        let fixture = Fixture::new();
        assert!(inside_root(
            &fixture.0.canonicalize().unwrap(),
            Path::new("../outside.png")
        )
        .is_none());
        assert!(
            declared_web_icons(r#"<link rel="icon" href="https://example.com/icon.png">"#)
                .is_empty()
        );
        assert!(
            declared_web_icons(r#"<link rel="icon" href="//example.com/icon.png">"#).is_empty()
        );
    }
    #[test]
    fn project_icons_ignore_large_or_invalid_images() {
        let fixture = Fixture::new();
        fixture.write("public/favicon.png", &vec![1; MAX_ICON_BYTES as usize + 1]);
        fixture.write("icon.png", b"not an image");
        assert!(detect_project_icon(&fixture.0).is_none());
    }
    #[test]
    fn project_icons_handle_missing_project() {
        assert!(detect_project_icon(Path::new("sprint-nonexistent-logo-test")).is_none());
    }

    #[test]
    fn native_menu_can_fall_back_to_a_supported_local_image() {
        let fixture = Fixture::new();
        fixture.write("index.html", br#"<link rel="icon" href="logo.svg">"#);
        fixture.write("public/logo.svg", b"<svg></svg>");
        fixture.write("public/favicon.png", include_bytes!("../icons/32x32.png"));
        let native = load_project_icon(&fixture.0, |icon| {
            icon.data_url.starts_with("data:image/png").then_some(icon)
        }).unwrap();
        assert!(native.data_url.starts_with("data:image/png"));
    }
}
