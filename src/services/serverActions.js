import { invoke } from '@tauri-apps/api/core';
import { triggerToast } from './toastBus';
import { markManualStop, unmarkManualStop } from './serverLifecycle';
import { getServerOperation, withServerOperation } from './serverOperations';

const startCommand = (project, server) => invoke('start_server_cmd', {
  serverId: server.id, cwd: project.root, command: server.command, env: server.env || {},
});

async function stopCommand(server) {
  markManualStop(server.id);
  try {
    await invoke('stop_server_cmd', { serverId: server.id });
  } catch (error) {
    unmarkManualStop(server.id);
    if (!String(error).includes("n'est pas en cours")) throw error;
  }
}

export const startServer = (project, server) =>
  withServerOperation(server.id, 'start', () => startCommand(project, server));
export const stopServer = (server) =>
  withServerOperation(server.id, 'stop', () => stopCommand(server));
export const restartServer = (project, server) =>
  withServerOperation(server.id, 'restart', async () => {
    await stopCommand(server);
    await startCommand(project, server);
  });

export async function performServerAction(action, project, server, { silent = false } = {}) {
  try {
    const changed = await (action === 'start' ? startServer(project, server)
      : action === 'restart' ? restartServer(project, server) : stopServer(server));
    if (changed && !silent) triggerToast({
      title: action === 'stop' ? 'Serveur arrêté' : action === 'restart' ? 'Serveur redémarré' : 'Serveur démarré',
      message: server.name, type: 'success',
    });
    return changed;
  } catch (error) {
    triggerToast({ title: action === 'stop' ? 'Arrêt impossible' : action === 'restart' ? 'Redémarrage impossible' : 'Lancement impossible',
      message: String(error), type: 'error' });
    return false;
  }
}

/** Lance tous les serveurs arrêtés d'un projet. */
export async function startProject(project) {
  const todo = (project.servers || []).filter((s) => s.state !== 'running' && !getServerOperation(s.id));
  if (todo.length === 0) return;
  const results = await Promise.allSettled(
    todo.map((srv) => startServer(project, srv))
  );
  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length > 0) {
    triggerToast({
      title: 'Le lancement a échoué',
      message: String(failed[0].reason),
      type: 'error',
    });
  } else {
    triggerToast({
      title: `${project.name} est lancé`,
      message: todo.length > 1 ? `${todo.length} serveurs démarrés.` : 'Le serveur démarre…',
      type: 'success',
    });
  }
}

/** Arrête tous les serveurs en marche d'un projet. */
export async function stopProject(project, { silent = false } = {}) {
  const running = (project.servers || []).filter((s) => s.state === 'running');
  let failures = 0;
  for (const srv of running) {
    try {
      if (!await stopServer(srv)) failures++;
    } catch (e) {
      if (!String(e).includes("n'est pas en cours")) {
        failures++;
        triggerToast({ title: `Impossible d'arrêter ${srv.name}`, message: String(e), type: 'error' });
      }
    }
  }
  if (!silent && running.length > 0 && failures === 0) {
    triggerToast({ title: `${project.name} est arrêté`, message: 'Tout a été arrêté proprement.', type: 'info' });
  }
  return failures === 0;
}

export function openUrl(url) {
  return invoke('open_browser', { url }).catch((e) =>
    triggerToast({ title: "Impossible d'ouvrir le navigateur", message: String(e), type: 'error' })
  );
}

/** Première URL locale utilisable d'un projet (serveur en marche de préférence). */
export function projectUrl(project) {
  const servers = project.servers || [];
  const pick = servers.find((s) => s.state === 'running' && (s.url || s.port > 0)) || servers.find((s) => s.url || s.port > 0);
  if (project.url) return project.url;
  if (!pick) return null;
  return pick.url || `http://localhost:${pick.port}`;
}
