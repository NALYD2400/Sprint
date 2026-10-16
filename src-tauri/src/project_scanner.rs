use serde::Serialize;
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize)]
pub struct DetectedStack {
    pub framework: String,
    pub icon: String,
    pub package_manager: String,
    pub default_dev_cmd: String,
}

pub fn detect_stack(project_root: &str) -> DetectedStack {
    let root = Path::new(project_root);
    let mut info = DetectedStack {
        framework: "Node.js".to_string(),
        icon: "package".to_string(),
        package_manager: "npm".to_string(),
        default_dev_cmd: "npm run dev".to_string(),
    };

    if !root.exists() {
        return info;
    }

    if root.join("pnpm-lock.yaml").exists() {
        info.package_manager = "pnpm".to_string();
        info.default_dev_cmd = "pnpm dev".to_string();
    } else if root.join("yarn.lock").exists() {
        info.package_manager = "yarn".to_string();
        info.default_dev_cmd = "yarn dev".to_string();
    } else if root.join("bun.lockb").exists() || root.join("bun.lock").exists() {
        info.package_manager = "bun".to_string();
        info.default_dev_cmd = "bun dev".to_string();
    }

    let pkg_path = root.join("package.json");
    if pkg_path.exists() {
        if let Ok(content) = fs::read_to_string(&pkg_path) {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&content) {
                let deps = v.get("dependencies").and_then(|d| d.as_object());
                let dev_deps = v.get("devDependencies").and_then(|d| d.as_object());

                let has_dep = |name: &str| -> bool {
                    deps.is_some_and(|d| d.contains_key(name))
                        || dev_deps.is_some_and(|d| d.contains_key(name))
                };

                if has_dep("next") {
                    info.framework = "Next.js".to_string();
                    info.icon = "zap".to_string();
                } else if has_dep("vite") {
                    info.framework = "Vite".to_string();
                    info.icon = "zap".to_string();
                } else if has_dep("@nestjs/core") {
                    info.framework = "NestJS".to_string();
                    info.icon = "boxes".to_string();
                } else if has_dep("express") {
                    info.framework = "Express".to_string();
                    info.icon = "box".to_string();
                } else if has_dep("nuxt") || has_dep("vue") {
                    info.framework = if has_dep("nuxt") { "Nuxt" } else { "Vue" }.to_string();
                    info.icon = "boxes".to_string();
                } else if has_dep("svelte") || has_dep("@sveltejs/kit") {
                    info.framework = "Svelte".to_string();
                    info.icon = "zap".to_string();
                } else if has_dep("react") {
                    info.framework = "React".to_string();
                    info.icon = "boxes".to_string();
                } else if has_dep("tauri") || has_dep("@tauri-apps/api") {
                    info.framework = "Tauri".to_string();
                    info.icon = "box".to_string();
                    info.default_dev_cmd = "cargo tauri dev".to_string();
                }
            }
        }
    } else if root.join("Cargo.toml").exists() {
        info.framework = "Rust".to_string();
        info.icon = "box".to_string();
        info.package_manager = "cargo".to_string();
        info.default_dev_cmd = "cargo run".to_string();
    } else if root.join("pyproject.toml").exists() || root.join("requirements.txt").exists() {
        info.framework = "Python".to_string();
        info.icon = "boxes".to_string();
        info.package_manager = "pip".to_string();
        info.default_dev_cmd = "python main.py".to_string();
    } else if root.join("go.mod").exists() {
        info.framework = "Go".to_string();
        info.icon = "box".to_string();
        info.package_manager = "go".to_string();
        info.default_dev_cmd = "go run .".to_string();
    }

    info
}

pub fn get_git_branch(project_root: &str) -> Option<String> {
    let head_path = Path::new(project_root).join(".git").join("HEAD");
    if head_path.exists() {
        if let Ok(content) = fs::read_to_string(head_path) {
            let trimmed = content.trim();
            if trimmed.starts_with("ref: refs/heads/") {
                return Some(trimmed.replace("ref: refs/heads/", ""));
            } else if trimmed.len() >= 7 && trimmed.is_char_boundary(7) {
                return Some(trimmed[..7].to_string());
            }
        }
    }
    None
}
