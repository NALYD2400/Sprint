//! Téléchargement et installation des mises à jour depuis les releases GitHub.

use crate::{shutdown_all_managed_processes, CREATE_NO_WINDOW};
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;

/// Domaines autorisés pour le téléchargement des mises à jour.
const UPDATE_HOSTS: &[&str] = &[
    "github.com",
    "api.github.com",
    "objects.githubusercontent.com",
    "release-assets.githubusercontent.com",
];

const CHECKSUMS_FILE_NAME: &str = "SHA256SUMS.txt";
const MAX_CHECKSUMS_BYTES: usize = 64 * 1024;

/// Script de remplacement lancé après la fermeture de Sprint. Il lit `SPRINT_INSTALLER` et `SPRINT_EXE`
/// dans l'environnement (voir `install_update_and_relaunch_cmd`).
const UPDATE_SCRIPT: &str = "Start-Sleep -Seconds 2; $inst = $env:SPRINT_INSTALLER; $exe = $env:SPRINT_EXE; try { $p = Start-Process -FilePath $inst -ArgumentList '/S' -PassThru -ErrorAction Stop; $p.WaitForExit() } catch { Start-Process -FilePath $inst -ArgumentList '/S' -Verb RunAs -Wait }; Remove-Item -LiteralPath (Split-Path $inst) -Recurse -Force -ErrorAction SilentlyContinue; if (Test-Path $exe) { Start-Process -FilePath $exe }";

fn is_allowed_update_url(url: &str) -> bool {
    match reqwest::Url::parse(url) {
        Ok(parsed) => {
            parsed.scheme() == "https"
                && parsed
                    .host_str()
                    .is_some_and(|host| UPDATE_HOSTS.contains(&host))
        }
        Err(_) => false,
    }
}

/// Client HTTP : les redirections ne sont suivies que vers les domaines de confiance.
fn update_http_client() -> Result<reqwest::Client, String> {
    let policy = reqwest::redirect::Policy::custom(|attempt| {
        if attempt.previous().len() >= 5 {
            attempt.error("trop de redirections")
        } else if is_allowed_update_url(attempt.url().as_str()) {
            attempt.follow()
        } else {
            attempt.error("redirection vers un domaine non autorisé")
        }
    });
    reqwest::Client::builder()
        .user_agent("Sprint-Updater")
        .redirect(policy)
        .build()
        .map_err(|e| format!("Erreur initialisation client HTTP: {}", e))
}

/// Empreinte SHA-256 d'un fichier, lue dans SHA256SUMS.txt (format `sha256sum` : « hash  nom » ou « hash *nom »).
fn expected_sha256(checksums: &str, file_name: &str) -> Option<String> {
    checksums.lines().find_map(|line| {
        let mut parts = line.trim().splitn(2, char::is_whitespace);
        let hash = parts.next()?;
        let name = parts.next()?.trim().trim_start_matches('*');
        let well_formed = hash.len() == 64 && hash.bytes().all(|b| b.is_ascii_hexdigit());
        (well_formed && name == file_name).then(|| hash.to_ascii_lowercase())
    })
}

fn installer_file_name(url: &reqwest::Url) -> Option<String> {
    url.path_segments()?
        .next_back()
        .filter(|name| !name.is_empty())
        .map(|name| name.to_string())
}

/// Télécharge l'installateur dans `staging_dir` et ne le conserve que si son empreinte
/// correspond à celle publiée dans SHA256SUMS.txt de la même release.
async fn fetch_verified_installer(
    app: &AppHandle,
    client: &reqwest::Client,
    url: &reqwest::Url,
    staging_dir: &std::path::Path,
) -> Result<PathBuf, String> {
    use sha2::{Digest, Sha256};
    use tauri::Emitter;
    use tokio::io::AsyncWriteExt;

    let file_name = installer_file_name(url).ok_or("URL de téléchargement invalide.")?;
    let checksums_url = url
        .join(CHECKSUMS_FILE_NAME)
        .map_err(|e| format!("URL des empreintes invalide: {}", e))?;

    let checksums_response = client
        .get(checksums_url)
        .send()
        .await
        .map_err(|e| format!("Erreur de réseau: {}", e))?;
    if !checksums_response.status().is_success() {
        return Err("Fichier SHA256SUMS.txt introuvable : mise à jour refusée.".into());
    }
    let checksums_bytes = checksums_response
        .bytes()
        .await
        .map_err(|e| format!("Erreur de réseau: {}", e))?;
    if checksums_bytes.len() > MAX_CHECKSUMS_BYTES {
        return Err("Fichier SHA256SUMS.txt anormalement volumineux : mise à jour refusée.".into());
    }
    let checksums = String::from_utf8_lossy(&checksums_bytes);
    let expected = expected_sha256(&checksums, &file_name).ok_or_else(|| {
        format!("Empreinte de {} absente de SHA256SUMS.txt : mise à jour refusée.", file_name)
    })?;

    let mut response = client
        .get(url.clone())
        .send()
        .await
        .map_err(|e| format!("Erreur de réseau: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Erreur serveur HTTP {}", response.status()));
    }

    let total_size = response.content_length().unwrap_or(0);
    let installer_path = staging_dir.join("Sprint_setup.exe");
    let mut file = tokio::fs::File::create(&installer_path)
        .await
        .map_err(|e| format!("Erreur création fichier: {}", e))?;

    let mut hasher = Sha256::new();
    let mut header: Vec<u8> = Vec::with_capacity(2);
    let mut downloaded: u64 = 0;
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|e| format!("Interruption du téléchargement: {}", e))?
    {
        if header.len() < 2 {
            header.extend(chunk.iter().take(2 - header.len()));
        }
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Erreur d'écriture: {}", e))?;
        hasher.update(&chunk);
        downloaded += chunk.len() as u64;

        let pct = if total_size > 0 {
            ((downloaded as f64 / total_size as f64) * 100.0) as u32
        } else {
            50
        };

        #[derive(serde::Serialize, Clone)]
        struct ProgressPayload {
            downloaded: u64,
            total: u64,
            percentage: u32,
        }

        let _ = app.emit(
            "update-progress",
            ProgressPayload {
                downloaded,
                total: total_size,
                percentage: pct,
            },
        );
    }

    file.flush()
        .await
        .map_err(|e| format!("Erreur finalisation fichier: {}", e))?;

    if total_size > 0 && downloaded < total_size {
        return Err(format!(
            "Téléchargement incomplet: {}/{} octets reçus.",
            downloaded, total_size
        ));
    }
    if header != b"MZ" {
        return Err("Le fichier téléchargé n'est pas un exécutable Windows.".into());
    }
    let actual: String = hasher
        .finalize()
        .iter()
        .map(|byte| format!("{:02x}", byte))
        .collect();
    if actual != expected {
        return Err("Empreinte SHA-256 de l'installateur incorrecte : fichier rejeté.".into());
    }
    Ok(installer_path)
}

#[tauri::command]
pub async fn download_update_cmd(app: AppHandle, url: String) -> Result<String, String> {
    if !is_allowed_update_url(&url) {
        return Err("URL de téléchargement refusée : seules les releases GitHub officielles de Sprint sont autorisées.".into());
    }
    let parsed = reqwest::Url::parse(&url).map_err(|e| format!("URL invalide: {}", e))?;
    let client = update_http_client()?;

    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let staging_dir =
        std::env::temp_dir().join(format!("sprint_update_{}_{}", std::process::id(), nonce));
    tokio::fs::create_dir_all(&staging_dir)
        .await
        .map_err(|e| format!("Erreur création du dossier temporaire: {}", e))?;

    match fetch_verified_installer(&app, &client, &parsed, &staging_dir).await {
        Ok(installer_path) => Ok(installer_path.to_string_lossy().to_string()),
        Err(error) => {
            // Un échec ne laisse aucun fichier partiel dans le dossier temporaire.
            let _ = tokio::fs::remove_dir_all(&staging_dir).await;
            Err(error)
        }
    }
}

fn clean_path_str(path: &std::path::Path) -> String {
    let s = path.to_string_lossy();
    s.strip_prefix(r"\\?\").unwrap_or(&s).to_string()
}

#[tauri::command]
pub async fn install_update_and_relaunch_cmd(
    app: AppHandle,
    installer_path: String,
) -> Result<(), String> {
    let path = PathBuf::from(&installer_path);

    let temp = std::env::temp_dir();
    let is_in_temp = path
        .parent()
        .is_some_and(|parent| parent.starts_with(&temp));
    let parent_name_ok = path
        .parent()
        .and_then(|p| p.file_name())
        .is_some_and(|n| {
            n.to_string_lossy().starts_with("sprint_update_")
                || n.to_string_lossy().starts_with("portly_update_")
        });
    let is_exe = path
        .extension()
        .is_some_and(|e| e.eq_ignore_ascii_case("exe"));

    if !is_in_temp || !parent_name_ok || !is_exe || !path.is_file() {
        return Err("Installateur invalide ou introuvable.".into());
    }

    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        shutdown_all_managed_processes(&app_handle);
    })
    .await
    .map_err(|e| e.to_string())?;

    let current_exe = std::env::current_exe().unwrap_or_default();
    let installer_clean = clean_path_str(&path);
    let exe_clean = clean_path_str(&current_exe);

    // Les chemins sont transmis par l'environnement, jamais interpolés dans le script :
    // PowerShell ne peut ainsi interpréter aucun caractère d'un nom de fichier.
    std::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            UPDATE_SCRIPT,
        ])
        .env("SPRINT_INSTALLER", &installer_clean)
        .env("SPRINT_EXE", &exe_clean)
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Impossible d'exécuter la mise à jour: {}", e))?;

    app.exit(0);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{expected_sha256, installer_file_name, is_allowed_update_url, UPDATE_SCRIPT};

    #[test]
    fn update_script_never_embeds_paths() {
        assert!(UPDATE_SCRIPT.contains("$env:SPRINT_INSTALLER"));
        assert!(UPDATE_SCRIPT.contains("$env:SPRINT_EXE"));
        assert!(!UPDATE_SCRIPT.contains("'C:"));
    }

    const HASH: &str = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";

    #[test]
    fn finds_hash_for_the_exact_installer_name() {
        let sums = format!("{HASH}  Sprint_0.5.5_x64-setup.exe\n{}  Sprint_portable_0.5.5_x64.exe\n", "a".repeat(64));
        assert_eq!(expected_sha256(&sums, "Sprint_0.5.5_x64-setup.exe").as_deref(), Some(HASH));
        assert_eq!(expected_sha256(&format!("{}  *Sprint_0.5.5_x64-setup.exe", HASH.to_uppercase()), "Sprint_0.5.5_x64-setup.exe").as_deref(), Some(HASH));
        assert_eq!(expected_sha256(&sums, "Sprint_0.5.5_x64-setup.ex"), None);
    }

    #[test]
    fn rejects_malformed_checksum_lines() {
        assert_eq!(expected_sha256("abc  Sprint_setup.exe", "Sprint_setup.exe"), None);
        assert_eq!(expected_sha256(&format!("{}  Sprint_setup.exe", "g".repeat(64)), "Sprint_setup.exe"), None);
        assert_eq!(expected_sha256(&format!("{HASH}"), "Sprint_setup.exe"), None);
    }

    #[test]
    fn only_official_https_hosts_are_allowed() {
        assert!(is_allowed_update_url("https://github.com/owner/repo/releases/download/v1/a.exe"));
        assert!(is_allowed_update_url("https://objects.githubusercontent.com/x/a.exe"));
        assert!(!is_allowed_update_url("http://github.com/owner/repo/a.exe"));
        assert!(!is_allowed_update_url("https://github.com.attacker.example/a.exe"));
        assert!(!is_allowed_update_url("https://attacker.example/github.com/a.exe"));
    }

    #[test]
    fn installer_name_comes_from_the_release_url() {
        let url = reqwest::Url::parse("https://github.com/owner/repo/releases/download/v1/Sprint_1_x64-setup.exe").unwrap();
        assert_eq!(installer_file_name(&url).as_deref(), Some("Sprint_1_x64-setup.exe"));
        let checksums = url.join("SHA256SUMS.txt").unwrap();
        assert_eq!(checksums.as_str(), "https://github.com/owner/repo/releases/download/v1/SHA256SUMS.txt");
    }
}
