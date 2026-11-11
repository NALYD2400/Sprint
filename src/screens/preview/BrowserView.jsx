import React, { useState, useEffect, useMemo, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  RotateCw,
  ExternalLink,
  Monitor,
  Tablet,
  Smartphone,
  Copy,
  Check,
  Terminal,
  Columns,
  Play,
  Square,
  QrCode,
  ArrowRight,
  Loader2,
  X,
} from 'lucide-react';
import { triggerToast } from '../../lib/toastBus';
import { useServerLogs } from '../../hooks/useServerLogs';
import useServerOperations from '../../hooks/useServerOperations';
import { startServer, stopServer } from '../../lib/serverActions';
import EmptyState from '../../components/ui/EmptyState';
import { loadPreviewPrefs, savePreviewPrefs } from './previewPrefs';
import PageHeader from '../../components/ui/PageHeader';
import SprintNavIcon from '../../components/layout/SprintNavIcon';
import PreviewFrame from './PreviewFrame';
import Modal from '../../components/ui/Modal';

const DEVICES = [
  ['desktop', 'Ordinateur', Monitor],
  ['tablet', 'Tablette', Tablet],
  ['mobile', 'Mobile', Smartphone],
  ['dual', 'Comparer', Columns],
  ['custom', 'Libre', null],
];
export default function BrowserView({ projects = [], initialServerId, initialUrl, onTargetConsumed, onSelectTab }) {
  const [savedPreview] = useState(loadPreviewPrefs);
  const servers = useMemo(
    () =>
      projects.flatMap((project) =>
        (project.servers || [])
          .filter((server) => server.port > 0)
          .map((server) => ({
            ...server,
            projectName: project.name,
            projectRoot: project.root,
            url: server.url || `http://localhost:${server.port}`,
          })),
      ),
    [projects],
  );
  const [serverId, setServerId] = useState(
    initialServerId || (servers.some((server) => server.id === savedPreview.serverId) ? savedPreview.serverId : null)
      || servers.find((server) => server.state === 'running')?.id || servers[0]?.id,
  );
  const server = servers.find((item) => item.id === serverId) || servers[0];
  const [url, setUrl] = useState(initialUrl || (savedPreview.serverId === server?.id ? savedPreview.url : '') || server?.url || '');
  const [address, setAddress] = useState(url);
  const [frameKey, setFrameKey] = useState(0);
  const [mode, setMode] = useState(savedPreview.mode);
  const [width, setWidth] = useState(savedPreview.width);
  const [height, setHeight] = useState(savedPreview.height);
  const [fit, setFit] = useState(savedPreview.fit);
  const [online, setOnline] = useState(null);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [localIp, setLocalIp] = useState('127.0.0.1');
  const [showQr, setShowQr] = useState(false);
  const timers = useRef({});
  const getOperation = useServerOperations();
  const previousOnline = useRef({ id: null, online: null });
  const { logs, clearLogs } = useServerLogs(server?.id);
  useEffect(
    () => () => {
      Object.values(timers.current).forEach(clearTimeout);
    },
    [],
  );
  useEffect(() => {
    invoke('get_local_ip_cmd')
      .then(setLocalIp)
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (initialServerId) setServerId(initialServerId);
    if (initialUrl) {
      setUrl(initialUrl);
      setAddress(initialUrl);
    }
    if (initialServerId || initialUrl) onTargetConsumed?.();
  }, [initialServerId, initialUrl, onTargetConsumed]);
  useEffect(() => {
    savePreviewPrefs({ serverId: server?.id || null, url, mode,
      width: Number(width), height: Number(height), fit });
  }, [server?.id, url, mode, width, height, fit]);
  useEffect(() => {
    setOnline(null);
    if (!server?.port) return undefined;
    let disposed = false;
    let checking = false;
    const check = async () => {
      if (disposed || checking || document.hidden) return;
      checking = true;
      try {
        const up = await invoke('ping_port_cmd', { port: server.port });
        if (!disposed) setOnline(!!up);
      } catch {
        if (!disposed) setOnline(false);
      } finally {
        checking = false;
      }
    };
    check();
    const timer = setInterval(check, 2500);
    document.addEventListener('visibilitychange', check);
    return () => {
      disposed = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, [server?.id, server?.port]);
  useEffect(() => {
    if (online && starting) {
      setStarting(false);
      clearTimeout(timers.current.start);
      setFrameKey((key) => key + 1);
    }
  }, [online, starting]);
  useEffect(() => {
    if (online === true && previousOnline.current.id === server?.id && previousOnline.current.online === false)
      setFrameKey((key) => key + 1);
    previousOnline.current = { id: server?.id, online };
  }, [online, server?.id]);
  const selectServer = (id) => {
    const selected = servers.find((item) => item.id === id);
    if (!selected) return;
    clearTimeout(timers.current.start);
    setStarting(false);
    setServerId(id);
    setUrl(selected.url);
    setAddress(selected.url);
    setError('');
    setOnline(null);
    setFrameKey((key) => key + 1);
  };
  const navigate = (event) => {
    event.preventDefault();
    try {
      const text = address.trim();
      const target = text.startsWith('/')
        ? new URL(text, url || server?.url)
        : new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(text) || /^(?:https?|javascript|file|data|about):/i.test(text)
          ? text : 'http://' + text);
      if (!['http:', 'https:'].includes(target.protocol))
        throw new Error('Utilisez une adresse http ou https.');
      setUrl(target.href);
      setAddress(target.href);
      setError('');
      setFrameKey((key) => key + 1);
    } catch {
      setError('Adresse invalide. Utilisez une URL http ou https, ou un chemin comme /contact.');
    }
  };
  const copy = async (value) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      clearTimeout(timers.current.copy);
      timers.current.copy = setTimeout(() => setCopied(false), 2000);
    } catch (reason) {
      triggerToast({
        title: 'Copie impossible',
        message: String(reason),
        type: 'error',
      });
    }
  };
  const openExternal = () =>
    invoke('open_browser', { url }).catch((reason) =>
      triggerToast({
        title: 'Navigateur',
        message: String(reason),
        type: 'error',
      }),
    );
  const start = async () => {
    if (!server || getOperation(server.id) || starting) return;
    setStarting(true);
    clearTimeout(timers.current.start);
    timers.current.start = setTimeout(() => {
      setStarting(false);
      triggerToast({
        title: 'Serveur indisponible',
        message: 'Le port ne répond pas encore. Consultez les logs.',
        type: 'warning',
      });
    }, 30000);
    try {
      await startServer({ root: server.projectRoot }, server);
    } catch (reason) {
      clearTimeout(timers.current.start);
      setStarting(false);
      triggerToast({
        title: 'Lancement impossible',
        message: String(reason),
        type: 'error',
      });
    }
  };
  const stop = async () => {
    if (!server || getOperation(server.id) || stopping) return;
    setStopping(true);
    try {
      await stopServer(server);
      setOnline(false);
    } catch (reason) {
      triggerToast({
        title: 'Arrêt impossible',
        message: String(reason),
        type: 'error',
      });
    } finally {
      setStopping(false);
    }
  };
  let localTarget = false;
  try {
    localTarget = !!server && new URL(url).origin === new URL(server.url).origin;
  } catch {}
  const canPreview = !!url && (!localTarget || online === true);
  const offline = (
    <EmptyState className="preview-offline" icon={Monitor}
      title={server ? online === null ? 'Vérification du serveur…' : server.projectName + ' est hors ligne' : 'Aucun serveur web configuré'}
      description={server ? 'Lancez le serveur pour afficher votre site.' : 'Ajoutez un serveur avec un port dans vos projets.'}
      command={server?.command}>
      {server ? (
        <button
          className="btn"
          disabled={starting || !!getOperation(server?.id) || online === null}
          onClick={start}
        >
          {starting ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          {starting ? 'Démarrage…' : 'Lancer le serveur'}
        </button>
      ) : (
        <button className="btn" onClick={() => onSelectTab?.('projects')}>
          Aller aux projets
        </button>
      )}
    </EmptyState>
  );
  let lanUrl = url;
  try {
    const target = new URL(url);
    if (server?.port && localTarget) target.hostname = localIp;
    lanUrl = target.href;
  } catch {}
  const dimensions =
    mode === 'mobile'
      ? '390 × 844'
      : mode === 'tablet'
        ? '768 × 1024'
        : mode === 'custom'
          ? width + ' × ' + height
          : mode === 'dual'
            ? '1280 × 800 + 390 × 844'
            : 'Largeur disponible';
  const frame = (name, frameWidth, frameHeight) => (
    <PreviewFrame
      name={name}
      url={url}
      frameKey={frameKey + '-' + name}
      width={frameWidth}
      height={frameHeight}
      fit={fit}
      showCaption={mode !== 'desktop'}
      onRetry={() => setFrameKey((key) => key + 1)}
      onOpenExternal={openExternal}
    >
      {canPreview ? null : offline}
    </PreviewFrame>
  );
  return (
    <div className="page preview-page">
      <PageHeader
        title="Aperçu web" icon={<SprintNavIcon name="browser" active />}
        actions={
          <>
            <div className="preview-device-controls">
              <div className="segmented-control" aria-label="Format de l’aperçu">
                {DEVICES.map(([id, label, Icon]) => (
                  <button key={id} aria-pressed={mode === id} onClick={() => setMode(id)}>
                    {Icon && <Icon size={14} />}
                    {label}
                  </button>
                ))}
              </div>
              {mode === 'custom' && (
                <div className="preview-custom-size">
                  <input aria-label="Largeur de l’aperçu" type="number" min="240" max="3840"
                    value={width} className="control-input"
                    onChange={(event) => setWidth(event.target.value)}
                    onBlur={() => setWidth(Math.min(3840, Math.max(240, Number(width) || 1280)))} />
                  <span aria-hidden="true">×</span>
                  <input aria-label="Hauteur de l’aperçu" type="number" min="240" max="2160"
                    value={height} className="control-input"
                    onChange={(event) => setHeight(event.target.value)}
                    onBlur={() => setHeight(Math.min(2160, Math.max(240, Number(height) || 800)))} />
                </div>
              )}
              <select className="control-input" aria-label="Zoom de l’aperçu"
                value={fit ? 'fit' : 'actual'} onChange={(event) => setFit(event.target.value === 'fit')}>
                <option value="fit">Ajuster</option>
                <option value="actual">100 %</option>
              </select>
            </div>
            <div className="preview-header-actions">
              <button
                className="icon-button"
                aria-label="Tester sur téléphone"
                title="Tester sur téléphone"
                disabled={!server || !online || !localTarget}
                onClick={() => setShowQr(true)}
              >
                <QrCode size={16} />
              </button>
              <button
                className="quiet-button"
                aria-pressed={showLogs}
                onClick={() => setShowLogs(!showLogs)}
              >
                <Terminal size={14} />
                Logs
              </button>
            </div>
          </>
        }
      />
      <div className="preview-toolbar">
        <select
          className="control-input preview-server-select"
          aria-label="Serveur à prévisualiser"
          title={server ? server.projectName + ' · ' + server.name : 'Aucun serveur'}
          value={server?.id || ''}
          disabled={starting || stopping || !!getOperation(server?.id)}
          onChange={(event) => selectServer(event.target.value)}
        >
          {servers.length ? (
            servers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.projectName} · {item.name} :{item.port}
              </option>
            ))
          ) : (
            <option value="">Aucun serveur</option>
          )}
        </select>
        <form className="preview-address" onSubmit={navigate}>
          <button
            type="button"
            className="icon-button"
            title="Recharger"
            aria-label="Recharger l’aperçu"
            disabled={!url}
            onClick={() => setFrameKey((key) => key + 1)}
          >
            <RotateCw size={14} />
          </button>
          <input
            aria-label="Adresse de l’aperçu"
            className="control-input font-mono"
            placeholder="http://localhost:3000"
            value={address}
            aria-invalid={!!error}
            aria-describedby={error ? 'preview-address-error' : undefined}
            onChange={(event) => { setAddress(event.target.value); setError(''); }}
          />
          <button type="submit" className="icon-button" aria-label="Aller" title="Aller à cette adresse">
            <ArrowRight size={14} />
          </button>
          <button
            type="button"
            disabled={!url}
            className="icon-button"
            title="Copier l’URL"
            aria-label="Copier l’URL"
            onClick={() => copy(url)}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
          <button
            type="button"
            className="icon-button"
            title="Ouvrir dans le navigateur si le site bloque l’intégration"
            aria-label="Ouvrir dans le navigateur"
            disabled={!url}
            onClick={openExternal}
          >
            <ExternalLink size={14} />
          </button>
        </form>
        <div className="preview-server-state">
          <span className="preview-status" role="status" title={dimensions}>
            <span className={'server-dot ' + (localTarget && online ? 'running' : '')} />
            {!localTarget && url ? 'Adresse externe' : server
              ? online === null
                ? 'Vérification…'
                : online
                  ? 'Serveur en ligne'
                  : 'Serveur arrêté'
              : 'Aucun serveur'}
          </span>
          {server && (
            <button
              className="quiet-button"
              disabled={starting || stopping || !!getOperation(server?.id) || online === null}
              onClick={online ? stop : start}
            >
              {online ? <Square size={13} /> : <Play size={14} />}
              {stopping ? 'Arrêt…' : online ? 'Arrêter' : starting ? 'Démarrage…' : 'Lancer'}
            </button>
          )}
        </div>
      </div>
      {error && (
        <p id="preview-address-error" className="text-xs text-rose-400 mt-3" role="alert">
          {error}
        </p>
      )}
      <div
        className={
          'preview-stage' + (mode !== 'desktop' ? ' device' : '') + (mode === 'dual' ? ' dual' : '')
        }
      >
        {mode === 'dual' ? (
          <>
            {frame('Ordinateur', 1280, 800)}
            {frame('Mobile', 390, 844)}
          </>
        ) : mode === 'mobile' ? (
          frame('Mobile', 390, 844)
        ) : mode === 'tablet' ? (
          frame('Tablette', 768, 1024)
        ) : mode === 'custom' ? (
          frame(
            'Format libre',
            Math.min(3840, Math.max(240, Number(width) || 1280)),
            Math.min(2160, Math.max(240, Number(height) || 800)),
          )
        ) : (
          frame('Ordinateur', null, null)
        )}
      </div>
      <div className="preview-footnote"><span>{dimensions}</span>
        <span>Page vide ou intégration refusée ? <button className="log-resume inline-flex items-center min-h-6" disabled={!url} onClick={openExternal}>Ouvrir dans le navigateur <ExternalLink size={12} /></button></span>
      </div>
      {showLogs && (
        <div className="preview-logs">
          <div className="preview-logs-heading">
            <span className="text-zinc-400">{server?.name || 'Logs'}</span>
            <div className="flex gap-2"><button className="quiet-button" onClick={() => onSelectTab?.('terminal', server?.id)}>Console complète</button>
              <button className="quiet-button" disabled={!logs.length} onClick={clearLogs}>Effacer</button>
              <button className="icon-button" aria-label="Fermer les logs de l’aperçu" onClick={() => setShowLogs(false)}><X size={14} /></button></div>
          </div>
          {logs.length ? (
            logs.slice(-100).map((entry) => (
              <div key={entry.id} className={entry.isError ? 'text-rose-300' : 'text-zinc-300'}>
                {entry.clean}
              </div>
            ))
          ) : (
            <p className="text-zinc-400">Les logs de ce serveur apparaîtront ici.</p>
          )}
        </div>
      )}
      <Modal
        isOpen={showQr}
        onClose={() => setShowQr(false)}
        labelledBy="qr-preview-title"
        maxWidth="max-w-sm"
      >
        <div className="p-6 text-center">
          <div className="flex justify-between">
            <h2 id="qr-preview-title" className="text-sm">
              Tester sur téléphone
            </h2>
            <button className="icon-button" aria-label="Fermer" onClick={() => setShowQr(false)}>
              <X size={14} />
            </button>
          </div>
          <p className="text-xs text-zinc-400 my-3">
            Sur le même Wi-Fi, avec un serveur accessible sur le réseau local.
          </p>
          <img
            className="w-48 h-48 mx-auto"
            alt="QR code de l’aperçu"
            src={
              'https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=12&data=' +
              encodeURIComponent(lanUrl)
            }
          />
          <button className="quiet-button mt-3 font-mono" onClick={() => copy(lanUrl)}>
            {lanUrl}
          </button>
        </div>
      </Modal>
    </div>
  );
}
