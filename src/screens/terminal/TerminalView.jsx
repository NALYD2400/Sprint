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
  Plus,
  ArrowRight,
  Loader2,
  X,
  ChevronDown,
  ChevronUp,
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
import ServerPickerMenu from '../../components/ui/ServerPickerMenu';
import { isServerLive, serverStatusLabel, serverStatusTone } from '../../lib/logTabs';

// Nombre max de lignes rendues dans le DOM (fenêtre glissante)
const MAX_RENDERED_LINES = 500;

const LogLine = React.memo(function LogLine({ entry, lineNumber, showRaw, active }) {
  const { isError, isSuccess, isInfo } = entry;
  return (
    <div
      data-log-id={entry.id}
      className={`log-line ${active ? 'log-line-selected' : ''} flex items-start px-2 py-0.5 rounded leading-relaxed ${
        isError
          ? 'is-error bg-red-500/10 text-red-300'
          : isSuccess
            ? 'is-success bg-emerald-500/10 text-emerald-300'
            : isInfo
              ? 'is-info theme-accent-text'
              : 'text-zinc-300 hover:bg-white/[0.02]'
      }`}
    >
      <span className="text-zinc-500 select-none mr-2.5 text-[12px] min-w-[2.2rem] text-right tabular-nums">
        {lineNumber}
      </span>
      <span className={`log-line-level${isError || isSuccess || isInfo ? ' has-badge' : ''}`}>
        {isError ? 'Erreur' : isSuccess ? 'Succès' : isInfo ? 'Info' : ''}
      </span>
      <span className="flex-1">
        <LogContent text={entry.raw} interpretAnsi={!showRaw} />
      </span>
    </div>
  );
});

function SplitPanelHeader({
  paneNumber,
  server,
  servers,
  otherId,
  onChange,
  onStart,
  onStop,
  pending,
}) {
  const groups = useMemo(() => {
    const map = new Map();
    for (const item of servers) {
      if (!map.has(item.projectId)) {
        map.set(item.projectId, { name: item.projectName, servers: [] });
      }
      map.get(item.projectId).servers.push(item);
    }
    return [...map];
  }, [servers]);

  const live = isServerLive(server);
  const tone = serverStatusTone(server);

  return (
    <div className="terminal-panel-head">
      <span className="terminal-pane-badge" aria-hidden="true">
        {paneNumber}
      </span>
      <select
        id={`console-server-${paneNumber}`}
        className="control-input terminal-pane-select"
        aria-label={`Console ${paneNumber}`}
        value={server?.id || ''}
        onChange={(event) => onChange(event.target.value)}
      >
        {!server && <option value="">Choisir un serveur</option>}
        {groups.map(([id, group]) => (
          <optgroup key={id} label={group.name}>
            {group.servers.map((item) => (
              <option key={item.id} value={item.id} disabled={item.id === otherId}>
                {item.projectName} · {item.name}
                {item.port ? ` · :${item.port}` : ''}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {server && (
        <span className="terminal-pane-status" title={serverStatusLabel(server, pending)}>
          <span className={`server-dot is-${tone}${tone === 'running' ? ' running' : ''}`} />
        </span>
      )}
      {server && (
        <button
          type="button"
          className={`quiet-button terminal-pane-action ${live ? 'is-stop' : 'is-start'}`}
          disabled={pending}
          onClick={() => (live ? onStop(server) : onStart(server))}
          aria-label={`${live ? 'Arrêter' : 'Lancer'} ${server.name} · Console ${paneNumber}`}
          title={live ? 'Arrêter le serveur' : 'Lancer le serveur'}
        >
          {pending ? (
            <Loader2 size={13} className="animate-spin" />
          ) : live ? (
            <Square size={12} />
          ) : (
            <Play size={12} />
          )}
          <span>{pending ? '…' : live ? 'Arrêter' : 'Lancer'}</span>
        </button>
      )}
    </div>
  );
}

// Single Terminal Panel Component
function TerminalPanel({
  paneNumber = 1,
  server,
  allServers = [],
  otherServerId = null,
  isSplitMode = false,
  isFocused = true,
  onFocusPane,
  onChangeServer,
  onStart,
  onStop,
  pending,
  showTools,
  onRequestShowTools,
}) {
  const titlePrefix = `Console ${paneNumber}`;
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
  const searchInputRef = useRef(null);
  const [toolsHeight, setToolsHeight] = useState(0);

  useLayoutEffect(() => {
    if (showTools && toolsRef.current) {
      const height = toolsRef.current.scrollHeight;
      if (height > 0) setToolsHeight(height);
    }
  }, [showTools, filter, level]);

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const height = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
      if (height > 0) setToolsHeight(height);
    });
    if (toolsRef.current) observer.observe(toolsRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isFocused) return undefined;
    const onKeyDown = (event) => {
      if (event.defaultPrevented || document.querySelector('[aria-modal="true"]')) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        if (!showTools) onRequestShowTools?.();
        requestAnimationFrame(() => searchInputRef.current?.focus());
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isFocused, showTools, onRequestShowTools]);

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
  const hasFilteredError = useMemo(
    () => filteredLogs.some((entry) => entry.isError),
    [filteredLogs],
  );
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
    if (activeErrorId)
      scrollRef.current?.querySelector(`[data-log-id="${activeErrorId}"]`)?.scrollIntoView({ block: 'center' });
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

  const live = isServerLive(server);
  const tone = serverStatusTone(server);

  return (
    <div
      className={`terminal-panel${isSplitMode && isFocused ? ' is-focused' : ''}`}
      onPointerDown={() => isSplitMode && onFocusPane?.(paneNumber)}
    >
      {isSplitMode && (
        <SplitPanelHeader
          paneNumber={paneNumber}
          server={server}
          servers={allServers}
          otherId={otherServerId}
          onChange={onChangeServer}
          onStart={onStart}
          onStop={onStop}
          pending={pending}
        />
      )}

      <div
        id={`terminal-controls-${paneNumber}`}
        className="workspace-controls-drawer"
        aria-hidden={!showTools}
        inert={!showTools ? true : undefined}
        style={{ height: showTools ? toolsHeight : 0 }}
      >
        <div className="terminal-controls-content" ref={toolsRef}>
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
                <div className="terminal-search-box">
                  <Search className="terminal-search-icon" size={13} aria-hidden="true" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Rechercher… (Ctrl+F)"
                    aria-label={`Rechercher dans les logs · ${titlePrefix}`}
                    className="control-input log-filter"
                  />
                  {filter && (
                    <span className="terminal-search-count" aria-live="polite">
                      {filteredLogs.length}/{displayLogs.length}
                    </span>
                  )}
                  {filter && (
                    <button
                      type="button"
                      className="terminal-search-clear"
                      title="Effacer la recherche"
                      aria-label={`Effacer la recherche · ${titlePrefix}`}
                      onClick={() => setFilter('')}
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
                {(filter || level !== 'all') && (
                  <button
                    type="button"
                    className="icon-button"
                    title="Réinitialiser les filtres"
                    aria-label={`Réinitialiser les filtres · ${titlePrefix}`}
                    onClick={() => {
                      setFilter('');
                      setLevel('all');
                    }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <div className="terminal-tools">
                <button
                  type="button"
                  className="quiet-button log-next-error"
                  onClick={nextError}
                  disabled={!hasFilteredError}
                  title="Aller à l’erreur suivante dans les résultats"
                  aria-label={`Erreur suivante · ${titlePrefix}`}
                >
                  <ArrowDown size={13} />
                  <span>Erreur suivante</span>
                  {errorLogs.length > 0 && (
                    <span className="log-error-count">{errorLogs.length}</span>
                  )}
                </button>

                <button
                  type="button"
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
                  type="button"
                  onClick={handleCopyLogs}
                  className="icon-button"
                  title="Copier les logs"
                  aria-label="Copier les logs filtrés"
                  disabled={!filteredLogs.length}
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </button>

                <button
                  type="button"
                  className="icon-button"
                  title="Exporter les logs"
                  aria-label="Exporter les logs filtrés"
                  disabled={!filteredLogs.length}
                  onClick={exportLogs}
                >
                  <Download size={14} />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    clearLogs();
                    resume();
                  }}
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
            <EmptyState
              icon={Search}
              title="Aucun résultat"
              description="Essayez un autre texte ou affichez tous les niveaux."
            >
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setFilter('');
                  setLevel('all');
                }}
              >
                Réinitialiser les filtres
              </button>
            </EmptyState>
          ) : (
            <EmptyState
              mark="terminal"
              title={
                server.state === 'running'
                  ? 'En attente des premières lignes'
                  : server.state === 'starting'
                    ? 'Démarrage du serveur…'
                    : 'Ce serveur est arrêté'
              }
              description={
                live
                  ? 'Les nouvelles sorties du serveur apparaîtront ici.'
                  : 'Lancez-le pour voir ses logs dans cette console.'
              }
              command={server.command}
            >
              {!live && (
                <button
                  type="button"
                  className="btn"
                  disabled={pending}
                  onClick={() => onStart(server)}
                  aria-label={`Lancer le serveur · ${titlePrefix}`}
                >
                  {pending ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                  {pending ? 'Lancement…' : 'Lancer le serveur'}
                </button>
              )}
            </EmptyState>
          )
        ) : (
          <>
            {hiddenByWindow > 0 && (
              <button
                type="button"
                onClick={() => {
                  pause();
                  setExpandedHistory(true);
                }}
                className="log-history-button"
              >
                ▲ {hiddenByWindow} lignes plus anciennes masquées · cliquer pour tout afficher
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
        <span className="terminal-footer-meta">
          <span>
            {filteredLogs.length} lignes
            {filteredLogs.length !== displayLogs.length ? ` sur ${displayLogs.length}` : ''}
          </span>
          {errorLogs.length > 0 && level !== 'errors' && (
            <button
              type="button"
              className="terminal-footer-errors"
              onClick={() => setLevel('errors')}
              title="Filtrer uniquement les erreurs"
            >
              {errorLogs.length} {errorLogs.length === 1 ? 'erreur' : 'erreurs'}
            </button>
          )}
        </span>
        {autoScroll ? (
          <span className="console-status">
            <span className={`server-dot is-${tone}${tone === 'running' ? ' running' : ''}`} />
            {server?.state === 'running'
              ? 'En direct'
              : server?.state === 'starting'
                ? 'Démarrage…'
                : server
                  ? 'Serveur arrêté'
                  : 'Aucun serveur'}
          </span>
        ) : (
          <button type="button" className="log-resume" onClick={resume}>
            <ArrowDown size={12} />{' '}
            {server?.state === 'running' ? 'Revenir au direct' : 'Dernières lignes'}
            {newLines > 0
              ? ` · ${newLines} ${newLines === 1 ? 'nouvelle ligne' : 'nouvelles lignes'}`
              : ' · Lecture en pause'}
          </button>
        )}
      </div>
    </div>
  );
}

export default function TerminalView({
  projects = [],
  projectIcons = {},
  allServers = [],
  openLogIds = [],
  openLogServers = [],
  activeLogId = null,
  splitLogId = null,
  isSplitMode = false,
  focusedPane = 1,
  onFocusPane,
  onOpenLogTab,
  onSetSplitServer,
  onToggleSplitMode,
  sidebarCollapsed = false,
  onSelectTab,
}) {
  const [showTools, setShowTools] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerPoint, setPickerPoint] = useState(null);
  const pickerAnchorRef = useRef(null);
  const headerAddRef = useRef(null);
  const emptyAddRef = useRef(null);
  const getOperation = useServerOperations();

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

  const primaryServer = allServers.find((server) => server.id === activeLogId) || null;
  const secondaryServer =
    allServers.find((server) => server.id === splitLogId && server.id !== primaryServer?.id) ||
    allServers.find((server) => server.id !== primaryServer?.id) ||
    null;

  const handleStartServer = (server) =>
    performServerAction('start', { root: server.projectRoot }, server, { silent: true });
  const handleStopServer = (server) =>
    performServerAction('stop', { root: server.projectRoot }, server);

  if (!allServers.length) {
    return (
      <div className="page logs-page">
        <PageHeader title="Logs" icon={<SprintNavIcon name="terminal" active />} />
        <div className="empty-state flex-1 flex flex-col items-center justify-center gap-3">
          <PageLogo name="terminal" />
          <h2 className="text-sm font-medium">Vos consoles apparaîtront ici</h2>
          <p className="text-xs text-zinc-400">
            Ajoutez un projet et configurez sa commande de lancement.
          </p>
          <button type="button" className="btn" onClick={() => onSelectTab?.('projects')}>
            Aller aux projets <ArrowRight size={14} />
          </button>
        </div>
      </div>
    );
  }

  const primaryLive = isServerLive(primaryServer);
  const primaryPending = !!getOperation(primaryServer?.id) || primaryServer?.state === 'starting';
  const primaryTone = serverStatusTone(primaryServer);

  return (
    <div className="page logs-page">
      <header className="page-header logs-header">
        <div className="logs-header-lead">
          <div className="page-header-intro preview-title">
            <span className="page-header-icon" aria-hidden="true">
              <SprintNavIcon name="terminal" active />
            </span>
            <h1 className="page-title">Logs</h1>
          </div>

          {!isSplitMode && primaryServer && (
            <div className="logs-active-server" data-server-id={primaryServer.id}>
              <ProjectAvatar
                project={primaryServer.project}
                image={projectIcons[primaryServer.projectId]}
                small
              />
              <div className="logs-active-server-meta">
                <span
                  className="logs-active-server-name"
                  title={`${primaryServer.projectName} · ${primaryServer.name}`}
                >
                  <span className="logs-active-project">{primaryServer.projectName}</span>
                  <span className="logs-active-sep" aria-hidden="true">
                    /
                  </span>
                  <strong>{primaryServer.name}</strong>
                </span>
                <span className="logs-active-server-status">
                  <span
                    className={`server-dot is-${primaryTone}${primaryTone === 'running' ? ' running' : ''}`}
                  />
                  <span>{serverStatusLabel(primaryServer, primaryPending)}</span>
                  {primaryServer.port > 0 && <span>· :{primaryServer.port}</span>}
                </span>
              </div>
              <button
                type="button"
                className={`quiet-button logs-server-action ${primaryLive ? 'is-stop' : 'is-start'}`}
                disabled={primaryPending}
                aria-label={`${primaryLive ? 'Arrêter' : 'Lancer'} ${primaryServer.projectName} · ${primaryServer.name}`}
                onClick={() =>
                  primaryLive ? handleStopServer(primaryServer) : handleStartServer(primaryServer)
                }
              >
                {primaryPending ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : primaryLive ? (
                  <Square size={12} />
                ) : (
                  <Play size={12} />
                )}
                <span>{primaryPending ? 'Patientez…' : primaryLive ? 'Arrêter' : 'Lancer'}</span>
              </button>
            </div>
          )}

          {isSplitMode && (
            <div className="logs-split-summary">
              <span>Vue comparée</span>
              <span>·</span>
              <span>2 consoles</span>
            </div>
          )}
        </div>

        <div className="logs-header-actions">
          {(sidebarCollapsed || !openLogServers.length) && (
            <button
              ref={headerAddRef}
              type="button"
              className="quiet-button logs-header-add"
              aria-label="Ouvrir des logs"
              aria-expanded={showPicker}
              title="Ouvrir une console"
              onClick={() => openPickerFrom(headerAddRef)}
            >
              <Plus size={14} />
              <span>Ouvrir</span>
            </button>
          )}
          <button
            type="button"
            className="quiet-button logs-split-toggle"
            onClick={onToggleSplitMode}
            aria-pressed={isSplitMode}
            disabled={allServers.length < 2 || (!isSplitMode && !primaryServer)}
            title="Comparer deux flux de logs"
          >
            <Columns size={14} /> {isSplitMode ? 'Une console' : 'Deux consoles'}
          </button>
          {primaryServer && (
            <button
              type="button"
              className="icon-button preview-controls-toggle"
              aria-expanded={showTools}
              aria-controls={
                isSplitMode ? 'terminal-controls-1 terminal-controls-2' : 'terminal-controls-1'
              }
              aria-label={showTools ? 'Replier les commandes des logs' : 'Afficher les commandes des logs'}
              title={showTools ? 'Replier les commandes des logs' : 'Afficher les commandes des logs'}
              onClick={() => setShowTools((shown) => !shown)}
            >
              <SprintNavIcon name="previewControls" active />
              {showTools ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          )}
        </div>
      </header>

      {!primaryServer ? (
        <div className="logs-empty-panel">
          <EmptyState
            mark="terminal"
            title="Aucune console ouverte"
            description="Les serveurs lancés apparaissent automatiquement sous Logs dans le menu latéral, ou ouvrez une console ici."
          >
            <button
              ref={emptyAddRef}
              type="button"
              className="btn"
              onClick={() => openPickerFrom(emptyAddRef)}
            >
              <Plus size={14} /> Ouvrir des logs
            </button>
            <div className="logs-quick-picks" aria-label="Accès rapide aux serveurs">
              {allServers.slice(0, 4).map((srv) => {
                const tone = serverStatusTone(srv);
                return (
                  <button
                    key={srv.id}
                    type="button"
                    className="logs-quick-pick"
                    onClick={() => onOpenLogTab?.(srv.id)}
                  >
                    <ProjectAvatar
                      project={srv.project}
                      image={projectIcons[srv.projectId]}
                      small
                    />
                    <span className="logs-quick-pick-copy">
                      <strong>{srv.name}</strong>
                      <small>{srv.projectName}</small>
                    </span>
                    <span className={`server-dot is-${tone}${tone === 'running' ? ' running' : ''}`} />
                  </button>
                );
              })}
            </div>
          </EmptyState>
        </div>
      ) : (
        <div className={`terminal-grid ${isSplitMode ? 'split' : ''}`}>
          <TerminalPanel
            key={primaryServer?.id || 'empty-primary'}
            paneNumber={1}
            server={primaryServer}
            allServers={allServers}
            otherServerId={isSplitMode ? secondaryServer?.id : null}
            isSplitMode={isSplitMode}
            isFocused={!isSplitMode || focusedPane === 1}
            onFocusPane={onFocusPane}
            onChangeServer={(id) => onOpenLogTab?.(id)}
            onStart={handleStartServer}
            onStop={handleStopServer}
            pending={!!getOperation(primaryServer?.id) || primaryServer?.state === 'starting'}
            showTools={showTools}
            onRequestShowTools={() => setShowTools(true)}
          />
          {isSplitMode && (
            <TerminalPanel
              key={secondaryServer?.id || 'empty-secondary'}
              paneNumber={2}
              server={secondaryServer}
              allServers={allServers}
              otherServerId={primaryServer?.id}
              isSplitMode
              isFocused={focusedPane === 2}
              onFocusPane={onFocusPane}
              onChangeServer={(id) => onSetSplitServer?.(id)}
              onStart={handleStartServer}
              onStop={handleStopServer}
              pending={!!getOperation(secondaryServer?.id) || secondaryServer?.state === 'starting'}
              showTools={showTools}
              onRequestShowTools={() => setShowTools(true)}
            />
          )}
        </div>
      )}

      <ServerPickerMenu
        mode="logs"
        open={showPicker}
        anchorRef={pickerAnchorRef}
        point={pickerPoint}
        onClose={() => setShowPicker(false)}
        projects={projects}
        projectIcons={projectIcons}
        openIds={openLogIds}
        activeId={activeLogId}
        splitId={splitLogId}
        isSplitMode={isSplitMode}
        onSelectServer={(serverId) => onOpenLogTab?.(serverId)}
        onGoToProjects={() => onSelectTab?.('projects')}
      />
    </div>
  );
}
