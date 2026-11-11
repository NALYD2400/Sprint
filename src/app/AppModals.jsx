import AddProjectModal from '../screens/projects/AddProjectModal';
import CommandPaletteModal from '../components/modals/CommandPaletteModal';
import EnvEditorModal from '../screens/projects/EnvEditorModal';
import EditProjectModal from '../screens/projects/EditProjectModal';
import ServerFormModal from '../screens/projects/ServerFormModal';
import AutoUpdateModal from '../components/modals/AutoUpdateModal';
import HelpModal from '../components/modals/HelpModal';

export default function AppModals({ shell }) {
  const {
    isAddModalOpen,
    setIsAddModalOpen,
    handleAddProject,
    isPaletteOpen,
    setIsPaletteOpen,
    projects,
    handleOpenTerminal,
    setActiveTab,
    envModalRoot,
    setEnvModalRoot,
    editProjectTarget,
    setEditProjectTarget,
    saveProjects,
    serverForm,
    setServerForm,
    isUpdateModalOpen,
    setIsUpdateModalOpen,
    appVersion,
    isHelpOpen,
    setIsHelpOpen,
  } = shell;

  return (
    <>
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
        currentVersion={appVersion}
      />
      <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
    </>
  );
}
