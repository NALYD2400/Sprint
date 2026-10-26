import { readStoredSetting } from './services/settingsStorage';
import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { triggerToast } from './services/toastBus';
import ColorBendsBackground from './components/ui/ColorBendsBackground';
import TitleBar from './components/layout/TitleBar';
import Sidebar from './components/layout/Sidebar';
import { NAV_ITEMS } from './services/navigation';
import ErrorBoundary from './components/ui/ErrorBoundary';
import HelpModal from './components/modals/HelpModal';
import { loadPrefs, savePrefs, applyPrefs } from './services/prefs';
import { applyAccent } from './services/accent';
import HomeView from './components/views/HomeView';
import ProjectsView from './components/views/ProjectsView';
import PortsView from './components/views/PortsView';
import TerminalView from './components/views/TerminalView';
import BrowserView from './components/views/BrowserView';
import SettingsView from './components/views/SettingsView';
import ContextMenu from './components/ui/ContextMenu';
import AddProjectModal from './components/modals/AddProjectModal';
import CommandPaletteModal from './components/modals/CommandPaletteModal';
import EnvEditorModal from './components/modals/EnvEditorModal';
import EditProjectModal from './components/modals/EditProjectModal';
import ServerFormModal from './components/modals/ServerFormModal';
import AutoUpdateModal from './components/modals/AutoUpdateModal';
import ToastContainer from './components/ui/ToastContainer';
import { useProjects, useSystemMetrics } from './hooks/useTauriIPC';

import pkg from '../package.json';

const CURRENT_APP_VERSION = pkg.version;
const GITHUB_REPO = 'NALYD2400/portly';

function isNewerVersion(latest, current) {
  if (!latest || !current) return false;
  const cleanL = latest.replace(/^v/, '').trim();
  const cleanC = current.replace(/^v/, '').trim();
  const lParts = cleanL.split('.').map((p) => parseInt(p, 10) || 0);
  const cParts = cleanC.split('.').map((p) => parseInt(p, 10) || 0);
  for (let i = 0; i < Math.max(lParts.length, cParts.length); i++) {
    const l = lParts[i] || 0;
    const c = cParts[i] || 0;
    if (l > c) return true;
    if (l < c) return false;
  }
  return false;
}

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [envModalRoot, setEnvModalRoot] = useState(null);
  const [editProjectTarget, setEditProjectTarget] = useState(null);
  const [serverForm, setServerForm] = useState(null); // { mode: 'add'|'edit', project, server }
  const [selectedTerminal, setSelectedTerminal] = useState({
    id: null,
    name: null,
  });
  const [browserTarget, setBrowserTarget] = useState({
    serverId: null,
    url: null,
  });
  const consumeBrowserTarget = useCallback(() => setBrowserTarget({ serverId: null, url: null }), []);

  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [prefs, setPrefs] = useState(loadPrefs);
  const [settingsSection, setSettingsSection] = useState('appearance');

  const { projects, saveProjects, reload: reloadProjects, loading } = useProjects();
  const metrics = useSystemMetrics();

  useEffect(() => {
    let disposed = false;
    const subscriptions = [];
    const subscribe = (name, handler) => {
      listen(name, handler).then((unsubscribe) => {
        if (disposed) unsubscribe();
        else subscriptions.push(unsubscribe);
      }).catch((error) => console.warn('Tray event subscription failed:', error));
    };
    subscribe('tray-navigate', ({ payload }) => {
      const tab = typeof payload === 'string' ? payload : payload?.tab;
      if (['dashboard', 'projects', 'terminal', 'settings'].includes(tab)) {
        setIsPaletteOpen(false);
        if (payload?.serverId) setSelectedTerminal({ id: payload.serverId, name: null });
        setActiveTab(tab);
      }
    });
    subscribe('tray-action-error', ({ payload }) => {
      triggerToast({ title: 'Action impossible', message: payload, type: 'error' });
    });
    return () => {
      disposed = true;
      subscriptions.forEach((unsubscribe) => unsubscribe());
    };
  }, []);

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
      const next = { ...prev, favoriteProjectIds: ids.includes(projectId)
        ? ids.filter((id) => id !== projectId) : [...ids, projectId] };
      savePrefs(next);
      return next;
    });
  };

  // Applique thème, taille de texte et animations ; suit Windows en mode « Automatique ».
  useEffect(() => {
    applyPrefs(prefs);
    const mqls = [
      window.matchMedia('(prefers-color-scheme: light)'),
      window.matchMedia('(prefers-reduced-motion: reduce)'),
    ];
    const onSystemChange = () => applyPrefs(prefs);
    mqls.forEach((m) => m.addEventListener('change', onSystemChange));
    return () => mqls.forEach((m) => m.removeEventListener('change', onSystemChange));
  }, [prefs]);

  // Check for updates on GitHub Releases silently at app launch
  useEffect(() => {
    const checkUpdateOnLaunch = async () => {
      try {
        const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
          headers: { Accept: 'application/vnd.github.v3+json' },
        });
        if (res.ok) {
          const data = await res.json();
          const tag = data.tag_name ? data.tag_name.replace(/^v/, '') : '';
          if (tag && isNewerVersion(tag, CURRENT_APP_VERSION)) {
            setUpdateAvailable(true);
          }
        }
      } catch (e) {
        console.warn('Update check at launch failed:', e);
      }
    };
    checkUpdateOnLaunch();
  }, []);

  // Initialize custom Hex accent color & Register Global OS Shortcut at launch
  useEffect(() => {
    const savedHex = readStoredSetting('custom_hex');
    if (savedHex) applyAccent(savedHex);

    const savedShortcut = readStoredSetting('global_shortcut') || 'Ctrl+Alt+P';
    const shortcutTimer = setTimeout(() => {
      invoke('register_global_shortcut_cmd', { shortcut: savedShortcut }).catch((e) => {
        console.warn('Non-critical: Global shortcut registration fallback:', e);
      });
    }, 500);
    return () => clearTimeout(shortcutTimer);
  }, []);

  // Raccourcis clavier globaux
  useEffect(() => {
    const isTyping = (t) =>
      !!t &&
      (t.tagName === 'INPUT' ||
        t.tagName === 'TEXTAREA' ||
        t.tagName === 'SELECT' ||
        t.isContentEditable);

    const handleKeyDown = (e) => {
      if (e.defaultPrevented || document.querySelector('[aria-modal="true"]')) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (mod && key === 'k') {
        e.preventDefault();
        setIsPaletteOpen((prev) => !prev);
        return;
      }
      if (mod && /^[1-5]$/.test(e.key)) {
        e.preventDefault();
        const target = NAV_ITEMS.find((n) => n.key === e.key);
        if (target) setActiveTab(target.id);
        return;
      }
      if (mod && e.key === ',') {
        e.preventDefault();
        setActiveTab('settings');
        return;
      }
      if (mod && key === 'n' && !isTyping(e.target)) {
        e.preventDefault();
        setIsAddModalOpen(true);
        return;
      }
      if (mod && key === 'b') {
        e.preventDefault();
        setPrefs((prev) => {
          const next = { ...prev, sidebarCollapsed: !prev.sidebarCollapsed };
          savePrefs(next);
          return next;
        });
        return;
      }
      if ((e.key === '?' || e.key === 'F1') && !isTyping(e.target) && !mod) {
        e.preventDefault();
        setIsHelpOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const [showCanvasBg, setShowCanvasBg] = useState(
    () => readStoredSetting('canvas_bg') !== 'false',
  );

  useEffect(() => {
    const handleCanvasToggle = () => {
      setShowCanvasBg(readStoredSetting('canvas_bg') !== 'false');
    };
    window.addEventListener('storage', handleCanvasToggle);
    window.addEventListener('portly_canvas_toggle', handleCanvasToggle);
    return () => {
      window.removeEventListener('storage', handleCanvasToggle);
      window.removeEventListener('portly_canvas_toggle', handleCanvasToggle);
    };
  }, []);

  const activeServersCount = projects.reduce(
    (acc, p) => acc + (p.servers || []).filter((s) => s.state === 'running').length,
    0,
  );

  const pageLabel =
    activeTab === 'settings'
      ? 'Paramètres'
      : NAV_ITEMS.find((n) => n.id === activeTab)?.label || '';

  const handleOpenTerminal = (serverId, serverName) => {
    setSelectedTerminal({ id: serverId, name: serverName });
    setActiveTab('terminal');
  };

  const handleOpenBrowser = (serverId, url) => {
    setBrowserTarget({ serverId, url });
    setActiveTab('browser');
  };

  const handleAddProject = (newProject) => {
    const updated = [...projects, newProject];
    return saveProjects(updated);
  };

  return (
    <div className="app-shell flex flex-col overflow-hidden font-sans text-zinc-100 bg-[var(--bg-base)]">
      <a href="#main-content" className="skip-link">
        Aller au contenu
      </a>

      {/* Arrière-plan animé optionnel, volontairement discret */}
      {showCanvasBg && (
        <div
          data-bg-canvas
          className="app-background"
          style={{ opacity: prefs.backgroundIntensity / 100 }}
        >
          {prefs.backgroundIntensity > 0 && (
            <ColorBendsBackground blur={prefs.backgroundBlur} speed={prefs.backgroundSpeed} />
          )}
        </div>
      )}

      {/* Global Right-Click App Context Menu */}
      <ContextMenu onOpenCommandPalette={() => setIsPaletteOpen(true)} onSelectTab={setActiveTab} />

      {/* Custom Frameless Windows TitleBar */}
      <TitleBar pageLabel={pageLabel} runningCount={activeServersCount} />

      {/* Main Workspace Layout */}
      <div
        className="flex-1 flex min-h-0 overflow-hidden z-10"
        data-sidebar-collapsed={prefs.sidebarCollapsed ? 'true' : 'false'}
      >
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onOpenUpdateModal={() => setIsUpdateModalOpen(true)}
          updateAvailable={updateAvailable}
          onOpenCommandPalette={() => setIsPaletteOpen(true)}
          onOpenHelp={() => setIsHelpOpen(true)}
          collapsed={prefs.sidebarCollapsed}
          onToggleCollapsed={() => updatePrefs({ sidebarCollapsed: !prefs.sidebarCollapsed })}
        />

        {/* View Container */}
        <main
          id="main-content"
          data-view={activeTab}
          tabIndex={-1}
          className="flex-1 min-w-0 min-h-0 px-8 lg:px-10 py-7 overflow-y-auto outline-none"
        >
          <ErrorBoundary resetKey={activeTab}>
            {loading ? (
              <div
                className="h-full flex items-center justify-center text-sm text-zinc-500"
                role="status"
              >
                Chargement de vos projets…
              </div>
            ) : (
              <>
                {activeTab === 'dashboard' && (
                  <HomeView
                    metrics={metrics}
                    projects={projects}
                    onSelectTab={setActiveTab}
                    onAddProject={() => setIsAddModalOpen(true)}
                    onOpenBrowser={handleOpenBrowser}
                    prefs={prefs}
                    onCustomize={() => {
                      setSettingsSection('dashboard');
                      setActiveTab('settings');
                    }}
                    onOpenTerminal={handleOpenTerminal}
                  />
                )}

                {activeTab === 'projects' && (
                  <ProjectsView
                    projects={projects}
                    saveProjects={saveProjects}
                    favoriteProjectIds={prefs.favoriteProjectIds}
                    onToggleFavorite={toggleFavoriteProject}
                    onOpenTerminal={handleOpenTerminal}
                    onOpenBrowser={handleOpenBrowser}
                    onOpenEnvModal={(root) => setEnvModalRoot(root)}
                    onAddProject={() => setIsAddModalOpen(true)}
                    onEditProject={(project) => setEditProjectTarget(project)}
                    onEditServer={({ project, server }) =>
                      setServerForm({ mode: 'edit', project, server })
                    }
                    onAddServer={(project) => setServerForm({ mode: 'add', project })}
                  />
                )}

                {activeTab === 'browser' && (
                  <BrowserView
                    projects={projects}
                    initialServerId={browserTarget.serverId}
                    initialUrl={browserTarget.url}
                    onTargetConsumed={consumeBrowserTarget}
                    onSelectTab={(tab, serverId) => {
                      if (tab === 'terminal' && serverId) handleOpenTerminal(serverId);
                      else setActiveTab(tab);
                    }}
                  />
                )}

                {activeTab === 'ports' && <PortsView projects={projects} />}

                {activeTab === 'terminal' && (
                  <TerminalView
                    projects={projects}
                    initialServerId={selectedTerminal.id}
                    onSelectTab={setActiveTab}
                  />
                )}

                {activeTab === 'settings' && (
                  <SettingsView
                    projects={projects}
                    onOpenUpdateModal={() => setIsUpdateModalOpen(true)}
                    reloadProjects={reloadProjects}
                    prefs={prefs}
                    onPrefsChange={updatePrefs}
                    initialSection={settingsSection}
                  />
                )}
              </>
            )}
          </ErrorBoundary>
        </main>
      </div>

      {/* Modals */}
      <AddProjectModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAddProject={handleAddProject}
      />

      <CommandPaletteModal
        isOpen={isPaletteOpen}
        onClose={() => setIsPaletteOpen(false)}
        projects={projects}
        onOpenTerminal={handleOpenTerminal}
        onSelectTab={setActiveTab}
        onAddProject={() => setIsAddModalOpen(true)}
      />

      <EnvEditorModal
        isOpen={!!envModalRoot}
        projectRoot={envModalRoot}
        onClose={() => setEnvModalRoot(null)}
      />

      <EditProjectModal
        isOpen={!!editProjectTarget}
        project={editProjectTarget}
        projects={projects}
        saveProjects={saveProjects}
        onClose={() => setEditProjectTarget(null)}
      />

      <ServerFormModal
        mode={serverForm?.mode || 'add'}
        isOpen={!!serverForm}
        project={serverForm?.project}
        server={serverForm?.server}
        projects={projects}
        saveProjects={saveProjects}
        onClose={() => setServerForm(null)}
      />

      <AutoUpdateModal
        isOpen={isUpdateModalOpen}
        onClose={() => setIsUpdateModalOpen(false)}
        currentVersion={CURRENT_APP_VERSION}
      />

      <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />

      <ToastContainer />
    </div>
  );
}
