import { lazy, Suspense, useState } from 'react';
import CommandPaletteModal from '../components/modals/CommandPaletteModal';

const AddProjectModal = lazy(() => import('../screens/projects/AddProjectModal'));
const EnvEditorModal = lazy(() => import('../screens/projects/EnvEditorModal'));
const EditProjectModal = lazy(() => import('../screens/projects/EditProjectModal'));
const ServerFormModal = lazy(() => import('../screens/projects/ServerFormModal'));
const AutoUpdateModal = lazy(() => import('../components/modals/AutoUpdateModal'));
const HelpModal = lazy(() => import('../components/modals/HelpModal'));

export default function AppModals({ shell }) {
  const [keepAddModalMounted, setKeepAddModalMounted] = useState(false);
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
    saveProjectChange,
    serverForm,
    setServerForm,
    isUpdateModalOpen,
    setIsUpdateModalOpen,
    appVersion,
    isHelpOpen,
    setIsHelpOpen,
  } = shell;

  if (isAddModalOpen && !keepAddModalMounted) {
    setKeepAddModalMounted(true);
  }

  return (
    <>
      <CommandPaletteModal
        isOpen={isPaletteOpen}
        onClose={() => setIsPaletteOpen(false)}
        projects={projects}
        onOpenTerminal={handleOpenTerminal}
        onSelectTab={setActiveTab}
        onAddProject={() => setIsAddModalOpen(true)}
      />
      <Suspense fallback={null}>
        {keepAddModalMounted && (
          <AddProjectModal
            isOpen={isAddModalOpen}
            onClose={() => setIsAddModalOpen(false)}
            onAddProject={handleAddProject}
            onAdded={() => {
              setIsAddModalOpen(false);
              setKeepAddModalMounted(false);
            }}
          />
        )}
      </Suspense>
      <Suspense fallback={null}>
        {!!envModalRoot && (
          <EnvEditorModal
            isOpen
            projectRoot={envModalRoot}
            onClose={() => setEnvModalRoot(null)}
          />
        )}
        {!!editProjectTarget && (
          <EditProjectModal
            isOpen
            project={editProjectTarget}
            saveProjectChange={saveProjectChange}
            onClose={() => setEditProjectTarget(null)}
          />
        )}
        {!!serverForm && (
          <ServerFormModal
            mode={serverForm.mode || 'add'}
            isOpen
            project={serverForm.project}
            server={serverForm.server}
            saveProjectChange={saveProjectChange}
            onClose={() => setServerForm(null)}
          />
        )}
        {isUpdateModalOpen && (
          <AutoUpdateModal
            isOpen
            onClose={() => setIsUpdateModalOpen(false)}
            currentVersion={appVersion}
          />
        )}
        {isHelpOpen && <HelpModal isOpen onClose={() => setIsHelpOpen(false)} />}
      </Suspense>
    </>
  );
}
