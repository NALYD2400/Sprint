import { useEffect, useRef, useState } from 'react';
import { readStoredSetting } from '../lib/settingsStorage';
import { triggerToast } from '../lib/toastBus';
import { isManualStop, unmarkManualStop } from '../lib/serverLifecycle';
import { startServer } from '../lib/serverActions';
import { isTauriEnv, subscribeTauri } from '../lib/tauri';
import { applyProjectChange } from '../lib/projectChanges';

function findServer(projects, serverId) {
  for (const project of projects) {
    for (const server of project.servers || []) {
      if (server.id === serverId) return { project, server };
    }
  }
  return null;
}

export function useProjects() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const projectsRef = useRef(projects);
  const catalogQueue = useRef(Promise.resolve());
  const statusRevision = useRef(0);
  const serverStatusRevisions = useRef(new Map());

  const enqueue = (work) => {
    const pending = catalogQueue.current.then(work);
    catalogQueue.current = pending.catch(() => {});
    return pending;
  };

  const replaceProjects = (snapshot, previousStatusRevision) => {
    const liveServers = new Map(projectsRef.current.flatMap(project => project.servers || [])
      .map(server => [server.id, server]));
    const next = snapshot.map(project => ({
      ...project,
      servers: (project.servers || []).map(server => {
        const live = liveServers.get(server.id);
        if (!live) return server;
        const statusChanged = serverStatusRevisions.current.get(server.id) > previousStatusRevision;
        if (!statusChanged && live.state !== server.state) return server;
        return { ...server, state: live.state, pid: live.pid, lastExitReason: live.lastExitReason };
      }),
    }));
    projectsRef.current = next;
    setProjects(next);
  };

  const fetchProjects = () => enqueue(async () => {
    const previousStatusRevision = statusRevision.current;
    try {
      if (isTauriEnv()) {
        const { invoke } = await import('@tauri-apps/api/core');
        const res = await invoke('get_projects_cmd');
        replaceProjects(res || [], previousStatusRevision);
      }
    } catch (e) {
      console.warn('Failed to load projects:', e.message);
    } finally {
      setLoading(false);
    }
  });

  const saveProjectChange = (change) => enqueue(async () => {
    const previousStatusRevision = statusRevision.current;
    try {
      let updatedProjects;
      if (isTauriEnv()) {
        const { invoke } = await import('@tauri-apps/api/core');
        updatedProjects = await invoke('change_projects_cmd', { change });
      } else {
        updatedProjects = applyProjectChange(projectsRef.current, change);
      }
      replaceProjects(updatedProjects, previousStatusRevision);
      return true;
    } catch (e) {
      triggerToast({ title: 'Projets non enregistrés', message: String(e), type: 'error' });
      return false;
    }
  });

  useEffect(() => {
    fetchProjects();
    if (!isTauriEnv()) return undefined;
    window.addEventListener('focus', fetchProjects);

    const restartTimestamps = new Map();
    const restartTimers = new Map();
    let disposed = false;
    const unlisteners = [];

    const scheduleAutoRestart = (serverId) => {
      if (restartTimers.has(serverId)) return;
      const now = Date.now();
      const recent = (restartTimestamps.get(serverId) || []).filter((t) => now - t < 120_000);
      if (recent.length >= 3) {
        restartTimestamps.set(serverId, recent);
        return;
      }
      recent.push(now);
      restartTimestamps.set(serverId, recent);

      restartTimers.set(serverId, setTimeout(async () => {
        restartTimers.delete(serverId);
        if (disposed || isManualStop(serverId) || readStoredSetting('auto_restart') !== 'true') return;
        const found = findServer(projectsRef.current, serverId);
        if (!found || found.server.state === 'running') return;

        try {
          if (!await startServer(found.project, found.server)) return;
          triggerToast({
            title: '🔄 Auto-Restart Anti-Crash',
            message: `${found.server.name} s'est arrêté brutalement et a été relancé automatiquement.`,
            type: 'warning',
          });
        } catch (e) {
          triggerToast({
            title: '⚠️ Auto-Restart Échoué',
            message: `Impossible de relancer ${found.server.name}: ${String(e)}`,
            type: 'error',
          });
        }
      }, 1500));
    };

    const track = (promise) => {
      promise.then((unsubscribe) => {
        if (disposed) unsubscribe();
        else unlisteners.push(unsubscribe);
      }).catch((error) => console.warn('Abonnement Tauri impossible:', error));
    };

    track(subscribeTauri('server-guard-restart', (event) => {
      if (disposed) return;
      const { server_id, ram_mb, limit_mb } = event.payload || {};
      const found = findServer(projectsRef.current, server_id);
      const name = found?.server.name || 'Un serveur';
      const used = Math.round(ram_mb || 0);
      triggerToast({
        title: 'Limite mémoire',
        message: `${name} utilisait ${used} Mo (limite ${limit_mb} Mo) et a été relancé.`,
        type: 'warning',
      });
    }));

    track(subscribeTauri('server-status-changed', (event) => {
      if (disposed) return;
      const { server_id, state, pid, intentional, exit_code, exit_error } = event.payload;
      serverStatusRevisions.current.set(server_id, ++statusRevision.current);
      if (state === 'running' || intentional) {
        clearTimeout(restartTimers.get(server_id));
        restartTimers.delete(server_id);
      }

      const wasRunning = projectsRef.current.some((project) =>
        (project.servers || []).some((server) => server.id === server_id && server.state === 'running'),
      );
      const unexpected = state === 'stopped' && wasRunning && !intentional && !isManualStop(server_id);
      const exitReason = unexpected && (exit_code != null || exit_error)
        ? exit_error || `Code de sortie ${exit_code}`
        : null;

      const next = projectsRef.current.map((project) => ({
        ...project,
        servers: (project.servers || []).map((server) =>
          server.id === server_id
            ? {
                ...server,
                state,
                pid: pid ?? null,
                lastExitReason: state === 'running' || intentional
                  ? null
                  : exitReason || server.lastExitReason || null,
              }
            : server,
        ),
      }));
      projectsRef.current = next;
      setProjects(next);

      if (unexpected) {
        if (exitReason) {
          const name = findServer(projectsRef.current, server_id)?.server.name || 'Le serveur';
          triggerToast({
            title: 'Arrêt inattendu',
            message: `${name} · ${exitReason}. Consultez les logs.`,
            type: 'error',
          });
        }
        if (readStoredSetting('auto_restart') === 'true') scheduleAutoRestart(server_id);
      }
      unmarkManualStop(server_id);
    }));

    return () => {
      disposed = true;
      window.removeEventListener('focus', fetchProjects);
      restartTimers.forEach(clearTimeout);
      unlisteners.forEach((unsubscribe) => unsubscribe());
    };
  }, []);

  return { projects, saveProjectChange, reload: fetchProjects, loading };
}
