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
  Plus,
  Square,
  ArrowRight,
  Loader2,
  X,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Search,
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
import { initialPreviewSelection, readDismissedTabs, readOpenTabs, saveDismissedTabs, saveOpenTabs, syncPreviewTabs } from './previewTabs';

const DEVICES = [
  ['desktop', 'Ordinateur', Monitor],
  ['tablet', 'Tablette', Tablet],
  ['mobile', 'Mobile', Smartphone],
  ['dual', 'Comparer', Columns],
  ['custom', 'Libre', Ruler],
];
export default function BrowserView({ projects = [], projectIcons = {}, initialServerId, initialUrl, onTargetConsumed, onSelectTab }) {
  const [savedPreview] = useState(loadPreviewPrefs);
  const servers = useMemo(
    () =>
      projects.flatMap((project) =>
        (project.servers || [])
          .filter((server) => server.port > 0)
          .map((server) => ({
            ...server,
            project,
            projectName: project.name,
            projectRoot: project.root,
            url: server.url || `http://localhost:${server.port}`,
          })),
      ),
    [projects],
  );
  const dismissedTabs = useRef(readDismissedTabs());
  const [previewSession] = useState(() => initialPreviewSelection(servers, {
    initialServerId,
    savedServerId: savedPreview.serverId,
    savedOpenIds: readOpenTabs(),
    dismissed: dismissedTabs.current,
  }));
  const [serverId, setServerId] = useState(previewSession.serverId);
  const server = servers.find((item) => item.id === serverId) || null;
  const [url, setUrl] = useState(initialUrl || (server && savedPreview.serverId === server.id ? savedPreview.url : '') || server?.url || '');
  const [address, setAddress] = useState(url);
  const [openServers, setOpenServers] = useState(previewSession.openIds);
  const tabUrls = useRef({});
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
  const [showServerMenu, setShowServerMenu] = useState(false);
  const [serverSearch, setServerSearch] = useState('');
  const [tabOverflow, setTabOverflow] = useState({ left: false, right: false });
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [localIp, setLocalIp] = useState('127.0.0.1');
  const [showQr, setShowQr] = useState(false);
  const timers = useRef({});
  const serverMenu = useRef(null);
  const tabsRef = useRef(null);
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
  const updateTabOverflow = () => {
    const list = tabsRef.current;
    if (!list) return;
    const left = list.scrollLeft > 1;
    const right = list.scrollLeft + list.clientWidth < list.scrollWidth - 1;
    setTabOverflow((previous) => previous.left === left && previous.right === right ? previous : { left, right });
  };
  const scrollTabs = (direction) => {
    const list = tabsRef.current;
    if (!list) return;
    list.scrollBy({ left: direction * Math.max(140, list.clientWidth * 0.65),
      behavior: document.documentElement.dataset.motion === 'reduce' ? 'auto' : 'smooth' });
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
    if (!showServerMenu) return undefined;
    const dismiss = (event) => {
      if (event.type === 'keydown' && event.key === 'Escape') setShowServerMenu(false);
      if (event.type === 'pointerdown' && !serverMenu.current?.contains(event.target)) setShowServerMenu(false);
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', dismiss);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', dismiss);
    };
  }, [showServerMenu]);
  useEffect(() => {
    if (!showServerMenu) return;
    const anchor = serverMenu.current;
    const menu = anchor?.querySelector('.preview-server-menu');
    if (!anchor || !menu) return;
    const spaceRight = window.innerWidth - anchor.getBoundingClientRect().left - 16;
    menu.classList.toggle('is-align-end', menu.offsetWidth > spaceRight);
  }, [showServerMenu, servers.length]);
  useEffect(() => {
    const list = tabsRef.current;
    const selected = list?.querySelector('[aria-current="page"]');
    if (!list || !selected) return;
    const tab = selected.parentElement;
    if (tab.offsetLeft < list.scrollLeft) list.scrollLeft = tab.offsetLeft;
    else if (tab.offsetLeft + tab.offsetWidth > list.scrollLeft + list.clientWidth)
      list.scrollLeft = tab.offsetLeft + tab.offsetWidth - list.clientWidth;
  }, [server?.id, openServers]);
  useEffect(() => {
    const list = tabsRef.current;
    if (!list) return undefined;
    const observer = new ResizeObserver(updateTabOverflow);
    observer.observe(list);
    Array.from(list.children).forEach((child) => observer.observe(child));
    updateTabOverflow();
    return () => observer.disconnect();
  }, [openServers]);
  useEffect(() => {
    if (initialServerId) {
      dismissedTabs.current.delete(initialServerId);
      saveDismissedTabs(dismissedTabs.current);
      setServerId(initialServerId);
      setOpenServers((ids) => ids.includes(initialServerId) ? ids : [...ids, initialServerId]);
    }
    if (initialUrl) {
      setUrl(initialUrl);
      setAddress(initialUrl);
    }
    if (initialServerId || initialUrl) onTargetConsumed?.();
  }, [initialServerId, initialUrl, onTargetConsumed]);
  useEffect(() => {
    const runningIds = new Set(servers.filter((item) => item.state === 'running').map((item) => item.id));
    let changed = false;
    for (const id of dismissedTabs.current) {
      if (!runningIds.has(id)) { dismissedTabs.current.delete(id); changed = true; }
    }
    if (changed) saveDismissedTabs(dismissedTabs.current);
    setOpenServers((ids) => {
      const next = syncPreviewTabs(ids, servers, dismissedTabs.current);
      return next.length === ids.length && next.every((id, index) => id === ids[index]) ? ids : next;
    });
  }, [servers]);
  useEffect(() => { saveOpenTabs(openServers); }, [openServers]);
  useEffect(() => {
    const selectedIsOpen = serverId && openServers.includes(serverId) && servers.some((item) => item.id === serverId);
    if (selectedIsOpen) return;
    const next = [...openServers].reverse().find((id) => servers.some((item) => item.id === id));
    if (!next) {
      if (!serverId) return;
      clearTimeout(timers.current.start);
      setStarting(false);
      setServerId(null);
      setUrl('');
      setAddress('');
      setError('');
      setOnline(null);
      return;
    }
    const selected = servers.find((item) => item.id === next);
    const nextUrl = tabUrls.current[next] || selected.url;
    clearTimeout(timers.current.start);
    setStarting(false);
    setServerId(next);
    setUrl(nextUrl);
    setAddress(nextUrl);
    setError('');
    setOnline(null);
    setFrameKey((key) => key + 1);
  }, [openServers, servers, serverId]);
  useEffect(() => {
    savePreviewPrefs({
      serverId: server?.id || savedPreview.serverId,
      url: server ? url : savedPreview.url,
      mode, width: Number(width), height: Number(height), fit, logsHeight,
    });
  }, [server, savedPreview.serverId, savedPreview.url, url, mode, width, height, fit, logsHeight]);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setPageHeight(entry.contentRect.height));
    if (pageRef.current) observer.observe(pageRef.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setControlsHeight(entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height));
    if (controlsContentRef.current) observer.observe(controlsContentRef.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { followLogs.current = true; }, [server?.id]);
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
    if (online === true && previousOnline.current.id === server?.id && previousOnline.current.online === false)
      setFrameKey((key) => key + 1);
    previousOnline.current = { id: server?.id, online };
  }, [online, server?.id]);
  const selectServer = (id) => {
    const selected = servers.find((item) => item.id === id);
    if (!selected) return;
    dismissedTabs.current.delete(id);
    saveDismissedTabs(dismissedTabs.current);
    if (id === server?.id) return;
    if (server?.id) tabUrls.current[server.id] = url;
    const nextUrl = tabUrls.current[id] || selected.url;
    clearTimeout(timers.current.start);
    setStarting(false);
    setOpenServers((ids) => ids.includes(id) ? ids : [...ids, id]);
    setServerId(id);
    setUrl(nextUrl);
    setAddress(nextUrl);
    setError('');
    setOnline(null);
    setFrameKey((key) => key + 1);
  };
  const closeServer = (id) => {
    const remaining = openServers.filter((item) => item !== id && servers.some((serverItem) => serverItem.id === item));
    if (servers.some((item) => item.id === id && item.state === 'running')) {
      dismissedTabs.current.add(id);
      saveDismissedTabs(dismissedTabs.current);
    }
    delete tabUrls.current[id];
    setOpenServers(remaining);
    if (id !== server?.id) return;
    const next = remaining[remaining.length - 1];
    if (next) selectServer(next);
    else {
      clearTimeout(timers.current.start);
      setStarting(false);
      setServerId(null);
      setUrl('');
      setAddress('');
      setError('');
      setOnline(null);
    }
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
    <EmptyState className="preview-offline" mark="browser"
      title={server ? online === null ? 'Vérification du serveur…' : server.projectName + ' est hors ligne' : servers.length ? 'Aucun aperçu ouvert' : 'Aucun serveur web configuré'}
      description={server ? 'Lancez le serveur pour afficher votre site.' : servers.length ? 'Choisissez un projet pour ouvrir son aperçu.' : 'Ajoutez un serveur avec un port dans vos projets.'}
      command={server?.command}>
      {server ? (
        <button
          className="btn"
          disabled={starting || !!getOperation(server?.id) || online === null}
          onClick={() => start()}
        >
          {starting ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          {starting ? 'Démarrage…' : 'Lancer le serveur'}
        </button>
      ) : servers.length ? (
        <button className="btn" onClick={() => { setServerSearch(''); setShowServerMenu(true); }}>
          <Plus size={14} /> Choisir un projet
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
  return (
    <div className="page preview-page" ref={pageRef}>
      <header className="page-header preview-header">
        <div className="page-header-intro preview-title">
          <span className="page-header-icon" aria-hidden="true"><SprintNavIcon name="browser" active /></span>
          <h1 className="page-title">Aperçu web</h1>
        </div>
      <div className="preview-tabs-bar">
        <div className="preview-tabs-navigation">
        {(tabOverflow.left || tabOverflow.right) && <button type="button" className="preview-tabs-arrow" aria-label="Onglets précédents" title="Onglets précédents"
          disabled={!tabOverflow.left} onClick={() => scrollTabs(-1)}><ChevronLeft size={15} /></button>}
        <div className={`preview-tabs${tabOverflow.left ? ' fade-left' : ''}${tabOverflow.right ? ' fade-right' : ''}`}
          ref={tabsRef} aria-label="Aperçus ouverts" onScroll={updateTabOverflow}>
          {openServers.map((id) => {
            const item = servers.find((candidate) => candidate.id === id);
            if (!item) return null;
            const running = item.state === 'running';
            const pending = item.state === 'starting' || !!getOperation(id) || (item.id === server?.id && starting) || stoppingId === id;
            const status = running ? 'En cours dans Sprint' : item.state === 'starting' ? 'Démarrage' : item.state === 'error' ? 'En erreur' : 'Arrêté dans Sprint';
            return <div className={'preview-tab' + (item.id === server?.id ? ' is-active' : '')} key={id}>
              <button type="button" className="preview-tab-select" aria-current={item.id === server?.id ? 'page' : undefined}
                title={`${item.projectName} · ${item.name} :${item.port} · ${status}`} onClick={() => selectServer(id)}>
                <span className="preview-tab-avatar"><ProjectAvatar project={item.project} image={projectIcons[item.project.id]} small />
                  <span className={'server-avatar-status ' + (running ? 'is-running' : item.state === 'starting' ? 'is-starting' : item.state === 'error' ? 'is-error' : '')} /></span>
                <span>{item.name}</span>
              </button>
              <button type="button" className={running ? 'preview-tab-stop' : 'preview-tab-start'}
                title={running ? 'Arrêter le serveur' : 'Lancer le serveur'}
                aria-label={`${running ? 'Arrêter' : 'Lancer'} ${item.projectName} · ${item.name}`}
                disabled={pending || !!stoppingId || starting} onClick={() => { if (running) stop(item); else { selectServer(id); start(item); } }}>
                {pending ? <Loader2 size={13} className="animate-spin" /> : running ? <Square size={12} /> : <Play size={12} />}
              </button>
              <button type="button" className="preview-tab-close" title="Fermer cet onglet"
                aria-label={`Fermer l’aperçu ${item.projectName} · ${item.name}`} onClick={() => closeServer(id)}><X size={13} /></button>
            </div>;
          })}
        </div>
        {(tabOverflow.left || tabOverflow.right) && <button type="button" className="preview-tabs-arrow" aria-label="Onglets suivants" title="Onglets suivants"
          disabled={!tabOverflow.right} onClick={() => scrollTabs(1)}><ChevronRight size={15} /></button>}
        </div>
        <div className="preview-add" ref={serverMenu}>
          <button type="button" className="icon-button preview-add-button" aria-label="Choisir un projet"
            aria-expanded={showServerMenu} aria-controls="preview-server-menu" title="Choisir un projet à lancer"
            onClick={() => { if (!showServerMenu) setServerSearch(''); setShowServerMenu((shown) => !shown); }}><SprintNavIcon name="previewAdd" active /></button>
          {showServerMenu && <div id="preview-server-menu" className="preview-server-menu">
            <div className="preview-menu-heading"><strong>Choisir un projet</strong><span>Ouvrez son aperçu ou lancez-le</span></div>
            <label className="preview-menu-search"><Search size={15} aria-hidden="true" />
              <input autoFocus aria-label="Rechercher un projet ou un serveur" placeholder="Projet, serveur ou port…"
                value={serverSearch} onChange={(event) => setServerSearch(event.target.value)} />
            </label>
            <div className="preview-menu-list">
            {servers.length ? projects.map((project) => {
              const query = serverSearch.trim().toLocaleLowerCase();
              const projectServers = servers.filter((item) => item.project.id === project.id
                && (!query || `${project.name} ${item.name} ${item.port}`.toLocaleLowerCase().includes(query)));
              if (!projectServers.length) return null;
              return <section className="preview-server-group" key={project.id} aria-label={project.name}>
                <div className="preview-server-group-heading">
                  <ProjectAvatar project={project} image={projectIcons[project.id]} small />
                  <strong title={project.name}>{project.name}</strong>
                </div>
                {projectServers.map((item) => <div className={'preview-server-option' + (item.id === server?.id ? ' is-current' : '')} key={item.id}>
              <button type="button" className="preview-server-option-select" onClick={() => { selectServer(item.id); setShowServerMenu(false); }}>
                <span className={'server-dot ' + (item.state === 'running' ? 'running' : '')} />
                <span><strong>{item.name}</strong><small>:{item.port} · {item.state === 'running' ? 'En cours' : item.state === 'starting' ? 'Démarrage' : item.state === 'error' ? 'Erreur' : 'Arrêté'}{item.id === server?.id ? ' · Aperçu actuel' : openServers.includes(item.id) ? ' · Ouvert' : ''}</small></span>
              </button>
              {item.state !== 'running' && item.state !== 'starting' && <button type="button" className="quiet-button"
                disabled={starting || !!getOperation(item.id)} onClick={() => { selectServer(item.id); setShowServerMenu(false); start(item); }}>
                <Play size={13} /> Lancer
              </button>}
            </div>)}
              </section>;
            }) : <div className="preview-server-empty">Aucun serveur avec un port. <button type="button" onClick={() => onSelectTab?.('projects')}>Ajouter un projet</button></div>}
            {servers.length > 0 && serverSearch.trim() && !servers.some((item) => `${item.projectName} ${item.name} ${item.port}`.toLocaleLowerCase().includes(serverSearch.trim().toLocaleLowerCase())) && <div className="preview-server-empty" role="status">Aucun serveur trouvé.</div>}
            </div>
          </div>}
        </div>
        <button type="button" className="icon-button preview-controls-toggle" aria-expanded={showControls}
          aria-controls="preview-controls-panel" title={showControls ? 'Replier les commandes' : 'Afficher les commandes'}
          aria-label={showControls ? 'Replier les commandes' : 'Afficher les commandes'} onClick={() => setShowControls((shown) => !shown)}>
          <SprintNavIcon name="previewControls" active />{showControls ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>
        <div className="preview-header-actions">
          <button className="icon-button" aria-label="Tester sur téléphone" title="Tester sur téléphone"
            disabled={!server || !online || !localTarget} onClick={() => setShowQr(true)}><SprintNavIcon name="previewQr" active /></button>
          <button className="icon-button" aria-label={showLogs ? 'Masquer les logs' : 'Afficher les logs'} title={showLogs ? 'Masquer les logs' : 'Afficher les logs'}
            aria-pressed={showLogs} aria-expanded={showLogs} aria-controls="preview-logs-drawer" onClick={() => setShowLogs(!showLogs)}>
            <SprintNavIcon name="previewLogs" active />
          </button>
        </div>
      </header>
      <div id="preview-controls-panel" className={'preview-controls-panel' + (showControls ? '' : ' is-collapsed')}
        aria-hidden={!showControls} inert={!showControls ? true : undefined} style={{ height: showControls ? controlsHeight : 0 }}>
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

      </div>
      <div className="preview-controls">
            <div className="preview-device-controls">
              <div className="segmented-control" aria-label="Format de l’aperçu">
                {DEVICES.map(([id, label, Icon]) => (
                  <button key={id} aria-label={label} title={label} aria-pressed={mode === id} onClick={() => setMode(id)}>
                    {Icon && <Icon size={16} strokeWidth={1.8} />}
                    <span>{label}</span>
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
      <div id="preview-logs-drawer" className={'preview-logs-drawer' + (showLogs ? '' : ' is-collapsed')}
        aria-hidden={!showLogs} inert={!showLogs ? true : undefined}
        style={{ height: showLogs ? displayedLogsHeight + 14 : 0, transition: resizingLogs ? 'none' : undefined }}>
      <div className="preview-logs-drawer-content">
        <div className="preview-logs-resize" role="separator" tabIndex={0} aria-orientation="horizontal"
          aria-label="Hauteur des logs" aria-controls="preview-logs" aria-valuemin={120}
          aria-valuemax={maxLogsHeight} aria-valuenow={displayedLogsHeight} aria-valuetext={`${displayedLogsHeight} pixels`}
          title="Glisser pour ajuster la hauteur des logs"
          onPointerDown={(event) => { if (event.button !== 0) return; resizeLogs.current = { y: event.clientY, height: displayedLogsHeight }; setResizingLogs(true); event.currentTarget.setPointerCapture(event.pointerId); }}
          onPointerMove={(event) => { if (resizeLogs.current) setLogsHeight(clampLogsHeight(resizeLogs.current.height + resizeLogs.current.y - event.clientY)); }}
          onPointerUp={() => { resizeLogs.current = null; setResizingLogs(false); }} onPointerCancel={() => { resizeLogs.current = null; setResizingLogs(false); }}
          onLostPointerCapture={() => { resizeLogs.current = null; setResizingLogs(false); }}
          onKeyDown={(event) => {
            const target = event.key === 'ArrowUp' ? displayedLogsHeight + 20 : event.key === 'ArrowDown' ? displayedLogsHeight - 20 : event.key === 'Home' ? 120 : event.key === 'End' ? maxLogsHeight : null;
            if (target !== null) { event.preventDefault(); setLogsHeight(clampLogsHeight(target)); }
          }}><span /></div>
        <section id="preview-logs" className="preview-logs" aria-label="Logs de l’aperçu" style={{ height: displayedLogsHeight }}>
          <div className="preview-logs-heading">
            <div className="preview-logs-title"><Terminal size={15} aria-hidden="true" /><strong>Logs</strong><span title={server?.name}>{server?.name || 'Aucun serveur'}</span></div>
            <div className="preview-logs-actions"><button className="quiet-button" onClick={() => onSelectTab?.('terminal', server?.id)}>Console complète</button>
              <button className="quiet-button" disabled={!logs.length} onClick={clearLogs}>Effacer</button>
              <button className="icon-button" aria-label="Fermer les logs de l’aperçu" onClick={() => setShowLogs(false)}><X size={14} /></button></div>
          </div>
          <div className="preview-logs-body" ref={logsBodyRef} tabIndex={0} aria-label="Sortie des logs"
            onScroll={(event) => { const body = event.currentTarget; followLogs.current = body.scrollHeight - body.scrollTop - body.clientHeight < 32; }}>
          {logs.length ? (
            logs.slice(-100).map((entry) => (
              <div key={entry.id} className={entry.isError ? 'preview-log-error' : entry.isSuccess ? 'preview-log-success' : entry.isInfo ? 'preview-log-info' : ''}>
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
