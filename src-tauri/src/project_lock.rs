use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

static NEXT_OWNER: AtomicU64 = AtomicU64::new(0);

/// Sprint et le serveur MCP échangent le même verrou dans le dossier du catalogue.
/// Le répertoire candidat contient déjà son propriétaire lorsqu'il devient le verrou.
pub(crate) struct ProjectLock {
    directory: PathBuf,
    owner: String,
}

impl ProjectLock {
    pub(crate) fn acquire(projects_file: &Path) -> Result<Self, String> {
        let directory = crate::config_store::with_suffix(projects_file, "lock");
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let sequence = NEXT_OWNER.fetch_add(1, Ordering::Relaxed);
        let owner = format!("owner-{}-{timestamp}-{sequence}", std::process::id());
        let candidate = directory.with_extension(format!("lock.{owner}"));
        fs::create_dir(&candidate).map_err(lock_error)?;
        let mut guard = Self {
            directory: candidate,
            owner,
        };
        fs::File::create(guard.directory.join(&guard.owner)).map_err(lock_error)?;

        let deadline = Instant::now() + Duration::from_secs(3);
        loop {
            match fs::rename(&guard.directory, &directory) {
                Ok(()) => {
                    guard.directory = directory;
                    return Ok(guard);
                }
                Err(error) if !directory.is_dir() && error.kind() != ErrorKind::AlreadyExists => {
                    // Le détenteur peut avoir libéré le verrou pendant le renommage.
                    if !matches!(
                        error.kind(),
                        ErrorKind::PermissionDenied | ErrorKind::DirectoryNotEmpty
                    ) {
                        return Err(lock_error(error));
                    }
                }
                Err(_) => clear_abandoned_lock(&directory),
            }
            if Instant::now() >= deadline {
                return Err("Le catalogue Sprint est occupé. Réessayez dans un instant.".into());
            }
            std::thread::sleep(Duration::from_millis(40));
        }
    }
}

impl Drop for ProjectLock {
    fn drop(&mut self) {
        let _ = fs::remove_file(self.directory.join(&self.owner));
        let _ = fs::remove_dir(&self.directory);
    }
}

fn clear_abandoned_lock(directory: &Path) {
    let Ok(mut entries) = fs::read_dir(directory) else {
        return;
    };
    let Some(Ok(entry)) = entries.next() else {
        // Un arrêt entre la suppression du propriétaire et celle du dossier laisse un dossier vide.
        let _ = fs::remove_dir(directory);
        return;
    };
    if entries.next().is_some() {
        return;
    }
    let name = entry.file_name();
    let pid = name
        .to_str()
        .and_then(|name| name.strip_prefix("owner-"))
        .and_then(|name| name.split_once('-'))
        .and_then(|(pid, _)| pid.parse::<u32>().ok())
        .filter(|&pid| pid > 0);
    if let Some(pid) = pid {
        let mut processes = sysinfo::System::new();
        let this_process = sysinfo::Pid::from_u32(std::process::id());
        let owner = sysinfo::Pid::from_u32(pid);
        processes
            .refresh_pids_specifics(&[this_process, owner], sysinfo::ProcessRefreshKind::new());
        if processes.process(this_process).is_some() && processes.process(owner).is_none() {
            // Le nom unique empêche de supprimer le marqueur d'un nouveau détenteur.
            let _ = fs::remove_file(entry.path());
            let _ = fs::remove_dir(directory);
        }
    }
}

fn lock_error(error: std::io::Error) -> String {
    format!("Impossible de verrouiller le catalogue Sprint : {error}")
}
