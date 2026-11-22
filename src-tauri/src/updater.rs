//! Téléchargement et installation des mises à jour depuis les releases GitHub.

use crate::{shutdown_all_managed_processes, tunnel, CREATE_NO_WINDOW};
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::Command;
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

const UPDATE_SCRIPT: &str = include_str!("install_update.ps1");

struct VerifiedInstaller {
    directory: tempfile::TempDir,
    sha256: String,
}

impl VerifiedInstaller {
    fn path(&self) -> PathBuf {
        self.directory.path().join("Sprint_setup.exe")
    }
}

static VERIFIED_INSTALLER: tokio::sync::Mutex<Option<VerifiedInstaller>> =
    tokio::sync::Mutex::const_new(None);

/// URL d'entrée : uniquement une release du dépôt Sprint. Les hôtes de fichiers
/// GitHub ne sont acceptés qu'en redirection (voir `is_allowed_update_url`).
fn is_sprint_release_url(url: &str) -> bool {
    match reqwest::Url::parse(url) {
        Ok(parsed) => {
            parsed.scheme() == "https"
                && parsed.host_str() == Some("github.com")
                && parsed
                    .path()
                    .to_ascii_lowercase()
                    .starts_with("/nalyd2400/sprint/releases/")
        }
        Err(_) => false,
    }
}

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
    installer_path: &std::path::Path,
) -> Result<String, String> {
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
        format!(
            "Empreinte de {} absente de SHA256SUMS.txt : mise à jour refusée.",
            file_name
        )
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
    let mut file = tokio::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(installer_path)
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
    Ok(expected)
}

#[tauri::command]
pub async fn download_update_cmd(app: AppHandle, url: String) -> Result<(), String> {
    if !is_sprint_release_url(&url) {
        return Err("URL de téléchargement refusée : seules les releases GitHub de NALYD2400/Sprint sont autorisées.".into());
    }
    let parsed = reqwest::Url::parse(&url).map_err(|e| format!("URL invalide: {}", e))?;
    let client = update_http_client()?;

    let mut pending = VERIFIED_INSTALLER
        .try_lock()
        .map_err(|_| "Une mise à jour est déjà en cours.")?;
    *pending = None;
    let directory = tempfile::Builder::new()
        .prefix("sprint_update_")
        .tempdir()
        .map_err(|e| format!("Erreur création du dossier temporaire: {}", e))?;
    let mut installer = VerifiedInstaller {
        directory,
        sha256: String::new(),
    };
    installer.sha256 = fetch_verified_installer(&app, &client, &parsed, &installer.path()).await?;
    *pending = Some(installer);
    Ok(())
}

fn clean_path_str(path: &std::path::Path) -> String {
    let s = path.to_string_lossy();
    s.strip_prefix(r"\\?\").unwrap_or(&s).to_string()
}

#[tauri::command]
pub async fn install_update_and_relaunch_cmd(app: AppHandle) -> Result<(), String> {
    let mut pending = VERIFIED_INSTALLER
        .try_lock()
        .map_err(|_| "Une mise à jour est déjà en cours.")?;
    let installer = pending
        .as_ref()
        .ok_or("Téléchargez et vérifiez la mise à jour avant de l’installer.")?;
    let mut validate = installer_command(installer, true)?;
    let mut launch = installer_command(installer, false)?;
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let verification = validate
            .output()
            .map_err(|error| format!("Vérification de l’installateur impossible : {error}"))?;
        if !verification.status.success() {
            let error = String::from_utf8_lossy(&verification.stderr);
            return Err(format!("Installateur refusé : {}", error.trim()));
        }
        shutdown_all_managed_processes(&app_handle)?;
        if let Err(error) = launch.spawn() {
            tunnel::cancel_shutdown();
            return Err(format!("Impossible de démarrer la mise à jour : {error}"));
        }
        Ok(())
    })
    .await
    .map_err(|error| error.to_string())??;

    // L'installateur sera supprimé par le processus qui le lance, après la fermeture de Sprint.
    if let Some(installer) = pending.take() {
        let _ = installer.directory.keep();
    }
    app.exit(0);
    Ok(())
}

fn installer_command(
    installer: &VerifiedInstaller,
    validate_only: bool,
) -> Result<Command, String> {
    let windows =
        PathBuf::from(std::env::var_os("SystemRoot").ok_or("Répertoire Windows introuvable.")?);
    let current_exe = std::env::current_exe().map_err(|error| error.to_string())?;
    let powershell = windows.join("System32/WindowsPowerShell/v1.0");
    let mut command = Command::new(powershell.join("powershell.exe"));
    command
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            UPDATE_SCRIPT,
        ])
        .env("SPRINT_INSTALLER", clean_path_str(&installer.path()))
        .env("PSModulePath", powershell.join("Modules"))
        .env("SPRINT_INSTALLER_SHA256", &installer.sha256)
        .env("SPRINT_EXE", clean_path_str(&current_exe))
        .env("SPRINT_UPDATE_PARENT", std::process::id().to_string())
        .env(
            "SPRINT_UPDATE_VALIDATE_ONLY",
            if validate_only { "1" } else { "0" },
        )
        .creation_flags(CREATE_NO_WINDOW);
    Ok(command)
}

#[cfg(test)]
mod tests {
    use super::{
        expected_sha256, installer_command, installer_file_name, is_allowed_update_url,
        is_sprint_release_url, VerifiedInstaller, UPDATE_SCRIPT,
    };

    #[test]
    fn update_script_never_embeds_paths() {
        assert!(UPDATE_SCRIPT.contains("$env:SPRINT_INSTALLER"));
        assert!(UPDATE_SCRIPT.contains("$env:SPRINT_EXE"));
        assert!(!UPDATE_SCRIPT.contains("'C:"));
    }

    #[test]
    fn windows_verifies_the_staged_file_again_before_launch() {
        use sha2::{Digest, Sha256};

        let bytes = std::fs::read(std::env::current_exe().unwrap()).unwrap();
        let installer = VerifiedInstaller {
            directory: tempfile::tempdir().unwrap(),
            sha256: format!("{:x}", Sha256::digest(&bytes)),
        };
        std::fs::write(installer.path(), bytes).unwrap();
        let valid = installer_command(&installer, true)
            .unwrap()
            .output()
            .unwrap();
        assert!(
            valid.status.success(),
            "{}",
            String::from_utf8_lossy(&valid.stderr)
        );

        std::fs::write(installer.path(), b"altered after download").unwrap();
        let invalid = installer_command(&installer, true)
            .unwrap()
            .output()
            .unwrap();
        assert!(!invalid.status.success());
        assert!(String::from_utf8_lossy(&invalid.stderr).contains("depuis son téléchargement"));
    }

    const HASH: &str = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";

    #[test]
    fn finds_hash_for_the_exact_installer_name() {
        let sums = format!(
            "{HASH}  Sprint_0.5.5_x64-setup.exe\n{}  Sprint_portable_0.5.5_x64.exe\n",
            "a".repeat(64)
        );
        assert_eq!(
            expected_sha256(&sums, "Sprint_0.5.5_x64-setup.exe").as_deref(),
            Some(HASH)
        );
        assert_eq!(
            expected_sha256(
                &format!("{}  *Sprint_0.5.5_x64-setup.exe", HASH.to_uppercase()),
                "Sprint_0.5.5_x64-setup.exe"
            )
            .as_deref(),
            Some(HASH)
        );
        assert_eq!(expected_sha256(&sums, "Sprint_0.5.5_x64-setup.ex"), None);
    }

    #[test]
    fn rejects_malformed_checksum_lines() {
        assert_eq!(
            expected_sha256("abc  Sprint_setup.exe", "Sprint_setup.exe"),
            None
        );
        assert_eq!(
            expected_sha256(
                &format!("{}  Sprint_setup.exe", "g".repeat(64)),
                "Sprint_setup.exe"
            ),
            None
        );
        assert_eq!(expected_sha256(HASH, "Sprint_setup.exe"), None);
    }

    #[test]
    fn download_requires_the_sprint_repository() {
        assert!(is_sprint_release_url(
            "https://github.com/NALYD2400/Sprint/releases/download/v0.5.14/Sprint_0.5.14_x64-setup.exe"
        ));
        assert!(!is_sprint_release_url(
            "https://github.com/owner/repo/releases/download/v1/a.exe"
        ));
        assert!(!is_sprint_release_url(
            "https://objects.githubusercontent.com/github.com/NALYD2400/Sprint/a.exe"
        ));
        assert!(!is_sprint_release_url(
            "https://github.com/NALYD2400/Sprint/archive/refs/heads/main.zip"
        ));
    }

    #[test]
    fn only_official_https_hosts_are_allowed() {
        assert!(is_allowed_update_url(
            "https://github.com/owner/repo/releases/download/v1/a.exe"
        ));
        assert!(is_allowed_update_url(
            "https://objects.githubusercontent.com/x/a.exe"
        ));
        assert!(!is_allowed_update_url("http://github.com/owner/repo/a.exe"));
        assert!(!is_allowed_update_url(
            "https://github.com.attacker.example/a.exe"
        ));
        assert!(!is_allowed_update_url(
            "https://attacker.example/github.com/a.exe"
        ));
    }

    #[test]
    fn installer_name_comes_from_the_release_url() {
        let url = reqwest::Url::parse(
            "https://github.com/owner/repo/releases/download/v1/Sprint_1_x64-setup.exe",
        )
        .unwrap();
        assert_eq!(
            installer_file_name(&url).as_deref(),
            Some("Sprint_1_x64-setup.exe")
        );
        let checksums = url.join("SHA256SUMS.txt").unwrap();
        assert_eq!(
            checksums.as_str(),
            "https://github.com/owner/repo/releases/download/v1/SHA256SUMS.txt"
        );
    }
}
