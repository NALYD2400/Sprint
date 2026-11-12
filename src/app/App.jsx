import { useEffect } from 'react';
import ColorBendsBackground from '../components/ui/ColorBendsBackground';
import TitleBar from '../components/layout/TitleBar';
import Sidebar from '../components/layout/Sidebar';
import ToastContainer from '../components/ui/ToastContainer';
import WorkspaceMain from './Workspace';
import AppModals from './AppModals';
import { useShell } from './useShell';
import { resolveTheme } from '../lib/prefs';
import SystemMetricsProvider from '../components/layout/SystemMetricsProvider';

export default function App() {
  return <SystemMetricsProvider><AppShell /></SystemMetricsProvider>;
}

function keepNativeContextMenu(target) {
  if (!target?.tagName) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable ||
    !!target.closest?.('[aria-modal="true"]')
  );
}

function AppShell() {
  const shell = useShell();

  useEffect(() => {
    // Le clic droit ne propose plus de navigation : ces pages sont déjà dans la barre latérale.
    // On bloque quand même le menu du navigateur (recharger, imprimer), sauf dans les champs et les dialogues.
    const blockBrowserMenu = (event) => {
      if (keepNativeContextMenu(event.target)) return;
      event.preventDefault();
    };
    window.addEventListener('contextmenu', blockBrowserMenu);
    return () => window.removeEventListener('contextmenu', blockBrowserMenu);
  }, []);

  return (
    <div className="app-shell flex flex-col overflow-hidden font-sans text-zinc-100">
      <a href="#main-content" className="skip-link">
        Aller au contenu
      </a>

      <div data-bg-canvas className="app-background">
        <ColorBendsBackground />
      </div>

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
