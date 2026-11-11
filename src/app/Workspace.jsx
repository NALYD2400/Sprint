import HomeView from '../screens/home/HomeView';
import ProjectsView from '../screens/projects/ProjectsView';
import PortsView from '../screens/ports/PortsView';
import TerminalView from '../screens/terminal/TerminalView';
import BrowserView from '../screens/preview/BrowserView';
import SettingsView from '../screens/settings/SettingsView';
import ErrorBoundary from '../components/ui/ErrorBoundary';

export default function WorkspaceMain({ shell }) {
  const {
    loading,
    activeTab,
    setActiveTab,
    metrics,
    projects,
    saveProjects,
    reloadProjects,
    prefs,
    updatePrefs,
    toggleFavoriteProject,
    setIsAddModalOpen,
    settingsSection,
    setSettingsSection,
    handleOpenTerminal,
    handleOpenBrowser,
    browserTarget,
    consumeBrowserTarget,
    selectedTerminalId,
    setEnvModalRoot,
    setEditProjectTarget,
    setServerForm,
    setIsUpdateModalOpen,
  } = shell;

  return (
    <main
      id="main-content"
      data-view={activeTab}
      tabIndex={-1}
      className="flex-1 min-w-0 min-h-0 px-8 lg:px-10 py-7 overflow-y-auto outline-none"
    >
      <ErrorBoundary resetKey={activeTab}>
        {loading ? (
          <div className="h-full flex items-center justify-center text-sm text-zinc-500" role="status">
            Chargement de vos projets…
          </div>
        ) : (
          <div key={activeTab} className="page-enter">
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
                onEditServer={({ project, server }) => setServerForm({ mode: 'edit', project, server })}
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
                initialServerId={selectedTerminalId}
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
          </div>
        )}
      </ErrorBoundary>
    </main>
  );
}
