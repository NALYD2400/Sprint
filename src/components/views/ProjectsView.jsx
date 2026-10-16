import React, { useState, useEffect } from 'react';
import FloatingMenu from '../ui/FloatingMenu';
import { invoke } from '@tauri-apps/api/core';
import {
  ExternalLink,
  Code2,
  Folder,
  FileText,
  Trash2,
  Plus,
  Terminal,
  Edit3,
  ChevronDown,
  Globe,
  Search,
  Monitor,
  MoreHorizontal,
  Copy,
  AlertTriangle,
} from 'lucide-react';
import { triggerToast } from '../../services/toastBus';
import ConfirmDialog from '../ui/ConfirmDialog';
import ServerControls from '../ui/ServerControls';
import useServerOperations from '../../hooks/useServerOperations';
import { startProject, stopProject, openUrl, projectUrl } from '../../services/serverActions';

function MenuItem({ icon: Icon, danger, onClick, children }) {
  return (
    <button
      onClick={onClick}
      role="menuitem"
      className={`w-full flex items-center gap-2.5 px-2.5 min-h-8 py-1.5 rounded-md transition-colors cursor-pointer text-left ${
        danger ? 'text-rose-400 hover:bg-rose-500/10' : 'text-zinc-300 hover:text-white hover:bg-white/[0.06]'
      }`}
    >
      <Icon className="w-3.5 h-3.5 opacity-70" />
      <span>{children}</span>
    </button>
  );
}

function IconBtn({ title, onClick, children }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className="w-7 h-7 flex items-center justify-center rounded-md text-zinc-500 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
    >
      {children}
    </button>
  );
}

const serverStartTimestamps = {};

function ServerUptimeBadge({ serverId, isRunning }) {
  const [uptimeStr, setUptimeStr] = useState('0s');

  useEffect(() => {
    if (!isRunning) {
      delete serverStartTimestamps[serverId];
      setUptimeStr('0s');
      return undefined;
    }

    if (!serverStartTimestamps[serverId]) {
      serverStartTimestamps[serverId] = Date.now();
    }

    const update = () => {
      const startTime = serverStartTimestamps[serverId];
      const diffSec = Math.max(0, Math.floor((Date.now() - startTime) / 1000));
      if (diffSec < 60) {
        setUptimeStr(`${diffSec}s`);
      } else if (diffSec < 3600) {
        const m = Math.floor(diffSec / 60);
        const s = diffSec % 60;
        setUptimeStr(`${m}m ${s}s`);
      } else {
        const h = Math.floor(diffSec / 3600);
        const m = Math.floor((diffSec % 3600) / 60);
        setUptimeStr(`${h}h ${m}m`);
      }
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [serverId, isRunning]);

  return (
    <span>{uptimeStr}</span>
  );
}

export default function ProjectsView({
  projects,
  saveProjects,
  onOpenTerminal,
  onOpenBrowser,
  onOpenEnvModal,
  onAddProject,
  onEditProject,
  onEditServer,
  onAddServer,
}) {
  const [collapsedProjects, setCollapsedProjects] = useState(() => {
    try {
      const saved = localStorage.getItem('sprint_collapsed_projects') || localStorage.getItem('portly_collapsed_projects');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [search, setSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const getOperation = useServerOperations();
  const [openMenu, setOpenMenu] = useState(null); // { type: 'project'|'server', id: string } | null

  // Fermer le menu au clic a l'exterieur ou via la touche Echap
  useEffect(() => {
    if (!openMenu) return undefined;

    const handlePointerDown = (e) => {
      if (!e.target.closest('[data-dropdown-container]')) {
        setOpenMenu(null);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setOpenMenu(null);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openMenu]);

  const toggleProjectCollapse = (projectId) => {
    setCollapsedProjects((prev) => {
      const updated = { ...prev, [projectId]: !prev[projectId] };
      try {
        localStorage.setItem('sprint_collapsed_projects', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const handleToggleAll = () => {
    const allCollapsed = projects.every((p) => collapsedProjects[p.id]);
    const nextState = {};
    projects.forEach((p) => {
      nextState[p.id] = !allCollapsed;
    });
    setCollapsedProjects(nextState);
    try {
      localStorage.setItem('sprint_collapsed_projects', JSON.stringify(nextState));
    } catch {}
  };

  const handleShareTunnel = async (port) => {
    if (!port) return;
    triggerToast({
      title: '🌐 Génération du Tunnel...',
      message: `Création de l'URL publique pour le port :${port}`,
      type: 'info',
      duration: 3000,
    });

    try {
      const publicUrl = await invoke('start_localtunnel_cmd', { port: Number(port) });
      if (publicUrl) {
        navigator.clipboard.writeText(publicUrl);
        triggerToast({
          title: '🌐 Tunnel Public Actif !',
          message: `${publicUrl} (Copié dans le presse-papier !)`,
          type: 'success',
          duration: 7000,
        });
        invoke('open_browser', { url: publicUrl });
      }
    } catch (e) {
      triggerToast({
        title: '⚠️ Échec du Tunnel',
        message: String(e),
        type: 'error',
        duration: 7000,
      });
    }
  };

  const handleOpenVSCode = (path) =>
    invoke('open_vscode', { path }).catch((e) =>
      triggerToast({ title: '⚠️ VS Code', message: String(e), type: 'error' })
    );
  const handleOpenExplorer = (path) =>
    invoke('open_explorer', { path }).catch((e) =>
      triggerToast({ title: '⚠️ Explorateur', message: String(e), type: 'error' })
    );
  const handleOpenBrowser = openUrl;
  const handleStartProjectServers = startProject;
  const [confirmStopProject, setConfirmStopProject] = useState(null);
  const handleStopProjectServers = (project) => setConfirmStopProject(project);
  const executeStopProject = async () => {
    const project = confirmStopProject;
    setConfirmStopProject(null);
    if (project) await stopProject(project);
  };
  const handleCopyPath = async (path) => {
    try {
      await navigator.clipboard.writeText(path);
      triggerToast({ title: 'Chemin copié', message: path, type: 'success' });
    } catch (error) {
      triggerToast({ title: 'Copie impossible', message: String(error), type: 'error' });
    }
  };

  const confirmDeleteTarget = confirmDelete || {};
  const confirmDeleteMessage =
    confirmDeleteTarget.type === 'server'
      ? `Supprimer le serveur « ${confirmDeleteTarget.name} » de « ${confirmDeleteTarget.projectName} » ? Sa configuration (commande, port, .env du serveur) sera définitivement perdue.`
      : `Supprimer le projet « ${confirmDeleteTarget.name} » et ses ${confirmDeleteTarget.serverCount ?? 0} serveur(s) configurés ? Les fichiers du projet ne seront PAS touchés, mais la configuration Sprint sera définitivement perdue.`;

  const executeConfirmedDelete = async () => {
    if (!confirmDelete) return;

    if (confirmDelete.type === 'project') {
      if (await saveProjects(projects.filter((p) => p.id !== confirmDelete.projectId)) === false) return;
      triggerToast({
        title: '🗑 Projet Supprimé',
        message: `« ${confirmDelete.name} » a été retiré de Sprint.`,
        type: 'warning',
      });
    } else if (confirmDelete.type === 'server') {
      const updatedProjects = projects.map((prj) => {
        if (prj.id === confirmDelete.projectId) {
          return {
            ...prj,
            servers: (prj.servers || []).filter((s) => s.id !== confirmDelete.serverId),
          };
        }
        return prj;
      });
      if (await saveProjects(updatedProjects) === false) return;
      triggerToast({
        title: '🗑 Serveur Supprimé',
        message: `« ${confirmDelete.name} » a été retiré du projet.`,
        type: 'warning',
      });
    }

    setConfirmDelete(null);
  };

  const q = search.trim().toLowerCase();
  const filteredProjects = q
    ? projects.filter((p) => {
        const inProject =
          p.name.toLowerCase().includes(q) ||
          (p.root || '').toLowerCase().includes(q) ||
          (p.framework || '').toLowerCase().includes(q);
        const inServers = (p.servers || []).some(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            (s.command || '').toLowerCase().includes(q) ||
            String(s.port || '').includes(q)
        );
        return inProject || inServers;
      })
    : projects;

  const totalRunningServers = projects.reduce(
    (acc, p) => acc + (p.servers || []).filter((s) => s.state === 'running').length,
    0
  );

  return (
    <div className="projects-page animate-fadeIn select-none pb-12 max-w-4xl mx-auto">
      {/* En-tête */}
      <div className="page-header flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-[22px] font-semibold text-zinc-50 tracking-tight">Projets</h1>
          <p className="text-[13px] text-zinc-500 mt-1">
            {projects.length} projet{projects.length > 1 ? 's' : ''}
            {totalRunningServers > 0 && (
              <span className="text-emerald-400"> · {totalRunningServers} en cours</span>
            )}
          </p>
        </div>

        <div className="project-tools flex flex-wrap items-center gap-2 min-w-0">
          {projects.length > 0 && (
            <>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5 pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filtrer"
                  className="project-filter pl-8 pr-3 h-8 rounded-md bg-transparent hover:bg-white/[0.04] border border-transparent text-xs text-white placeholder-zinc-600 focus:bg-white/[0.04] w-36"
                />
              </div>
              <button
                onClick={handleToggleAll}
                className="quiet-button h-9"
                title="Déplier ou replier tous les projets"
                aria-expanded={!projects.every((p) => collapsedProjects[p.id])}
              >
                <ChevronDown size={14} className={projects.every((p) => collapsedProjects[p.id]) ? '' : 'rotate-180'} />
                {projects.every((p) => collapsedProjects[p.id]) ? 'Tout déplier' : 'Tout replier'}
              </button>
            </>
          )}
          <button
            onClick={onAddProject}
            className="btn"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nouveau</span>
          </button>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="py-20 text-center space-y-4">
          <Folder className="w-8 h-8 text-zinc-600 mx-auto" />
          <div>
            <h3 className="text-sm font-medium text-white">Aucun projet</h3>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto mt-1">
              Ajoutez un dossier pour détecter automatiquement ses commandes.
            </p>
          </div>
          <button
            onClick={onAddProject}
            className="btn"
          >
            Choisir un dossier
          </button>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="py-20 text-center">
          <Search className="w-7 h-7 text-zinc-600 mx-auto mb-3" />
          <p className="text-sm text-zinc-300">Aucun résultat pour « {search} »</p>
        </div>
      ) : (
        <div className="space-y-7">
          {filteredProjects.map((project) => {
            const isCollapsed = !!collapsedProjects[project.id];
            const servers = project.servers || [];
            const activeServersCount = servers.filter((s) => s.state === 'running').length;
            const projColor = project.color || 'var(--accent-color)';
            const isProjectMenuOpen = openMenu?.type === 'project' && openMenu.id === project.id;
            const hasActiveMenu =
              isProjectMenuOpen || (openMenu?.type === 'server' && servers.some((s) => s.id === openMenu?.id));
            const meta = [project.framework, project.branch].filter(Boolean).join(' · ');

            return (
              <section key={project.id} className={hasActiveMenu ? 'relative z-30' : ''}>
                {/* Titre de projet */}
                <div className="group/head flex items-center justify-between gap-3 h-9">
                  <button
                    onClick={() => toggleProjectCollapse(project.id)}
                    className="flex items-center gap-2.5 min-w-0 min-h-6 cursor-pointer text-left"
                    aria-label={isCollapsed ? 'Déplier le projet' : 'Replier le projet'}
                  >
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-zinc-600 transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
                    />
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: projColor }} />
                    <span className="text-sm font-medium text-white truncate">{project.name}</span>
                    {meta && <span className="text-xs text-zinc-600 truncate">{meta}</span>}
                    {isCollapsed && activeServersCount > 0 && (
                      <span className="text-xs text-emerald-400">{activeServersCount} en cours</span>
                    )}
                  </button>

                  <div className="flex items-center gap-1 shrink-0">
                    {servers.length > 1 &&
                      (activeServersCount > 0 ? (
                        <button
                          disabled={servers.some((server) => getOperation(server.id))}
                          onClick={() => handleStopProjectServers(project)}
                          className="h-7 px-2 rounded-md text-xs text-zinc-300 hover:text-rose-300 hover:bg-rose-500/10 transition-colors cursor-pointer"
                        >
                          Tout arrêter
                        </button>
                      ) : (
                        <button
                          disabled={servers.some((server) => getOperation(server.id))}
                          onClick={() => handleStartProjectServers(project)}
                          className="h-7 px-2 rounded-md text-xs text-zinc-400 hover:text-emerald-300 hover:bg-emerald-500/10 opacity-0 group-hover/head:opacity-100 focus:opacity-100 transition-all cursor-pointer"
                        >
                          Tout lancer
                        </button>
                      ))}

                    <div className="relative" data-dropdown-container>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenu((prev) =>
                            prev?.type === 'project' && prev?.id === project.id
                              ? null
                              : { type: 'project', id: project.id }
                          );
                        }}
                        className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors cursor-pointer ${
                          isProjectMenuOpen
                            ? 'bg-white/[0.08] text-white'
                            : 'text-zinc-500 hover:text-white hover:bg-white/[0.05] opacity-0 group-hover/head:opacity-100'
                        }`}
                        title="Options du projet"
                        aria-label="Options du projet"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>

                      {isProjectMenuOpen && (
                        <FloatingMenu className="rounded-lg p-1 text-xs">
                          <MenuItem
                            icon={Code2}
                            onClick={() => {
                              setOpenMenu(null);
                              handleOpenVSCode(project.root);
                            }}
                          >
                            Ouvrir dans VS Code
                          </MenuItem>
                          <MenuItem
                            icon={Folder}
                            onClick={() => {
                              setOpenMenu(null);
                              handleOpenExplorer(project.root);
                            }}
                          >
                            Ouvrir le dossier
                          </MenuItem>
                          <MenuItem
                            icon={Copy}
                            onClick={() => {
                              setOpenMenu(null);
                              handleCopyPath(project.root);
                            }}
                          >
                            Copier le chemin
                          </MenuItem>
                          <MenuItem
                            icon={FileText}
                            onClick={() => {
                              setOpenMenu(null);
                              onOpenEnvModal(project.root);
                            }}
                          >
                            Variables .env
                          </MenuItem>
                          {(project.url || (servers[0] && (servers[0].url || servers[0].port > 0))) && (
                            <MenuItem
                              icon={Monitor}
                              onClick={() => {
                                setOpenMenu(null);
                                const targetUrl = projectUrl(project);
                                const targetServer = servers.find((item) => item.state === 'running' && (item.url || item.port)) || servers.find((item) => item.url || item.port);
                                onOpenBrowser(targetServer?.id, targetUrl);
                              }}
                            >
                              Aperçu Web & Devices
                            </MenuItem>
                          )}
                          <MenuItem
                            icon={Edit3}
                            onClick={() => {
                              setOpenMenu(null);
                              onEditProject?.(project);
                            }}
                          >
                            Modifier le projet
                          </MenuItem>
                          <div className="my-1 border-t border-[var(--line)]" />
                          <MenuItem
                            icon={Trash2}
                            danger
                            onClick={() => {
                              setOpenMenu(null);
                              setConfirmDelete({
                                type: 'project',
                                projectId: project.id,
                                name: project.name,
                                serverCount: servers.length,
                              });
                            }}
                          >
                            Supprimer le projet
                          </MenuItem>
                        </FloatingMenu>
                      )}
                    </div>
                  </div>
                </div>

                {/* Serveurs : simples lignes sous un filet fin */}
                {!isCollapsed && (
                  <div className="mt-1 ml-[7px] pl-5 border-l border-[var(--line)]">
                    {servers.map((srv) => {
                      const isRunning = srv.state === 'running';
                      const isServerMenuOpen = openMenu?.type === 'server' && openMenu.id === srv.id;

                      return (
                        <div
                          key={srv.id}
                          data-server-id={srv.id}
                          className={`group/row flex items-center justify-between gap-3 h-11 px-3 -ml-1 rounded-lg transition-colors ${
                            isServerMenuOpen ? 'bg-white/[0.04] relative z-40' : 'hover:bg-white/[0.03]'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <span
                              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                isRunning ? 'bg-emerald-400 live-dot' : 'bg-zinc-700'
                              }`}
                            />
                            <div className="min-w-0">
                              <span className="text-[13px] text-zinc-100 truncate block">{srv.name}</span>
                              {srv.lastExitReason && <button className="server-exit-note" title={srv.lastExitReason}
                                onClick={() => onOpenTerminal(srv.id, srv.name)}>
                                <AlertTriangle size={11} /> Arrêt inattendu · Voir les logs
                              </button>}
                            </div>
                            <span
                              className="text-xs font-mono text-zinc-600 truncate hidden md:block"
                              title={srv.command}
                            >
                              {srv.command}
                            </span>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {srv.port > 0 && (
                              <span className="text-xs font-mono text-zinc-500 mr-2">:{srv.port}</span>
                            )}
                            {isRunning && (
                              <span className="text-xs font-mono text-zinc-500 mr-2">
                                <ServerUptimeBadge serverId={srv.id} isRunning={isRunning} />
                              </span>
                            )}

                            {srv.port > 0 && isRunning && (
                              <IconBtn
                                title={`Ouvrir http://localhost:${srv.port}`}
                                onClick={() => handleOpenBrowser(`http://localhost:${srv.port}`)}
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </IconBtn>
                            )}
                            <IconBtn title="Logs" onClick={() => onOpenTerminal(srv.id, srv.name)}>
                              <Terminal className="w-3.5 h-3.5" />
                            </IconBtn>

                            <ServerControls project={project} server={srv} compact />

                            <div className="relative" data-dropdown-container>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenMenu((prev) =>
                                    prev?.type === 'server' && prev?.id === srv.id
                                      ? null
                                      : { type: 'server', id: srv.id }
                                  );
                                }}
                                className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors cursor-pointer ${
                                  isServerMenuOpen
                                    ? 'bg-white/[0.08] text-white'
                                    : 'text-zinc-500 hover:text-white hover:bg-white/[0.06] opacity-0 group-hover/row:opacity-100'
                                }`}
                                title="Options du serveur"
                                aria-label="Options du serveur"
                              >
                                <MoreHorizontal className="w-3.5 h-3.5" />
                              </button>

                              {isServerMenuOpen && (
                                <FloatingMenu width={208} className="rounded-lg p-1 text-xs">
                                  {(srv.url || srv.port > 0) && (
                                    <MenuItem
                                      icon={Monitor}
                                      onClick={() => {
                                        setOpenMenu(null);
                                        const targetUrl = srv.url || `http://localhost:${srv.port}`;
                                        onOpenBrowser(srv.id, targetUrl);
                                      }}
                                    >
                                      Aperçu Web & Devices
                                    </MenuItem>
                                  )}
                                  {srv.port > 0 && (
                                    <MenuItem
                                      icon={Globe}
                                      onClick={() => {
                                        setOpenMenu(null);
                                        handleShareTunnel(srv.port, srv.name);
                                      }}
                                    >
                                      Créer un tunnel public
                                    </MenuItem>
                                  )}
                                  <MenuItem
                                    icon={Edit3}
                                    onClick={() => {
                                      setOpenMenu(null);
                                      onEditServer?.({ projectId: project.id, project, server: srv });
                                    }}
                                  >
                                    Modifier le serveur
                                  </MenuItem>
                                  <div className="my-1 border-t border-[var(--line)]" />
                                  <MenuItem
                                    icon={Trash2}
                                    danger
                                    onClick={() => {
                                      setOpenMenu(null);
                                      setConfirmDelete({
                                        type: 'server',
                                        projectId: project.id,
                                        serverId: srv.id,
                                        name: srv.name,
                                        projectName: project.name,
                                      });
                                    }}
                                  >
                                    Supprimer le serveur
                                  </MenuItem>
                                </FloatingMenu>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    <button
                      onClick={() => onAddServer && onAddServer(project)}
                      className="h-9 px-3 -ml-1 flex items-center gap-2 rounded-lg text-xs text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.03] transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Ajouter un serveur</span>
                    </button>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title={confirmDeleteTarget.type === 'server' ? 'Supprimer ce serveur ?' : 'Supprimer ce projet ?'}
        message={confirmDeleteMessage}
        confirmLabel="Supprimer définitivement"
        danger
        onConfirm={executeConfirmedDelete}
        onCancel={() => setConfirmDelete(null)}
      />

      <ConfirmDialog
        open={!!confirmStopProject}
        title="Arrêter les serveurs de ce projet ?"
        message={(() => {
          const count = (confirmStopProject?.servers || []).filter((server) => server.state === 'running').length;
          return `${count} serveur${count > 1 ? 's' : ''} en cours dans « ${confirmStopProject?.name ?? ''} » ${count > 1 ? 'seront arrêtés' : 'sera arrêté'}. Les autres projets ne sont pas touchés.`;
        })()}
        confirmLabel="Arrêter les serveurs"
        danger
        onConfirm={executeStopProject}
        onCancel={() => setConfirmStopProject(null)}
      />
    </div>
  );
}
