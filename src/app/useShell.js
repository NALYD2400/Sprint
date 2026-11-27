import { useProjectIcons } from '../hooks/useProjectIcons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { triggerToast } from '../lib/toastBus';
import { loadPrefs, savePrefs, applyPrefs } from '../lib/prefs';
import { NAV_ITEMS } from '../lib/navigation';
import { APP_VERSION, GITHUB_REPO, isNewerVersion } from '../lib/updates';
import { isTauriEnv, subscribeTauri } from '../lib/tauri';
import { useProjects } from '../hooks/useProjects';
import {
  isServerLive,
  readActiveLogId,
  readDismissedLogIds,
  readLogSplitMode,
  readOpenLogIds,
  readSplitLogId,
  saveActiveLogId,
  saveDismissedLogIds,
  saveLogSplitMode,
  saveOpenLogIds,
  saveSplitLogId,
  syncLogTabs,
} from '../lib/logTabs';
import {
  initialPreviewSelection,
  readDismissedTabs,
  readOpenTabs,
  saveDismissedTabs,
  saveOpenTabs,
  syncPreviewTabs,
} from '../screens/preview/previewTabs';
import { loadPreviewPrefs } from '../screens/preview/previewPrefs';

const TRAY_TABS = ['dashboard', 'projects', 'terminal', 'settings', 'browser'];

function isTyping(target) {
  return !!target && (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  );
}

export function useShell() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [envModalRoot, setEnvModalRoot] = useState(null);
  const [editProjectTarget, setEditProjectTarget] = useState(null);
  const [serverForm, setServerForm] = useState(null);
  const [openLogIds, setOpenLogIds] = useState(readOpenLogIds);
  const dismissedLogIdsRef = useRef(readDismissedLogIds());
  const [activeLogId, setActiveLogId] = useState(readActiveLogId);
  const [splitLogId, setSplitLogId] = useState(readSplitLogId);
  const [isLogSplitMode, setIsLogSplitMode] = useState(readLogSplitMode);
  const [focusedLogPane, setFocusedLogPane] = useState(1);
  const [openPreviewIds, setOpenPreviewIds] = useState([]);
  const dismissedPreviewIdsRef = useRef(readDismissedTabs());
  const previewInitializedRef = useRef(false);
  const [activePreviewId, setActivePreviewId] = useState(null);
  const [browserTarget, setBrowserTarget] = useState({ serverId: null, url: null, seq: 0 });
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [prefs, setPrefs] = useState(loadPrefs);
  const [settingsSection, setSettingsSection] = useState('appearance');

  const { projects, saveProjectChange, reload: reloadProjects, loading } = useProjects();
  const projectIcons = useProjectIcons(projects);

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

  const previewServers = useMemo(
    () =>
      allServers
        .filter((server) => server.port > 0)
        .map((server) => ({
          ...server,
          url: server.url || `http://localhost:${server.port}`,
        })),
    [allServers],
  );

  const previewStateRef = useRef({
    previewServers,
    openPreviewIds,
    activePreviewId,
    browserTarget,
  });
  previewStateRef.current = {
    previewServers,
    openPreviewIds,
    activePreviewId,
    browserTarget,
  };

  const logStateRef = useRef({
    allServers,
    openLogIds,
    activeLogId,
    splitLogId,
    isLogSplitMode,
    focusedLogPane,
  });
  logStateRef.current = {
    allServers,
    openLogIds,
    activeLogId,
    splitLogId,
    isLogSplitMode,
    focusedLogPane,
  };

  useEffect(() => {
    if (loading) return;
    const liveIds = new Set(allServers.filter(isServerLive).map((item) => item.id));
    let dismissedChanged = false;
    for (const id of dismissedLogIdsRef.current) {
      if (!liveIds.has(id)) {
        dismissedLogIdsRef.current.delete(id);
        dismissedChanged = true;
      }
    }
    if (dismissedChanged) saveDismissedLogIds(dismissedLogIdsRef.current);

    const nextOpen = syncLogTabs(openLogIds, allServers, dismissedLogIdsRef.current);
    const openChanged =
      nextOpen.length !== openLogIds.length ||
      nextOpen.some((id, index) => id !== openLogIds[index]);
    if (openChanged) {
      setOpenLogIds(nextOpen);
      saveOpenLogIds(nextOpen);
    }

    const nextActive = nextOpen.includes(activeLogId) ? activeLogId : nextOpen[0] || null;
    if (nextActive !== activeLogId) {
      setActiveLogId(nextActive);
      saveActiveLogId(nextActive);
    }

    const splitValid =
      splitLogId &&
      splitLogId !== nextActive &&
      allServers.some((server) => server.id === splitLogId);
    const nextSplit = splitValid
      ? splitLogId
      : nextOpen.find((id) => id !== nextActive) ||
        allServers.find((server) => server.id !== nextActive)?.id ||
        null;
    if (nextSplit !== splitLogId) {
      setSplitLogId(nextSplit);
      saveSplitLogId(nextSplit);
    }

    if (allServers.length < 2 && isLogSplitMode) {
      setIsLogSplitMode(false);
      saveLogSplitMode(false);
    }
  }, [loading, allServers, openLogIds, activeLogId, splitLogId, isLogSplitMode]);

  const openLogTab = useCallback((serverId, { navigate = true, pane } = {}) => {
    if (!serverId) {
      if (navigate) setActiveTab('terminal');
      return;
    }
    if (dismissedLogIdsRef.current.delete(serverId)) {
      saveDismissedLogIds(dismissedLogIdsRef.current);
    }
    const state = logStateRef.current;
    const nextOpen = state.openLogIds.includes(serverId)
      ? state.openLogIds
      : [...state.openLogIds, serverId];
    if (nextOpen !== state.openLogIds) {
      setOpenLogIds(nextOpen);
      saveOpenLogIds(nextOpen);
    }

    const targetPane = pane || (state.isLogSplitMode && state.focusedLogPane === 2 ? 2 : 1);
    if (targetPane === 2 && state.isLogSplitMode) {
      if (serverId === state.activeLogId) {
        setFocusedLogPane(1);
      } else {
        setSplitLogId(serverId);
        saveSplitLogId(serverId);
        setFocusedLogPane(2);
      }
    } else {
      if (
        state.isLogSplitMode &&
        serverId === state.splitLogId &&
        state.activeLogId &&
        state.activeLogId !== serverId
      ) {
        setSplitLogId(state.activeLogId);
        saveSplitLogId(state.activeLogId);
      }
      setActiveLogId(serverId);
      saveActiveLogId(serverId);
      setFocusedLogPane(1);
    }
    if (navigate) setActiveTab('terminal');
  }, []);

  const closeLogTab = useCallback((serverId) => {
    const state = logStateRef.current;
    const target = state.allServers.find((server) => server.id === serverId);
    if (isServerLive(target)) {
      dismissedLogIdsRef.current.add(serverId);
      saveDismissedLogIds(dismissedLogIdsRef.current);
    }
    const closedIndex = state.openLogIds.indexOf(serverId);
    const remaining = state.openLogIds.filter((id) => id !== serverId);
    setOpenLogIds(remaining);
    saveOpenLogIds(remaining);

    const nextActive =
      state.activeLogId === serverId
        ? remaining[Math.max(0, closedIndex - 1)] || remaining[0] || null
        : state.activeLogId;
    if (nextActive !== state.activeLogId) {
      setActiveLogId(nextActive);
      saveActiveLogId(nextActive);
    }

    if (state.isLogSplitMode) {
      if (!remaining.length) {
        setIsLogSplitMode(false);
        saveLogSplitMode(false);
        setSplitLogId(null);
        saveSplitLogId(null);
        setFocusedLogPane(1);
      } else if (state.splitLogId === serverId || state.splitLogId === nextActive) {
        const nextSplit =
          remaining.find((id) => id !== nextActive) ||
          state.allServers.find((server) => server.id !== nextActive)?.id ||
          null;
        setSplitLogId(nextSplit);
        saveSplitLogId(nextSplit);
      }
    }
  }, []);

  const setSplitLogServer = useCallback((serverId) => {
    if (!serverId) return;
    if (dismissedLogIdsRef.current.delete(serverId)) {
      saveDismissedLogIds(dismissedLogIdsRef.current);
    }
    const state = logStateRef.current;
    if (!state.openLogIds.includes(serverId)) {
      const nextOpen = [...state.openLogIds, serverId];
      setOpenLogIds(nextOpen);
      saveOpenLogIds(nextOpen);
    }
    setSplitLogId(serverId);
    saveSplitLogId(serverId);
    setFocusedLogPane(2);
  }, []);

  const toggleLogSplitMode = useCallback(() => {
    const state = logStateRef.current;
    if (state.allServers.length < 2) return;
    const nextMode = !state.isLogSplitMode;
    if (nextMode) {
      const primaryId = state.activeLogId || state.openLogIds[0] || state.allServers[0]?.id || null;
      const splitCandidate =
        state.splitLogId &&
        state.splitLogId !== primaryId &&
        state.allServers.some((server) => server.id === state.splitLogId)
          ? state.splitLogId
          : state.openLogIds.find((id) => id !== primaryId) ||
            state.allServers.find((server) => server.id !== primaryId)?.id ||
            null;
      const nextOpen = [...state.openLogIds];
      for (const id of [primaryId, splitCandidate]) {
        if (id) {
          dismissedLogIdsRef.current.delete(id);
          if (!nextOpen.includes(id)) nextOpen.push(id);
        }
      }
      saveDismissedLogIds(dismissedLogIdsRef.current);
      if (nextOpen.length !== state.openLogIds.length) {
        setOpenLogIds(nextOpen);
        saveOpenLogIds(nextOpen);
      }
      if (primaryId !== state.activeLogId) {
        setActiveLogId(primaryId);
        saveActiveLogId(primaryId);
      }
      if (splitCandidate !== state.splitLogId) {
        setSplitLogId(splitCandidate);
        saveSplitLogId(splitCandidate);
      }
    }
    setIsLogSplitMode(nextMode);
    saveLogSplitMode(nextMode);
    setFocusedLogPane(1);
  }, []);

  const openLogServers = useMemo(
    () =>
      openLogIds
        .map((id) => allServers.find((server) => server.id === id))
        .filter(Boolean),
    [openLogIds, allServers],
  );

  useEffect(() => {
    if (loading) return;
    const runningIds = new Set(
      previewServers.filter((item) => item.state === 'running').map((item) => item.id),
    );
    let dismissedChanged = false;
    for (const id of dismissedPreviewIdsRef.current) {
      if (!runningIds.has(id)) {
        dismissedPreviewIdsRef.current.delete(id);
        dismissedChanged = true;
      }
    }
    if (dismissedChanged) saveDismissedTabs(dismissedPreviewIdsRef.current);

    if (!previewInitializedRef.current) {
      previewInitializedRef.current = true;
      const savedPreview = loadPreviewPrefs();
      const init = initialPreviewSelection(previewServers, {
        initialServerId: previewStateRef.current.browserTarget.serverId,
        savedServerId: savedPreview.serverId,
        savedOpenIds: readOpenTabs(),
        dismissed: dismissedPreviewIdsRef.current,
      });
      setOpenPreviewIds(init.openIds);
      saveOpenTabs(init.openIds);
      setActivePreviewId(init.serverId);
      return;
    }

    const nextOpen = syncPreviewTabs(
      openPreviewIds,
      previewServers,
      dismissedPreviewIdsRef.current,
    );
    const openChanged =
      nextOpen.length !== openPreviewIds.length ||
      nextOpen.some((id, index) => id !== openPreviewIds[index]);
    if (openChanged) {
      setOpenPreviewIds(nextOpen);
      saveOpenTabs(nextOpen);
    }

    const activeValid =
      activePreviewId &&
      nextOpen.includes(activePreviewId) &&
      previewServers.some((item) => item.id === activePreviewId);
    if (!activeValid) {
      const nextActive =
        [...nextOpen].reverse().find((id) => previewServers.some((item) => item.id === id)) ||
        null;
      if (nextActive !== activePreviewId) setActivePreviewId(nextActive);
    }
  }, [loading, previewServers, openPreviewIds, activePreviewId]);

  const openPreviewTab = useCallback((serverId, { navigate = true, url, resetUrl = false } = {}) => {
    const state = previewStateRef.current;
    if (!serverId) {
      if (navigate) setActiveTab('browser');
      return;
    }
    if (!state.previewServers.some((item) => item.id === serverId)) return;
    if (dismissedPreviewIdsRef.current.delete(serverId)) {
      saveDismissedTabs(dismissedPreviewIdsRef.current);
    }
    const nextOpen = state.openPreviewIds.includes(serverId)
      ? state.openPreviewIds
      : [...state.openPreviewIds, serverId];
    if (nextOpen !== state.openPreviewIds) {
      setOpenPreviewIds(nextOpen);
      saveOpenTabs(nextOpen);
    }
    setActivePreviewId(serverId);
    if (resetUrl || url) {
      setBrowserTarget((prev) => ({ serverId, url: url || null, seq: prev.seq + 1 }));
    }
    if (navigate) setActiveTab('browser');
  }, []);

  const closePreviewTab = useCallback((serverId) => {
    const state = previewStateRef.current;
    if (state.previewServers.some((item) => item.id === serverId && isServerLive(item))) {
      dismissedPreviewIdsRef.current.add(serverId);
      saveDismissedTabs(dismissedPreviewIdsRef.current);
    }
    const closedIndex = state.openPreviewIds.indexOf(serverId);
    const remaining = state.openPreviewIds.filter(
      (id) => id !== serverId && state.previewServers.some((item) => item.id === id),
    );
    setOpenPreviewIds(remaining);
    saveOpenTabs(remaining);
    if (serverId === state.activePreviewId) {
      const next = remaining[Math.max(0, closedIndex - 1)] || remaining[0] || null;
      setActivePreviewId(next);
    }
  }, []);

  const openPreviewServers = useMemo(
    () =>
      openPreviewIds
        .map((id) => previewServers.find((server) => server.id === id))
        .filter(Boolean),
    [openPreviewIds, previewServers],
  );

  const consumeBrowserTarget = useCallback(
    () => setBrowserTarget((prev) => (prev.serverId || prev.url ? { serverId: null, url: null, seq: prev.seq } : prev)),
    [],
  );

  const updatePrefs = (patch) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      savePrefs(next);
      return next;
    });
  };

  const toggleFavoriteProject = (projectId) => {
    setPrefs((prev) => {
      const ids = prev.favoriteProjectIds;
      const next = {
        ...prev,
        favoriteProjectIds: ids.includes(projectId)
          ? ids.filter((id) => id !== projectId)
          : [...ids, projectId],
      };
      savePrefs(next);
      return next;
    });
  };

  useEffect(() => {
    if (!isTauriEnv()) return undefined;
    let disposed = false;
    const subscriptions = [];
    const subscribe = (name, handler) => {
      subscribeTauri(name, handler).then((unsubscribe) => {
        if (disposed) unsubscribe();
        else subscriptions.push(unsubscribe);
      }).catch((error) => console.warn('Abonnement tray impossible:', error));
    };
    subscribe('tray-navigate', ({ payload }) => {
      const tab = typeof payload === 'string' ? payload : payload?.tab;
      if (!TRAY_TABS.includes(tab)) return;
      setIsPaletteOpen(false);
      if (payload?.serverId) {
        if (tab === 'browser') {
          openPreviewTab(payload.serverId, {
            navigate: true,
            url: payload.url || null,
            resetUrl: true,
          });
          return;
        }
        if (tab === 'terminal') {
          openLogTab(payload.serverId, { navigate: true, pane: 1 });
          return;
        }
      }
      setActiveTab(tab);
    });
    subscribe('tray-action-error', ({ payload }) => {
      triggerToast({ title: 'Action impossible', message: payload, type: 'error' });
    });
    subscribe('shutdown-error', ({ payload }) => {
      triggerToast({ title: 'Fermeture impossible', message: payload, type: 'error' });
    });
    return () => {
      disposed = true;
      subscriptions.forEach((unsubscribe) => unsubscribe());
    };
  }, [openLogTab, openPreviewTab]);

  useEffect(() => {
    applyPrefs(prefs);
    const queries = [
      window.matchMedia('(prefers-color-scheme: light)'),
      window.matchMedia('(prefers-reduced-motion: reduce)'),
    ];
    const onSystemChange = () => applyPrefs(prefs);
    queries.forEach((query) => query.addEventListener('change', onSystemChange));
    return () => queries.forEach((query) => query.removeEventListener('change', onSystemChange));
  }, [prefs]);

  useEffect(() => {
    let cancelled = false;
    fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github.v3+json' },
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        const tag = data?.tag_name ? data.tag_name.replace(/^v/, '') : '';
        if (!cancelled && tag && isNewerVersion(tag, APP_VERSION)) setUpdateAvailable(true);
      })
      .catch((error) => console.warn('Update check at launch failed:', error));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.defaultPrevented || document.querySelector('[aria-modal="true"]')) return;
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (mod && key === 'k') {
        event.preventDefault();
        setIsPaletteOpen((prev) => !prev);
        return;
      }
      if (mod && /^[1-5]$/.test(event.key)) {
        event.preventDefault();
        const target = NAV_ITEMS.find((item) => item.key === event.key);
        if (target) setActiveTab(target.id);
        return;
      }
      if (mod && event.key === ',') {
        event.preventDefault();
        setActiveTab('settings');
        return;
      }
      if (mod && key === 'n' && !isTyping(event.target)) {
        event.preventDefault();
        setIsAddModalOpen(true);
        return;
      }
      if (mod && key === 'b') {
        event.preventDefault();
        setPrefs((prev) => {
          const next = { ...prev, sidebarCollapsed: !prev.sidebarCollapsed };
          savePrefs(next);
          return next;
        });
        return;
      }
      if ((event.key === '?' || event.key === 'F1') && !isTyping(event.target) && !mod) {
        event.preventDefault();
        setIsHelpOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const activeServersCount = projects.reduce(
    (count, project) => count + (project.servers || []).filter((server) => server.state === 'running').length,
    0,
  );

  const handleOpenTerminal = useCallback(
    (serverId) => {
      openLogTab(serverId, { navigate: true, pane: 1 });
    },
    [openLogTab],
  );
  const handleOpenBrowser = useCallback(
    (serverId, url) => {
      openPreviewTab(serverId, { navigate: true, url: url || null, resetUrl: true });
    },
    [openPreviewTab],
  );
  const handleAddProject = (project) => saveProjectChange({ type: 'addProject', project });

  return {
    activeTab,
    setActiveTab,
    isAddModalOpen,
    setIsAddModalOpen,
    isPaletteOpen,
    setIsPaletteOpen,
    isUpdateModalOpen,
    setIsUpdateModalOpen,
    updateAvailable,
    envModalRoot,
    setEnvModalRoot,
    editProjectTarget,
    setEditProjectTarget,
    serverForm,
    setServerForm,
    allServers,
    openLogIds,
    openLogServers,
    activeLogId,
    splitLogId,
    isLogSplitMode,
    focusedLogPane,
    setFocusedLogPane,
    openLogTab,
    closeLogTab,
    setSplitLogServer,
    toggleLogSplitMode,
    previewServers,
    openPreviewIds,
    openPreviewServers,
    activePreviewId,
    openPreviewTab,
    closePreviewTab,
    browserTarget,
    consumeBrowserTarget,
    isHelpOpen,
    setIsHelpOpen,
    prefs,
    updatePrefs,
    toggleFavoriteProject,
    settingsSection,
    setSettingsSection,
    projects,
    projectIcons,
    saveProjectChange,
    reloadProjects,
    loading,
    activeServersCount,
    handleOpenTerminal,
    handleOpenBrowser,
    handleAddProject,
    appVersion: APP_VERSION,
  };
}
