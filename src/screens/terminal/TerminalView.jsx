import { readStoredSetting } from '../../lib/settingsStorage';
import React, { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react';
import { useServerLogs } from '../../hooks/useServerLogs';
import {
  Trash2,
  Copy,
  Check,
  Download,
  Search,
  ArrowDown,
  Columns,
  Play,
  ArrowRight,
  Loader2,
  X,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Square,
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import SprintNavIcon, { PageLogo } from '../../components/layout/SprintNavIcon';
import EmptyState from '../../components/ui/EmptyState';
import useServerOperations from '../../hooks/useServerOperations';
import { performServerAction } from '../../lib/serverActions';
import { triggerToast } from '../../lib/toastBus';
import LogContent from '../../components/ui/LogContent';
import ProjectAvatar from '../../components/ui/ProjectAvatar';
import { syncPreviewTabs } from '../preview/previewTabs';

// Nombre max de lignes rendues dans le DOM (fenêtre glissante)
const MAX_RENDERED_LINES = 500;

const LogLine = React.memo(function LogLine({ entry, lineNumber, showRaw, active }) {
  const { isError, isSuccess, isInfo } = entry;
  return (
    <div
      data-log-id={entry.id}
      className={`log-line ${active ? 'log-line-selected' : ''} flex items-start px-2 py-0.5 rounded leading-relaxed ${
        isError
          ? 'bg-red-500/10 text-red-300'
          : isSuccess
            ? 'bg-emerald-500/10 text-emerald-300'
            : isInfo
              ? 'theme-accent-text'
              : 'text-zinc-300 hover:bg-white/[0.02]'
      }`}
    >
      <span className="text-zinc-500 select-none mr-2.5 text-[12px] min-w-[2.2rem] text-right">
        {lineNumber}
      </span>
      <span className="log-line-level">{isError ? 'Erreur' : isSuccess ? 'Succès' : isInfo ? 'Info' : ''}</span>
      <span className="flex-1"><LogContent text={entry.raw} interpretAnsi={!showRaw} /></span>
    </div>
  );
});

// Single Terminal Panel Component
function TerminalPanel({ server, titlePrefix = 'Console', onStart, pending, selector, showTools }) {
  const { logs, clearLogs } = useServerLogs(server?.id);
  const [filter, setFilter] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [expandedHistory, setExpandedHistory] = useState(false);
  const [level, setLevel] = useState('all');
  const [copied, setCopied] = useState(false);
  const [frozenLogs, setFrozenLogs] = useState(null);
  const [activeErrorId, setActiveErrorId] = useState(null);
  const pausedAt = useRef(0);
  const copyTimer = useRef(null);
  const scrollRef = useRef(null);
  const toolsRef = useRef(null);
  const [toolsHeight, setToolsHeight] = useState(0);
  useLayoutEffect(() => {
    if (showTools && toolsRef.current) {
      const height = toolsRef.current.scrollHeight;
      if (height > 0) setToolsHeight(height);
    }
  }, [showTools]);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const height = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
      if (height > 0) setToolsHeight(height);
    });
    if (toolsRef.current) observer.observe(toolsRef.current);
    return () => observer.disconnect();
  }, []);

  // Réglage utilisateur : nettoyage ANSI des logs
  const showRawAnsi = readStoredSetting('clean_ansi_logs') === 'false';

  const displayLogs = frozenLogs || logs;
  const newLines = frozenLogs ? logs.filter((entry) => entry.id > pausedAt.current).length : 0;
  const errorLogs = useMemo(() => displayLogs.filter((entry) => entry.isError), [displayLogs]);
  const pause = () => {
    if (!frozenLogs) {
      setFrozenLogs(logs);
      pausedAt.current = logs.at(-1)?.id || 0;
    }
    setAutoScroll(false);
  };
  const resume = () => {
    setFrozenLogs(null);
    setExpandedHistory(false);
    setActiveErrorId(null);
    setAutoScroll(true);
  };
  const filteredLogs = useMemo(() => {
    const q = filter.toLowerCase();
    return displayLogs.filter(
      (entry) =>
        entry.clean.toLowerCase().includes(q) &&
        (level === 'all' ||
          (level === 'errors' && entry.isError) ||
          (level === 'success' && entry.isSuccess) ||
          (level === 'info' && entry.isInfo)),
    );
  }, [displayLogs, filter, level]);
  useEffect(() => {
    setExpandedHistory(false);
    setFilter('');
    setLevel('all');
    setAutoScroll(true);
    setFrozenLogs(null);
    setActiveErrorId(null);
  }, [server?.id]);
  useEffect(() => () => clearTimeout(copyTimer.current), []);

  const hiddenByWindow = expandedHistory
    ? 0
    : Math.max(0, filteredLogs.length - MAX_RENDERED_LINES);
  const visibleLogs = expandedHistory ? filteredLogs : filteredLogs.slice(-MAX_RENDERED_LINES);
  const nextError = () => {
    const errors = filteredLogs.filter((entry) => entry.isError);
    if (!errors.length) return;
    const index = errors.findIndex((entry) => entry.id === activeErrorId);
    pause();
    setExpandedHistory(true);
    setActiveErrorId(errors[(index + 1) % errors.length].id);
  };
  useEffect(() => {
    if (activeErrorId) scrollRef.current?.querySelector(`[data-log-id="${activeErrorId}"]`)?.scrollIntoView({ block: 'center' });
  }, [activeErrorId, expandedHistory]);

  useEffect(() => {
    const screen = scrollRef.current;
    if (!screen || !autoScroll) return undefined;
    const follow = () => {
      screen.scrollTop = screen.scrollHeight;
    };
    follow();
    const observer = new ResizeObserver(follow);
    observer.observe(screen);
    return () => observer.disconnect();
  }, [autoScroll, server?.id]);

  useEffect(() => {
    const screen = scrollRef.current;
    if (screen && autoScroll) screen.scrollTop = screen.scrollHeight;
  }, [displayLogs, filter, level, expandedHistory, autoScroll]);

  const handleCopyLogs = async () => {
    try {
      await navigator.clipboard.writeText(filteredLogs.map((entry) => entry.clean).join('\n'));
      setCopied(true);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      triggerToast({
        title: 'Copie impossible',
        message: String(error),
        type: 'error',
      });
    }
  };
  const exportLogs = () => {
    const url = URL.createObjectURL(
      new Blob([filteredLogs.map((entry) => entry.clean).join('\n')], {
        type: 'text/plain;charset=utf-8',
      }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(server?.name || 'sprint').replace(/[^a-z0-9_-]/gi, '_')}-logs.txt`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="terminal-panel">
      <div id={`terminal-controls-${titlePrefix === 'Console 2' ? 2 : 1}`} className="workspace-controls-drawer" aria-hidden={!showTools} inert={!showTools ? true : undefined}
        style={{ height: showTools ? toolsHeight : 0 }}>
      <div className="terminal-controls-content" ref={toolsRef}>
      {selector}
      <div className="terminal-toolbar">
        <div className="terminal-actions">
          <div className="terminal-filters">
          <select
            className="control-input"
            aria-label={`Niveau des logs · ${titlePrefix}`}
            value={level}
            onChange={(event) => setLevel(event.target.value)}
          >
            <option value="all">Tous</option>
            <option value="errors">Erreurs ({errorLogs.length})</option>
            <option value="success">Succès</option>
            <option value="info">Infos</option>
          </select>
          <div className="relative">
            <Search className="w-3 h-3 text-zinc-400 absolute left-2 top-2" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Rechercher…"
              aria-label={`Rechercher dans les logs · ${titlePrefix}`}
              className="control-input log-filter !pl-7"
            />
          </div>
          {(filter || level !== 'all') && <button className="icon-button" title="Réinitialiser les filtres"
            aria-label={`Réinitialiser les filtres · ${titlePrefix}`} onClick={() => { setFilter(''); setLevel('all'); }}><X size={14} /></button>}
          </div>
          <div className="terminal-tools">
          <button className="quiet-button log-next-error" onClick={nextError}
            disabled={!filteredLogs.some((entry) => entry.isError)} title="Aller à l’erreur suivante dans les résultats"
            aria-label={`Erreur suivante · ${titlePrefix}`}><ArrowDown size={13} /> Erreur suivante</button>

          <button
            onClick={autoScroll ? pause : resume}
            aria-pressed={autoScroll}
            className={`icon-button ${
              autoScroll ? 'theme-accent-active' : 'bg-white/[0.04] text-zinc-400'
            }`}
            title={autoScroll ? 'Mettre le défilement en pause pour lire' : 'Revenir aux dernières lignes'}
            aria-label="Défilement automatique"
          >
            <ArrowDown className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleCopyLogs}
            className="icon-button"
            title="Copier les logs"
            aria-label="Copier les logs filtrés"
            disabled={!filteredLogs.length}
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          <button
            className="icon-button"
            title="Exporter les logs"
            aria-label="Exporter les logs filtrés"
            disabled={!filteredLogs.length}
            onClick={exportLogs}
          >
            <Download size={14} />
          </button>

          <button
            onClick={() => { clearLogs(); resume(); }}
            className="icon-button hover:text-rose-400"
            title="Effacer les logs de cette session"
            aria-label="Effacer les logs"
            disabled={!logs.length}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          </div>
        </div>
      </div>
      </div>
      </div>

      {/* Terminal Log Screen */}
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
          if (!atBottom && autoScroll) pause();
        }}
        className="terminal-log-screen flex-1 font-mono text-xs overflow-y-auto space-y-0.5 select-text"
      >
        {!server ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-zinc-500 italic select-none">
            <span className="text-xs not-italic text-zinc-400">
              Aucun autre serveur disponible pour la vue divisée.
            </span>
          </div>
        ) : filteredLogs.length === 0 ? (
          filter || level !== 'all' ? (
            <EmptyState icon={Search} title="Aucun résultat" description="Essayez un autre texte ou affichez tous les niveaux.">
              <button className="btn" onClick={() => { setFilter(''); setLevel('all'); }}>Réinitialiser les filtres</button>
            </EmptyState>
          ) : (
            <EmptyState mark="terminal"
              title={server.state === 'running' ? 'En attente des premières lignes' : 'Ce serveur est arrêté'}
              description={server.state === 'running' ? 'Les nouvelles sorties du serveur apparaîtront ici.' : 'Lancez-le pour voir ses logs dans cette console.'}
              command={server.command}>
              {server.state !== 'running' && <button className="btn" disabled={pending}
                onClick={() => onStart(server)} aria-label={'Lancer le serveur · ' + titlePrefix}>
                {pending ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                {pending ? 'Lancement…' : 'Lancer le serveur'}
              </button>}
            </EmptyState>
          )
        ) : (
          <>
            {hiddenByWindow > 0 && (
              <button
                onClick={() => {
                  pause();
                  setExpandedHistory(true);
                }}
                className="log-history-button"
              >
                ▲ {hiddenByWindow} lignes plus anciennes masquées — cliquer pour tout afficher
              </button>
            )}
            {visibleLogs.map((entry, i) => (
              <LogLine
                key={entry.id}
                entry={entry}
                lineNumber={hiddenByWindow + i + 1}
                showRaw={showRawAnsi}
                active={entry.id === activeErrorId}
              />
            ))}
          </>
        )}
      </div>
      <div className="terminal-footer">
        <span>
          {filteredLogs.length} lignes
          {filteredLogs.length !== displayLogs.length ? ` sur ${displayLogs.length}` : ''}
        </span>
        {autoScroll ? (
          <span className="console-status"><span className={'server-dot ' + (server?.state === 'running' ? 'running' : '')} />
            {server?.state === 'running' ? 'En direct' : server ? 'Serveur arrêté' : 'Aucun serveur'}</span>
        ) : (
          <button className="log-resume" onClick={resume}>
            <ArrowDown size={12} /> {server?.state === 'running' ? 'Revenir au direct' : 'Dernières lignes'}
            {newLines > 0 ? ` · ${newLines} ${newLines === 1 ? 'nouvelle ligne' : 'nouvelles lignes'}` : ' · Lecture en pause'}
          </button>
        )}
      </div>
    </div>
  );
}

function ConsoleSelector({ server, servers, number, otherId, onChange, onStart, pending }) {
  const groups = new Map();
  for (const item of servers) {
    if (!groups.has(item.projectId))
      groups.set(item.projectId, { name: item.projectName, servers: [] });
    groups.get(item.projectId).servers.push(item);
  }
  const running = server?.state === 'running';
  return (
    <div className="console-selector">
      <div className="console-selector-heading">
        <label htmlFor={'console-server-' + number}>Console {number}</label>
        <span className="console-status">
          <span className={'server-dot ' + (running ? 'running' : '')} />
          {pending ? 'Lancement…' : server ? (running ? 'En marche' : 'Arrêté') : 'Aucun serveur'}
        </span>
      </div>
      <div className="console-selector-controls">
        <select
          id={'console-server-' + number}
          className="control-input"
          aria-label={'Console ' + number}
          value={server?.id || ''}
          onChange={(event) => onChange(event.target.value)}
        >
          {!server && <option value="">Choisir un serveur</option>}
          {[...groups].map(([id, group]) => (
            <optgroup key={id} label={group.name}>
              {group.servers.map((item) => (
                <option key={item.id} value={item.id} disabled={item.id === otherId}>
                  {item.projectName} · {item.name}
                  {item.port ? ' · :' + item.port : ''}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {server && !running && (
          <button
            className="btn"
            disabled={pending}
            onClick={() => onStart(server)}
            aria-label={'Lancer ' + server.name}
          >
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            <span>{pending ? 'Lancement…' : 'Lancer'}</span>
          </button>
        )}
      </div>
    </div>
  );
}

export default function TerminalView({ projects = [], projectIcons = {}, initialServerId, onSelectTab }) {
  const [showAllServers, setShowAllServers] = useState(
    () => readStoredSetting('hide_stopped_servers') === 'false',
  );
  const allServers = useMemo(
    () =>
      projects.flatMap((project) =>
        (project.servers || []).map((server) => ({
          ...server,
          project,
          projectId: project.id,
          projectName: project.name,
          projectRoot: project.root,
        })),
      ),
    [projects],
  );
  const runningServers = allServers.filter((server) => server.state === 'running');
  const [activeServerId, setActiveServerId] = useState(initialServerId || null);
  const [splitServerId, setSplitServerId] = useState(null);
  const [isSplitMode, setIsSplitMode] = useState(false);
  const [showTools, setShowTools] = useState(true);
  const [openTabs, setOpenTabs] = useState(() => syncPreviewTabs(initialServerId ? [initialServerId] : [], allServers, new Set()));
  const dismissedTabs = useRef(new Set());
  const [showTabMenu, setShowTabMenu] = useState(false);
  const tabMenuRef = useRef(null);
  const tabListRef = useRef(null);
  const [tabOverflow, setTabOverflow] = useState({ left: false, right: false });
  const getOperation = useServerOperations();

  useEffect(() => {
    if (initialServerId) {
      dismissedTabs.current.delete(initialServerId);
      setActiveServerId(initialServerId);
      setOpenTabs((ids) => ids.includes(initialServerId) ? ids : [...ids, initialServerId]);
    }
  }, [initialServerId]);
  useEffect(() => {
    const runningIds = new Set(allServers.filter((item) => item.state === 'running').map((item) => item.id));
    for (const id of dismissedTabs.current) if (!runningIds.has(id)) dismissedTabs.current.delete(id);
    setOpenTabs((ids) => {
      const next = syncPreviewTabs(ids, allServers, dismissedTabs.current);
      return next.length === ids.length && next.every((id, index) => id === ids[index]) ? ids : next;
    });
  }, [allServers]);
  useEffect(() => {
    if (!showTabMenu) return undefined;
    const dismiss = (event) => {
      if (event.type === 'keydown' ? event.key === 'Escape' : !tabMenuRef.current?.contains(event.target)) setShowTabMenu(false);
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', dismiss);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', dismiss); };
  }, [showTabMenu]);
  const updateTabOverflow = () => {
    const list = tabListRef.current;
    if (!list) return;
    const left = list.scrollLeft > 1;
    const right = list.scrollLeft + list.clientWidth < list.scrollWidth - 1;
    setTabOverflow((prev) => prev.left === left && prev.right === right ? prev : { left, right });
  };
  useEffect(() => {
    const list = tabListRef.current;
    if (!list) return undefined;
    const observer = new ResizeObserver(updateTabOverflow);
    observer.observe(list);
    Array.from(list.children).forEach((child) => observer.observe(child));
    updateTabOverflow();
    return () => observer.disconnect();
  }, [openTabs, allServers.length]);

  // Keep an opened console selected after its server stops, so its last logs remain readable.
  const primaryServer =
    allServers.find((server) => server.id === activeServerId) || runningServers[0] || allServers[0];
  const secondaryServer =
    allServers.find((server) => server.id === splitServerId && server.id !== primaryServer?.id) ||
    runningServers.find((server) => server.id !== primaryServer?.id) ||
    allServers.find((server) => server.id !== primaryServer?.id);
  const primaryId = primaryServer?.id;
  const secondaryId = secondaryServer?.id;
  useEffect(() => {
    if (primaryId && activeServerId !== primaryId) setActiveServerId(primaryId);
  }, [primaryId, activeServerId]);
  useEffect(() => {
    if (!primaryId) return;
    dismissedTabs.current.delete(primaryId);
    setOpenTabs((ids) => ids.includes(primaryId) ? ids : [...ids, primaryId]);
  }, [primaryId]);
  useEffect(() => {
    if (isSplitMode && secondaryId && splitServerId !== secondaryId) setSplitServerId(secondaryId);
  }, [isSplitMode, secondaryId, splitServerId]);
  useEffect(() => {
    if (!isSplitMode || !secondaryId || dismissedTabs.current.has(secondaryId)) return;
    setOpenTabs((ids) => ids.includes(secondaryId) ? ids : [...ids, secondaryId]);
  }, [isSplitMode, secondaryId]);

  const displayServers = allServers.filter(
    (server) =>
      showAllServers ||
      !runningServers.length ||
      server.state === 'running' ||
      server.id === primaryServer?.id ||
      (isSplitMode && server.id === secondaryServer?.id),
  );
  const handleStartServer = (server) =>
    performServerAction('start', { root: server.projectRoot }, server, { silent: true });
  const openTab = (id) => {
    dismissedTabs.current.delete(id);
    setOpenTabs((ids) => ids.includes(id) ? ids : [...ids, id]);
    if (isSplitMode && id === secondaryId) setSplitServerId(primaryId);
    setActiveServerId(id);
    setShowTabMenu(false);
  };
  const openSecondary = (id) => {
    dismissedTabs.current.delete(id);
    setOpenTabs((ids) => ids.includes(id) ? ids : [...ids, id]);
    setSplitServerId(id);
  };
  const closeTab = (id) => {
    if (openTabs.length <= 1) return;
    const remaining = openTabs.filter((item) => item !== id && allServers.some((server) => server.id === item));
    dismissedTabs.current.add(id);
    setOpenTabs(remaining);
    if (id === primaryId && remaining.length) setActiveServerId(remaining[remaining.length - 1]);
  };

  if (!allServers.length)
    return (
      <div className="page logs-page">
        <PageHeader title="Logs" icon={<SprintNavIcon name="terminal" active />} />
        <div className="empty-state flex-1 flex flex-col items-center justify-center gap-3">
          <PageLogo name="terminal" />
          <h2 className="text-sm font-medium">Vos consoles apparaîtront ici</h2>
          <p className="text-xs text-zinc-400">
            Ajoutez un projet et configurez sa commande de lancement.
          </p>
          <button className="btn" onClick={() => onSelectTab?.('projects')}>
            Aller aux projets <ArrowRight size={14} />
          </button>
        </div>
      </div>
    );

  return (
    <div className="page logs-page">
      <header className="page-header preview-header logs-header">
        <div className="page-header-intro preview-title">
          <span className="page-header-icon" aria-hidden="true"><SprintNavIcon name="terminal" active /></span>
          <h1 className="page-title">Logs</h1>
        </div>
        <div className="preview-tabs-bar">
        <div className="preview-tabs-navigation">
          {(tabOverflow.left || tabOverflow.right) && <button type="button" className="preview-tabs-arrow" aria-label="Onglets de logs précédents" disabled={!tabOverflow.left}
            onClick={() => tabListRef.current?.scrollBy({ left: -200, behavior: 'smooth' })}><ChevronLeft size={15} /></button>}
          <div ref={tabListRef} className={`preview-tabs${tabOverflow.left ? ' fade-left' : ''}${tabOverflow.right ? ' fade-right' : ''}`}
            aria-label="Onglets de logs" onScroll={updateTabOverflow}>
            {openTabs.map((id) => {
              const item = allServers.find((candidate) => candidate.id === id);
              if (!item) return null;
              const running = item.state === 'running';
              const pending = !!getOperation(id) || item.state === 'starting';
              const split = isSplitMode && id === secondaryId;
              return <div key={id} className={`preview-tab${id === primaryId ? ' is-active' : ''}${split ? ' is-split' : ''}`}>
                <button type="button" className="preview-tab-select" aria-current={id === primaryId ? 'page' : undefined}
                  title={`${item.projectName} · ${item.name}${split ? ' · Console 2' : ''}`} onClick={() => openTab(id)}>
                  <span className="preview-tab-avatar"><ProjectAvatar project={item.project} image={projectIcons[item.projectId]} small />
                    <span className={`server-avatar-status ${running ? 'is-running' : item.state === 'starting' ? 'is-starting' : item.state === 'error' ? 'is-error' : ''}`} /></span>
                  <span>{item.name}</span>
                </button>
                <button type="button" className={running ? 'preview-tab-stop' : 'preview-tab-start'} disabled={pending}
                  aria-label={`${running ? 'Arrêter' : 'Lancer'} ${item.projectName} · ${item.name}`}
                  title={running ? 'Arrêter le serveur' : 'Lancer le serveur'}
                  onClick={() => { if (!running) openTab(id); performServerAction(running ? 'stop' : 'start', { root: item.projectRoot }, item); }}>
                  {pending ? <Loader2 size={13} className="animate-spin" /> : running ? <Square size={12} /> : <Play size={12} />}
                </button>
                {openTabs.length > 1 && <button type="button" className="preview-tab-close" aria-label={`Fermer les logs ${item.projectName} · ${item.name}`} title="Fermer cet onglet" onClick={() => closeTab(id)}><X size={13} /></button>}
              </div>;
            })}
          </div>
          {(tabOverflow.left || tabOverflow.right) && <button type="button" className="preview-tabs-arrow" aria-label="Onglets de logs suivants" disabled={!tabOverflow.right}
            onClick={() => tabListRef.current?.scrollBy({ left: 200, behavior: 'smooth' })}><ChevronRight size={15} /></button>}
        </div>
        <div className="preview-add" ref={tabMenuRef}>
          <button type="button" className="icon-button preview-add-button" aria-label="Ouvrir des logs" title="Ouvrir des logs"
            aria-expanded={showTabMenu} onClick={() => setShowTabMenu((shown) => !shown)}><SprintNavIcon name="previewAdd" active /></button>
          {showTabMenu && <div className="preview-server-menu logs-tab-menu">
            <div className="preview-menu-heading"><strong>Ouvrir des logs</strong><span>Choisissez un serveur</span></div>
            <div className="preview-menu-list">
              {projects.map((project) => {
                const servers = allServers.filter((item) => item.projectId === project.id);
                if (!servers.length) return null;
                return <section className="preview-server-group" key={project.id}>
                  <div className="preview-server-group-heading"><ProjectAvatar project={project} image={projectIcons[project.id]} small /><strong>{project.name}</strong></div>
                  {servers.map((item) => <div key={item.id} className="preview-server-option">
                    <button type="button" className="preview-server-option-select" onClick={() => openTab(item.id)}>
                      <span className={`server-dot ${item.state === 'running' ? 'running' : ''}`} />
                      <span><strong>{item.name}</strong><small>{item.state === 'running' ? 'En cours' : 'Arrêté'}{openTabs.includes(item.id) ? ' · Ouvert' : ''}</small></span>
                    </button>
                  </div>)}
                </section>;
              })}
            </div>
          </div>}
        </div>
      </div>
        <div className="logs-header-actions">
          <label className="logs-stopped-toggle">
            <input
              type="checkbox"
              checked={showAllServers}
              onChange={(event) => setShowAllServers(event.target.checked)}
            />
            Inclure les arrêtés
          </label>
          <button
            className="quiet-button logs-split-toggle"
            onClick={() => setIsSplitMode((value) => !value)}
            aria-pressed={isSplitMode}
            disabled={allServers.length < 2}
            title="Comparer deux flux de logs"
          >
            <Columns size={14} /> {isSplitMode ? 'Une console' : 'Deux consoles'}
          </button>
          <button type="button" className="icon-button preview-controls-toggle" aria-expanded={showTools}
            aria-controls={isSplitMode ? 'terminal-controls-1 terminal-controls-2' : 'terminal-controls-1'}
            aria-label={showTools ? 'Replier les commandes des logs' : 'Afficher les commandes des logs'}
            title={showTools ? 'Replier les commandes des logs' : 'Afficher les commandes des logs'}
            onClick={() => setShowTools((shown) => !shown)}>
            <SprintNavIcon name="previewControls" active />{showTools ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>
      </header>
      {!showAllServers && (!runningServers.length || primaryServer?.state !== 'running' || (isSplitMode && secondaryServer?.state !== 'running')) && (
        <p className="logs-selection-note">{!runningServers.length
          ? 'Aucun serveur en marche : les serveurs arrêtés restent disponibles pour être lancés.'
          : 'Une console ouverte reste visible après l’arrêt du serveur pour conserver ses dernières lignes.'}</p>
      )}
      <div className={'terminal-grid ' + (isSplitMode ? 'split' : '')}>
        <TerminalPanel key={primaryServer?.id || 'empty-primary'} server={primaryServer} titlePrefix="Console 1" showTools={showTools}
          onStart={handleStartServer} pending={!!getOperation(primaryServer?.id)}
          selector={<ConsoleSelector server={primaryServer} servers={displayServers} number={1} otherId={isSplitMode ? secondaryServer?.id : null} onChange={openTab} onStart={handleStartServer} pending={!!getOperation(primaryServer?.id)} />} />
        {isSplitMode && <TerminalPanel key={secondaryServer?.id || 'empty-secondary'} server={secondaryServer} titlePrefix="Console 2" showTools={showTools}
          onStart={handleStartServer} pending={!!getOperation(secondaryServer?.id)}
          selector={<ConsoleSelector server={secondaryServer} servers={displayServers} number={2} otherId={primaryServer?.id} onChange={openSecondary} onStart={handleStartServer} pending={!!getOperation(secondaryServer?.id)} />} />}
      </div>
    </div>
  );
}
