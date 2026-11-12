import { useProjectIcons } from '../hooks/useProjectIcons';
import { useCallback, useEffect, useState } from 'react';
import { triggerToast } from '../lib/toastBus';
import { loadPrefs, savePrefs, applyPrefs } from '../lib/prefs';
import { NAV_ITEMS } from '../lib/navigation';
import { APP_VERSION, GITHUB_REPO, isNewerVersion } from '../lib/updates';
import { isTauriEnv, subscribeTauri } from '../lib/tauri';
import { useProjects } from '../hooks/useProjects';

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
  const [selectedTerminalId, setSelectedTerminalId] = useState(null);
  const [browserTarget, setBrowserTarget] = useState({ serverId: null, url: null });
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [prefs, setPrefs] = useState(loadPrefs);
  const [settingsSection, setSettingsSection] = useState('appearance');

  const { projects, saveProjects, reload: reloadProjects, loading } = useProjects();
  const projectIcons = useProjectIcons(projects);

  const consumeBrowserTarget = useCallback(() => setBrowserTarget({ serverId: null, url: null }), []);

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
        if (tab === 'browser') setBrowserTarget({ serverId: payload.serverId, url: payload.url || null });
        else if (tab === 'terminal') setSelectedTerminalId(payload.serverId);
      }
      setActiveTab(tab);
    });
    subscribe('tray-action-error', ({ payload }) => {
      triggerToast({ title: 'Action impossible', message: payload, type: 'error' });
    });
    return () => {
      disposed = true;
      subscriptions.forEach((unsubscribe) => unsubscribe());
    };
  }, []);

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

  const handleOpenTerminal = (serverId) => {
    setSelectedTerminalId(serverId);
    setActiveTab('terminal');
  };
  const handleOpenBrowser = (serverId, url) => {
    setBrowserTarget({ serverId, url });
    setActiveTab('browser');
  };
  const handleAddProject = (newProject) => saveProjects([...projects, newProject]);

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
    selectedTerminalId,
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
    saveProjects,
    reloadProjects,
    loading,
    activeServersCount,
    handleOpenTerminal,
    handleOpenBrowser,
    handleAddProject,
    appVersion: APP_VERSION,
  };
}
