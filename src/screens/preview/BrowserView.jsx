import React, { useState, useEffect, useRef } from 'react';
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
  Plus,
  Square,
  ArrowRight,
  Loader2,
  X,
  ChevronDown,
  ChevronUp,
  Ruler,
} from 'lucide-react';
import { triggerToast } from '../../lib/toastBus';
import { useServerLogs } from '../../hooks/useServerLogs';
import useServerOperations from '../../hooks/useServerOperations';
import { startServer, stopServer } from '../../lib/serverActions';
import EmptyState from '../../components/ui/EmptyState';
import { loadPreviewPrefs, savePreviewPrefs } from './previewPrefs';
import SprintNavIcon from '../../components/layout/SprintNavIcon';
import PreviewFrame from './PreviewFrame';
import Modal from '../../components/ui/Modal';
import ProjectAvatar from '../../components/ui/ProjectAvatar';
import LogContent from '../../components/ui/LogContent';
import ServerPickerMenu from '../../components/ui/ServerPickerMenu';
import { isServerLive, serverStatusLabel, serverStatusTone } from '../../lib/logTabs';

const DEVICES = [
  ['desktop', 'Ordinateur', Monitor],
  ['tablet', 'Tablette', Tablet],
  ['mobile', 'Mobile', Smartphone],
  ['dual', 'Comparer', Columns],
  ['custom', 'Libre', Ruler],
];

export default function BrowserView({
  projects = [],
  projectIcons = {},
  servers = [],
  openPreviewIds = [],
  openPreviewServers = [],
  activeServerId = null,
  browserTarget = { serverId: null, url: null, seq: 0 },
  onOpenPreviewTab,
  onTargetConsumed,
  sidebarCollapsed = false,
  onSelectTab,
}) {
  const [savedPreview] = useState(loadPreviewPrefs);
  const server = servers.find((item) => item.id === activeServerId) || null;
  const tabUrls = useRef({});
  const [url, setUrl] = useState(() => {
    if (browserTarget?.url) return browserTarget.url;
    if (browserTarget?.serverId) {
      const targetServer = servers.find((item) => item.id === browserTarget.serverId);
      return targetServer?.url || '';
    }
    if (server && savedPreview.serverId === server.id && savedPreview.url) {
      return savedPreview.url;
    }
    return server?.url || '';
  });
  const [address, setAddress] = useState(url);
  const prevSelectionRef = useRef({ id: activeServerId, url });
  if (prevSelectionRef.current.id === activeServerId) {
    prevSelectionRef.current.url = url;
  }

  const [frameKey, setFrameKey] = useState(0);
  const [mode, setMode] = useState(savedPreview.mode);
  const [width, setWidth] = useState(savedPreview.width);
  const [height, setHeight] = useState(savedPreview.height);
  const [fit, setFit] = useState(savedPreview.fit);
  const [online, setOnline] = useState(null);
  const [starting, setStarting] = useState(false);
  const [stoppingId, setStoppingId] = useState(null);
  const [showLogs, setShowLogs] = useState(false);
  const [logsHeight, setLogsHeight] = useState(savedPreview.logsHeight);
  const [pageHeight, setPageHeight] = useState(600);
  const [showControls, setShowControls] = useState(false);
  const [controlsHeight, setControlsHeight] = useState(0);
  const [resizingLogs, setResizingLogs] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerPoint, setPickerPoint] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [localIp, setLocalIp] = useState('127.0.0.1');
  const [showQr, setShowQr] = useState(false);
  const timers = useRef({});
  const pickerAnchorRef = useRef(null);
  const headerAddRef = useRef(null);
  const emptyAddRef = useRef(null);
  const pageRef = useRef(null);
  const controlsContentRef = useRef(null);
  const logsBodyRef = useRef(null);
  const followLogs = useRef(true);
  const resizeLogs = useRef(null);
  const selectedServerId = useRef(server?.id);
  selectedServerId.current = server?.id;
  const getOperation = useServerOperations();
  const previousOnline = useRef({ id: null, online: null });
  const { logs, clearLogs } = useServerLogs(server?.id);

  const openPickerFrom = (ref) => {
    pickerAnchorRef.current = ref.current;
    setShowPicker((shown) => {
      const next = !shown;
      if (next && ref.current) {
        const rect = ref.current.getBoundingClientRect();
        setPickerPoint({ x: rect.left, y: rect.bottom + 8 });
      }
      return next;
    });
  };

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
    if (!browserTarget?.serverId && !browserTarget?.url) return;
    const selected = servers.find((item) => item.id === browserTarget.serverId);
    const nextUrl = browserTarget.url || selected?.url || '';
    if (selected) tabUrls.current[selected.id] = nextUrl;
    prevSelectionRef.current = { id: browserTarget.serverId || activeServerId, url: nextUrl };
    clearTimeout(timers.current.start);
    setStarting(false);
    setUrl(nextUrl);
    setAddress(nextUrl);
    setError('');
    setOnline(null);
    setFrameKey((key) => key + 1);
    onTargetConsumed?.();
  }, [browserTarget, servers, activeServerId, onTargetConsumed]);

  useEffect(() => {
    if (activeServerId === prevSelectionRef.current.id) return;
    if (prevSelectionRef.current.id) {
      tabUrls.current[prevSelectionRef.current.id] = prevSelectionRef.current.url;
    }
    const selected = servers.find((item) => item.id === activeServerId);
    const nextUrl = selected
      ? tabUrls.current[activeServerId] ||
        (savedPreview.serverId === activeServerId ? savedPreview.url : '') ||
        selected.url
      : '';
    prevSelectionRef.current = { id: activeServerId, url: nextUrl };
    clearTimeout(timers.current.start);
    setStarting(false);
    setUrl(nextUrl);
    setAddress(nextUrl);
    setError('');
    setOnline(null);
    setFrameKey((key) => key + 1);
  }, [activeServerId, servers, savedPreview.serverId, savedPreview.url]);

  useEffect(() => {
    savePreviewPrefs({
      serverId: server?.id || savedPreview.serverId,
      url: server ? url : savedPreview.url,
      mode,
      width: Number(width),
      height: Number(height),
      fit,
      logsHeight,
    });
  }, [server, savedPreview.serverId, savedPreview.url, url, mode, width, height, fit, logsHeight]);

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setPageHeight(entry.contentRect.height));
    if (pageRef.current) observer.observe(pageRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setControlsHeight(entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height),
    );
    if (controlsContentRef.current) observer.observe(controlsContentRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    followLogs.current = true;
  }, [server?.id]);

  useEffect(() => {
    const body = logsBodyRef.current;
    if (showLogs && body && followLogs.current) body.scrollTop = body.scrollHeight;
  }, [logs, server?.id, showLogs]);

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
    if (
      online === true &&
      previousOnline.current.id === server?.id &&
      previousOnline.current.online === false
    ) {
      setFrameKey((key) => key + 1);
    }
    previousOnline.current = { id: server?.id, online };
  }, [online, server?.id]);

  const navigate = (event) => {
    event.preventDefault();
    try {
      const text = address.trim();
      const target = text.startsWith('/')
        ? new URL(text, url || server?.url)
        : new URL(
            /^[a-z][a-z\d+.-]*:\/\//i.test(text) ||
              /^(?:https?|javascript|file|data|about):/i.test(text)
              ? text
              : 'http://' + text,
          );
      if (!['http:', 'https:'].includes(target.protocol)) {
        throw new Error('Utilisez une adresse http ou https.');
      }
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

  const start = async (target = server) => {
    if (!target || getOperation(target.id) || starting) return;
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
      await startServer({ root: target.projectRoot }, target);
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

  const stop = async (target = server) => {
    if (!target || getOperation(target.id) || stoppingId) return;
    setStoppingId(target.id);
    try {
      await stopServer(target);
      if (selectedServerId.current === target.id) setOnline(false);
    } catch (reason) {
      triggerToast({
        title: 'Arrêt impossible',
        message: String(reason),
        type: 'error',
      });
    } finally {
      setStoppingId(null);
    }
  };

  let localTarget = false;
  try {
    localTarget = !!server && new URL(url).origin === new URL(server.url).origin;
  } catch {}
  const canPreview = !!url && (!localTarget || online === true);

  const offline = (
    <EmptyState
      className="preview-offline"
      mark="browser"
      title={
        server
          ? online === null
            ? 'Vérification du serveur…'
            : `${server.projectName} est hors ligne`
          : servers.length
            ? 'Aucun aperçu ouvert'
            : 'Aucun serveur web configuré'
      }
      description={
        server
          ? 'Lancez le serveur pour afficher votre site.'
          : servers.length
            ? 'Les serveurs lancés apparaissent automatiquement sous Aperçu web dans le menu latéral, ou choisissez un projet ici.'
            : 'Ajoutez un serveur avec un port dans vos projets.'
      }
      command={server?.command}
    >
      {server ? (
        <button
          type="button"
          className="btn"
          disabled={starting || !!getOperation(server?.id) || online === null}
          onClick={() => start()}
        >
          {starting ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          {starting ? 'Démarrage…' : 'Lancer le serveur'}
        </button>
      ) : servers.length ? (
        <>
          <button
            ref={emptyAddRef}
            type="button"
            className="btn"
            onClick={() => openPickerFrom(emptyAddRef)}
          >
            <Plus size={14} /> Choisir un projet
          </button>
          <div className="logs-quick-picks" aria-label="Accès rapide aux aperçus">
            {servers.slice(0, 4).map((srv) => {
              const tone = serverStatusTone(srv);
              return (
                <button
                  key={srv.id}
                  type="button"
                  className="logs-quick-pick"
                  onClick={() => onOpenPreviewTab?.(srv.id)}
                >
                  <ProjectAvatar project={srv.project} image={projectIcons[srv.projectId]} small />
                  <span className="logs-quick-pick-copy">
                    <strong>{srv.name}</strong>
                    <small>
                      {srv.projectName} · :{srv.port}
                    </small>
                  </span>
                  <span
                    className={`server-dot is-${tone}${tone === 'running' ? ' running' : ''}`}
                  />
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <button type="button" className="btn" onClick={() => onSelectTab?.('projects')}>
          <span>Aller aux projets</span>
          <ArrowRight size={14} />
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

  const maxLogsHeight = Math.max(120, Math.min(700, Math.floor(pageHeight * 0.55)));
  const displayedLogsHeight = Math.min(logsHeight, maxLogsHeight);
  const clampLogsHeight = (value) => Math.round(Math.max(120, Math.min(maxLogsHeight, value)));

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

  const serverLive = isServerLive(server);
  const serverPending =
    !!server &&
    (server.state === 'starting' ||
      !!getOperation(server.id) ||
      starting ||
      stoppingId === server.id);
  const serverTone = serverStatusTone(server);

  return (
    <div className="page preview-page" ref={pageRef}>
      <header className="page-header preview-header">
        <div className="preview-header-lead">
          <div className="page-header-intro preview-title">
            <span className="page-header-icon" aria-hidden="true">
              <SprintNavIcon name="browser" active />
            </span>
            <h1 className="page-title">Aperçu web</h1>
          </div>

          {server && (
            <div className="logs-active-server preview-active-server" data-server-id={server.id}>
              <ProjectAvatar
                project={server.project}
                image={projectIcons[server.projectId]}
                small
              />
              <div className="logs-active-server-meta">
                <span
                  className="logs-active-server-name"
                  title={`${server.projectName} · ${server.name}`}
                >
                  <span className="logs-active-project">{server.projectName}</span>
                  <span className="logs-active-sep" aria-hidden="true">
                    /
                  </span>
                  <strong>{server.name}</strong>
                </span>
                <span className="logs-active-server-status">
                  <span
                    className={`server-dot is-${serverTone}${serverTone === 'running' ? ' running' : ''}`}
                  />
                  <span>{serverStatusLabel(server, serverPending)}</span>
                  <span>· :{server.port}</span>
                </span>
              </div>
              <button
                type="button"
                className={`quiet-button preview-server-action ${serverLive ? 'is-stop' : 'is-start'}`}
                disabled={serverPending || !!stoppingId || starting}
                aria-label={`${serverLive ? 'Arrêter' : 'Lancer'} ${server.projectName} · ${server.name}`}
                onClick={() => (serverLive ? stop(server) : start(server))}
              >
                {serverPending ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : serverLive ? (
                  <Square size={12} />
                ) : (
                  <Play size={12} />
                )}
                <span>{serverPending ? 'Patientez…' : serverLive ? 'Arrêter' : 'Lancer'}</span>
              </button>
            </div>
          )}
        </div>

        <div className="preview-header-actions">
          {(sidebarCollapsed || !openPreviewServers.length) && servers.length > 0 && (
            <button
              ref={headerAddRef}
              type="button"
              className="quiet-button preview-header-add"
              aria-label="Choisir un projet"
              aria-expanded={showPicker}
              title="Choisir un projet à lancer"
              onClick={() => openPickerFrom(headerAddRef)}
            >
              <Plus size={14} />
              <span>Ouvrir</span>
            </button>
          )}
          <button
            type="button"
            className="icon-button preview-controls-toggle"
            aria-expanded={showControls}
            aria-controls="preview-controls-panel"
            title={showControls ? 'Replier les commandes' : 'Afficher les commandes'}
            aria-label={showControls ? 'Replier les commandes' : 'Afficher les commandes'}
            onClick={() => setShowControls((shown) => !shown)}
          >
            <SprintNavIcon name="previewControls" active />
            {showControls ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Tester sur téléphone"
            title="Tester sur téléphone"
            disabled={!server || !online || !localTarget}
            onClick={() => setShowQr(true)}
          >
            <SprintNavIcon name="previewQr" active />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={showLogs ? 'Masquer les logs' : 'Afficher les logs'}
            title={showLogs ? 'Masquer les logs' : 'Afficher les logs'}
            aria-pressed={showLogs}
            aria-expanded={showLogs}
            aria-controls="preview-logs-drawer"
            onClick={() => setShowLogs(!showLogs)}
          >
            <SprintNavIcon name="previewLogs" active />
          </button>
        </div>
      </header>

      <div
        id="preview-controls-panel"
        className={'preview-controls-panel' + (showControls ? '' : ' is-collapsed')}
        aria-hidden={!showControls}
        inert={!showControls ? true : undefined}
        style={{ height: showControls ? controlsHeight : 0 }}
      >
        <div className="preview-controls-content" ref={controlsContentRef}>
          <div className="preview-controls-inner">
            <div className="preview-toolbar">
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
                  onChange={(event) => {
                    setAddress(event.target.value);
                    setError('');
                  }}
                />
                <button
                  type="submit"
                  className="icon-button"
                  aria-label="Aller"
                  title="Aller à cette adresse"
                  disabled={!address.trim()}
                >
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
            </div>
            <div className="preview-controls">
              <div className="preview-device-controls">
                <div className="segmented-control" aria-label="Format de l’aperçu">
                  {DEVICES.map(([id, label, Icon]) => (
                    <button
                      type="button"
                      key={id}
                      aria-label={label}
                      title={label}
                      aria-pressed={mode === id}
                      onClick={() => setMode(id)}
                    >
                      {Icon && <Icon size={16} strokeWidth={1.8} />}
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
                {mode === 'custom' && (
                  <div className="preview-custom-size">
                    <input
                      aria-label="Largeur de l’aperçu"
                      type="number"
                      min="240"
                      max="3840"
                      value={width}
                      className="control-input"
                      onChange={(event) => setWidth(event.target.value)}
                      onBlur={() =>
                        setWidth(Math.min(3840, Math.max(240, Number(width) || 1280)))
                      }
                    />
                    <span aria-hidden="true">×</span>
                    <input
                      aria-label="Hauteur de l’aperçu"
                      type="number"
                      min="240"
                      max="2160"
                      value={height}
                      className="control-input"
                      onChange={(event) => setHeight(event.target.value)}
                      onBlur={() =>
                        setHeight(Math.min(2160, Math.max(240, Number(height) || 800)))
                      }
                    />
                  </div>
                )}
                <select
                  className="control-input"
                  aria-label="Zoom de l’aperçu"
                  value={fit ? 'fit' : 'actual'}
                  onChange={(event) => setFit(event.target.value === 'fit')}
                >
                  <option value="fit">Ajuster</option>
                  <option value="actual">100 %</option>
                </select>
              </div>
            </div>
          </div>
          {error && (
            <p id="preview-address-error" className="text-xs text-rose-400 mt-1" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>

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

      <div
        id="preview-logs-drawer"
        className={'preview-logs-drawer' + (showLogs ? '' : ' is-collapsed')}
        aria-hidden={!showLogs}
        inert={!showLogs ? true : undefined}
        style={{
          height: showLogs ? displayedLogsHeight + 14 : 0,
          transition: resizingLogs ? 'none' : undefined,
        }}
      >
        <div className="preview-logs-drawer-content">
          <div
            className="preview-logs-resize"
            role="separator"
            tabIndex={0}
            aria-orientation="horizontal"
            aria-label="Hauteur des logs"
            aria-controls="preview-logs"
            aria-valuemin={120}
            aria-valuemax={maxLogsHeight}
            aria-valuenow={displayedLogsHeight}
            aria-valuetext={`${displayedLogsHeight} pixels`}
            title="Glisser pour ajuster la hauteur des logs"
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              resizeLogs.current = { y: event.clientY, height: displayedLogsHeight };
              setResizingLogs(true);
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (resizeLogs.current) {
                setLogsHeight(
                  clampLogsHeight(resizeLogs.current.height + resizeLogs.current.y - event.clientY),
                );
              }
            }}
            onPointerUp={() => {
              resizeLogs.current = null;
              setResizingLogs(false);
            }}
            onPointerCancel={() => {
              resizeLogs.current = null;
              setResizingLogs(false);
            }}
            onLostPointerCapture={() => {
              resizeLogs.current = null;
              setResizingLogs(false);
            }}
            onKeyDown={(event) => {
              const target =
                event.key === 'ArrowUp'
                  ? displayedLogsHeight + 20
                  : event.key === 'ArrowDown'
                    ? displayedLogsHeight - 20
                    : event.key === 'Home'
                      ? 120
                      : event.key === 'End'
                        ? maxLogsHeight
                        : null;
              if (target !== null) {
                event.preventDefault();
                setLogsHeight(clampLogsHeight(target));
              }
            }}
          >
            <span />
          </div>
          <section
            id="preview-logs"
            className="preview-logs"
            aria-label="Logs de l’aperçu"
            style={{ height: displayedLogsHeight }}
          >
            <div className="preview-logs-heading">
              <div className="preview-logs-title">
                <Terminal size={15} aria-hidden="true" />
                <strong>Logs</strong>
                <span title={server?.name}>{server?.name || 'Aucun serveur'}</span>
              </div>
              <div className="preview-logs-actions">
                <button
                  type="button"
                  className="quiet-button"
                  onClick={() => onSelectTab?.('terminal', server?.id)}
                >
                  Console complète
                </button>
                <button
                  type="button"
                  className="quiet-button"
                  disabled={!logs.length}
                  onClick={clearLogs}
                >
                  Effacer
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Fermer les logs de l’aperçu"
                  onClick={() => setShowLogs(false)}
                >
                  <X size={14} />
                </button>
              </div>
            </div>
            <div
              className="preview-logs-body"
              ref={logsBodyRef}
              tabIndex={0}
              aria-label="Sortie des logs"
              onScroll={(event) => {
                const body = event.currentTarget;
                followLogs.current = body.scrollHeight - body.scrollTop - body.clientHeight < 32;
              }}
            >
              {logs.length ? (
                logs.slice(-100).map((entry) => (
                  <div
                    key={entry.id}
                    className={
                      entry.isError
                        ? 'preview-log-error'
                        : entry.isSuccess
                          ? 'preview-log-success'
                          : entry.isInfo
                            ? 'preview-log-info'
                            : ''
                    }
                  >
                    <LogContent text={entry.raw} />
                  </div>
                ))
              ) : (
                <p className="text-zinc-400">Les logs de ce serveur apparaîtront ici.</p>
              )}
            </div>
          </section>
        </div>
      </div>

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
            <button
              type="button"
              className="icon-button"
              aria-label="Fermer"
              onClick={() => setShowQr(false)}
            >
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
          <button
            type="button"
            className="quiet-button mt-3 font-mono"
            onClick={() => copy(lanUrl)}
          >
            {lanUrl}
          </button>
        </div>
      </Modal>

      <ServerPickerMenu
        mode="preview"
        open={showPicker}
        anchorRef={pickerAnchorRef}
        point={pickerPoint}
        onClose={() => setShowPicker(false)}
        projects={projects}
        projectIcons={projectIcons}
        openIds={openPreviewIds}
        activeId={activeServerId}
        onSelectServer={(id) => onOpenPreviewTab?.(id)}
        onStartServer={start}
        onGoToProjects={() => onSelectTab?.('projects')}
      />
    </div>
  );
}
