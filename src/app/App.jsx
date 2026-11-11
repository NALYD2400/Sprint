import ColorBendsBackground from '../components/ui/ColorBendsBackground';
import TitleBar from '../components/layout/TitleBar';
import Sidebar from '../components/layout/Sidebar';
import ContextMenu from '../components/ui/ContextMenu';
import ToastContainer from '../components/ui/ToastContainer';
import WorkspaceMain from './Workspace';
import AppModals from './AppModals';
import { useShell } from './useShell';
import { resolveTheme } from '../lib/prefs';
import SystemMetricsProvider from '../components/layout/SystemMetricsProvider';

export default function App() {
  return <SystemMetricsProvider><AppShell /></SystemMetricsProvider>;
}

function AppShell() {
  const shell = useShell();

  return (
    <div className="app-shell flex flex-col overflow-hidden font-sans text-zinc-100">
      <a href="#main-content" className="skip-link">
        Aller au contenu
      </a>

      <div data-bg-canvas className="app-background">
        <ColorBendsBackground />
      </div>

      <ContextMenu
        onOpenCommandPalette={() => shell.setIsPaletteOpen(true)}
        onSelectTab={shell.setActiveTab}
      />
      <TitleBar
        runningCount={shell.activeServersCount}
        dark={resolveTheme(shell.prefs.theme) === 'dark'}
        onToggleTheme={() =>
          shell.updatePrefs({
            theme: resolveTheme(shell.prefs.theme) === 'dark' ? 'light' : 'dark',
          })
        }
      />

      <div
        className="flex-1 flex min-h-0 overflow-hidden z-10"
        data-sidebar-collapsed={shell.prefs.sidebarCollapsed ? 'true' : 'false'}
      >
        <Sidebar
          activeTab={shell.activeTab}
          setActiveTab={shell.setActiveTab}
          onOpenUpdateModal={() => shell.setIsUpdateModalOpen(true)}
          updateAvailable={shell.updateAvailable}
          collapsed={shell.prefs.sidebarCollapsed}
          onToggleCollapsed={() => shell.updatePrefs({ sidebarCollapsed: !shell.prefs.sidebarCollapsed })}
        />
        <WorkspaceMain shell={shell} />
      </div>

      <AppModals shell={shell} />
      <ToastContainer />
    </div>
  );
}
