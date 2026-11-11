import React, { useState, useEffect, useRef, useCallback, useId } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { DownloadCloud, RefreshCw, CheckCircle2, X, AlertCircle } from 'lucide-react';
import Modal from '../ui/Modal';
import { GITHUB_REPO, isNewerVersion } from '../../lib/updates';

export default function AutoUpdateModal({ isOpen, onClose, currentVersion }) {
  const [status, setStatus] = useState('checking'); // checking | available | downloading | installing | completed | upToDate | error
  const [latestVersion, setLatestVersion] = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [installerPath, setInstallerPath] = useState('');
  const [progress, setProgress] = useState(0);
  const [downloadedBytes, setDownloadedBytes] = useState('0');
  const [totalBytes, setTotalBytes] = useState('... Mo');
  const [errorMessage, setErrorMessage] = useState('');
  const mountedRef = useRef(true);
  const titleId = useId();

  // Le téléchargement/ l'installation verrouillent la fermeture de la modal
  const isBusy = status === 'downloading' || status === 'installing';

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const checkForUpdates = useCallback(
    async (signal) => {
      setStatus('checking');
      setProgress(0);
      setErrorMessage('');

      try {
        const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
          headers: { Accept: 'application/vnd.github.v3+json' },
          signal,
        });

        if (!res.ok) {
          if (res.status === 403) {
            setErrorMessage(
              'Limite de requêtes GitHub API atteinte (60 req/h). Réessayez plus tard.',
            );
          } else {
            setErrorMessage(`Serveur GitHub indisponible (code HTTP ${res.status}).`);
          }
          setStatus('error');
          return;
        }

        const data = await res.json();
        const tag = data.tag_name ? data.tag_name.replace(/^v/, '').trim() : '';
        setLatestVersion(tag);
        setReleaseNotes(data.body || 'Dernières améliorations et correctifs de performance.');

        const assets = data.assets || [];
        const asset = assets.find((item) => /(?:setup|installer).*\.exe$/i.test(item.name))
          || assets.find((item) => /\.msi$/i.test(item.name))
          || assets.find((item) => /\.exe$/i.test(item.name) && !/portable/i.test(item.name));
        if (asset) {
          setDownloadUrl(asset.browser_download_url);
        } else if (tag) {
          setDownloadUrl(
            `https://github.com/${GITHUB_REPO}/releases/download/v${tag}/Sprint_${tag}_x64-setup.exe`,
          );
        }

        if (tag && isNewerVersion(tag, currentVersion)) {
          setStatus('available');
        } else {
          setStatus('upToDate');
        }
      } catch (e) {
        if (e.name === 'AbortError' || !mountedRef.current) return;
        setErrorMessage('Impossible de se connecter aux serveurs GitHub Releases.');
        setStatus('error');
      }
    },
    [currentVersion],
  );

  useEffect(() => {
    if (!isOpen) return undefined;
    const controller = new AbortController();
    checkForUpdates(controller.signal);
    return () => controller.abort();
  }, [isOpen, checkForUpdates]);

  const handleStartUpdate = async () => {
    setStatus('downloading');
    setProgress(0);
    setErrorMessage('');

    let unlisten = null;
    try {
      unlisten = await listen('update-progress', (event) => {
        if (!mountedRef.current) return;
        const payload = event.payload;
        if (payload && payload.percentage !== undefined) {
          setProgress(payload.percentage);
          if (payload.downloaded !== undefined && payload.total) {
            setDownloadedBytes(`${(payload.downloaded / (1024 * 1024)).toFixed(1)} Mo`);
            setTotalBytes(`${(payload.total / (1024 * 1024)).toFixed(1)} Mo`);
          }
        }
      });
    } catch (e) {
      console.warn('Could not listen to update-progress:', e);
    }

    try {
      const targetUrl =
        downloadUrl ||
        `https://github.com/${GITHUB_REPO}/releases/download/v${latestVersion}/Sprint_${latestVersion}_x64-setup.exe`;
      const downloadedPath = await invoke('download_update_cmd', { url: targetUrl });
      if (!mountedRef.current) return;
      setInstallerPath(downloadedPath);
      setStatus('completed');
    } catch (err) {
      if (!mountedRef.current) return;
      setErrorMessage(typeof err === 'string' ? err : err?.message || String(err));
      setStatus('error');
    } finally {
      if (unlisten) unlisten();
    }
  };

  const handleRestart = async () => {
    setStatus('installing');
    try {
      await invoke('install_update_and_relaunch_cmd', { installerPath });
    } catch (e) {
      if (!mountedRef.current) return;
      setErrorMessage(typeof e === 'string' ? e : e?.message || String(e));
      setStatus('error');
    }
  };

  const percentage = Math.min(100, Math.max(0, Number(progress) || 0));
  const messages = {
    checking: ['Recherche de mise à jour…', 'Vérification des versions disponibles.'],
    upToDate: ['Sprint est à jour', `Vous utilisez la version ${currentVersion}.`],
    available: [`Sprint ${latestVersion} est disponible`, `Version installée : ${currentVersion}.`],
    downloading: [
      `Téléchargement de Sprint ${latestVersion}`,
      'Vous pourrez installer la mise à jour une fois le téléchargement terminé.',
    ],
    installing: [
      'Lancement de l’installateur…',
      'Sprint va se fermer pour appliquer la mise à jour.',
    ],
    completed: ['La mise à jour est prête', `Sprint ${latestVersion} a été téléchargé.`],
    error: ['La mise à jour a échoué', errorMessage],
  };
  const [heading, detail] = messages[status];
  const StatusIcon =
    status === 'error'
      ? AlertCircle
      : status === 'upToDate' || status === 'completed'
        ? CheckCircle2
        : status === 'checking' || status === 'downloading' || status === 'installing'
          ? RefreshCw
          : DownloadCloud;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      dismissible={!isBusy}
      maxWidth="max-w-md"
      labelledBy={titleId}
      panelClassName="workspace-dialog"
      backdropClassName="workspace-modal-backdrop"
    >
      <header className="update-header">
        <div>
          <h2 id={titleId}>Mises à jour</h2>
          <p>Sprint · version {currentVersion}</p>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          disabled={isBusy}
          aria-label="Fermer la fenêtre de mise à jour"
        >
          <X size={16} />
        </button>
      </header>
      <div className="update-body">
        <div className="update-status" role={status === 'error' ? 'alert' : 'status'}>
          <StatusIcon
            size={20}
            aria-hidden="true"
            className={status === 'checking' || status === 'installing' ? 'animate-spin' : ''}
          />
          <div>
            <h3>{heading}</h3>
            <p>{detail}</p>
          </div>
        </div>
        {status === 'available' && (
          <section className="update-notes" aria-label="Notes de version">
            <h3>Notes de version</h3>
            <div>{releaseNotes}</div>
          </section>
        )}
        {status === 'downloading' && (
          <div className="update-download">
            <div
              className="update-progress"
              role="progressbar"
              aria-label="Téléchargement de la mise à jour"
              aria-valuenow={percentage}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div style={{ width: percentage + '%' }} />
            </div>
            <div className="update-download-details">
              <span>
                {downloadedBytes} / {totalBytes}
              </span>
              <span>{Math.round(percentage)} %</span>
            </div>
          </div>
        )}
      </div>
      <footer className="update-actions">
        {status === 'checking' && (
          <button type="button" className="btn" onClick={onClose}>
            Fermer
          </button>
        )}
        {status === 'upToDate' && (
          <button type="button" className="btn" onClick={onClose}>
            Fermer
          </button>
        )}
        {status === 'available' && (
          <>
            <button type="button" className="quiet-button" onClick={onClose}>
              Plus tard
            </button>
            <button type="button" className="btn theme-accent-btn" onClick={handleStartUpdate}>
              <DownloadCloud size={14} />
              Télécharger la mise à jour
            </button>
          </>
        )}
        {isBusy && (
          <span>
            {status === 'downloading' ? 'Téléchargement en cours…' : 'Installation en cours…'}
          </span>
        )}
        {status === 'completed' && (
          <>
            <button type="button" className="quiet-button" onClick={onClose}>
              Plus tard
            </button>
            <button type="button" className="btn theme-accent-btn" onClick={handleRestart}>
              Installer et relancer Sprint
            </button>
          </>
        )}
        {status === 'error' && (
          <>
            <button type="button" className="quiet-button" onClick={onClose}>
              Fermer
            </button>
            <button type="button" className="btn" onClick={() => checkForUpdates(undefined)}>
              <RefreshCw size={14} />
              Réessayer
            </button>
          </>
        )}
      </footer>
    </Modal>
  );
}
