import { readStoredSetting } from '../services/settingsStorage';
import { useEffect, useRef, useState } from 'react';
import { triggerToast } from '../services/toastBus';
import { isManualStop, unmarkManualStop } from '../services/serverLifecycle';
import { startServer } from '../services/serverActions';
export { markManualStop, unmarkManualStop } from '../services/serverLifecycle';

const isTauriEnv = () =>
  typeof window !== 'undefined' && (!!window.__TAURI_INTERNALS__ || !!window.__TAURI__);

const MAX_LOG_LINES = 2000;
const LOG_BATCH_MS = 100;

// ---------------------------------------------------------------------------
// Cache global de logs : les lignes sont pré-parsées une seule fois à l'arrivée
// (regex ANSI + détection error/success/info), puis regroupées par lot de ~100ms
// pour éviter un re-render complet par ligne reçue.
// ---------------------------------------------------------------------------

let logSeq = 0;
const globalLogCache = {};
const logListeners = new Map();
const pendingLines = new Map();
let flushScheduled = false;

export function parseLogLine(rawText) {
  if (!rawText) {
    return { clean: '', isError: false, isSuccess: false, isInfo: false };
  }
  // eslint-disable-next-line no-control-regex
  const clean = rawText.replace(/\x1B(?:\[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
  const lower = clean.toLowerCase();

  return {
    clean,
    isError: lower.includes('error') || lower.includes('failed') || lower.includes('uncaught'),
    isSuccess:
      lower.includes('ready in') || lower.includes('success') || lower.includes('finished'),
    isInfo: lower.includes('vite') || lower.includes('tauri') || lower.includes('running'),
  };
}

function ensureCache(serverId) {
  if (!globalLogCache[serverId]) globalLogCache[serverId] = [];
  return globalLogCache[serverId];
}

function flushLogs() {
  flushScheduled = false;
  for (const [serverId, lines] of pendingLines) {
    pendingLines.delete(serverId);
    const cache = ensureCache(serverId);
    for (const line of lines) {
      const meta = parseLogLine(line);
      cache.push({ id: ++logSeq, raw: line, ...meta });
    }
    if (cache.length > MAX_LOG_LINES) {
      cache.splice(0, cache.length - MAX_LOG_LINES);
    }
    const listeners = logListeners.get(serverId);
    if (listeners) {
      for (const fn of listeners) {
        fn([...cache]);
      }
    }
  }
}

if (isTauriEnv()) {
  import('@tauri-apps/api/event')
    .then(({ listen }) => {
      listen('server-log-line', (event) => {
        const { server_id, line } = event.payload;
        if (!server_id || line === undefined) return;

        let batch = pendingLines.get(server_id);
        if (!batch) {
          batch = [];
          pendingLines.set(server_id, batch);
        }
        batch.push(line);

        if (!flushScheduled) {
          flushScheduled = true;
          setTimeout(flushLogs, LOG_BATCH_MS);
        }
      });
    })
    .catch(() => {});
}

export function useServerLogs(serverId) {
  const [logs, setLogs] = useState(() =>
    serverId && globalLogCache[serverId] ? [...globalLogCache[serverId]] : [],
  );

  useEffect(() => {
    if (!serverId) {
      setLogs([]);
      return undefined;
    }

    setLogs(globalLogCache[serverId] ? [...globalLogCache[serverId]] : []);

    const onBatch = (snapshot) => setLogs(snapshot);

    let listeners = logListeners.get(serverId);
    if (!listeners) {
      listeners = new Set();
      logListeners.set(serverId, listeners);
    }
    listeners.add(onBatch);

    return () => {
      listeners.delete(onBatch);
      if (!listeners.size) logListeners.delete(serverId);
    };
  }, [serverId]);

  const clearLogs = () => {
    if (serverId) {
      globalLogCache[serverId] = [];
      pendingLines.delete(serverId);
      logListeners.get(serverId)?.forEach(listener => listener([]));
    }
    setLogs([]);
  };

  return { logs, clearLogs };
}

// ---------------------------------------------------------------------------
// Arrêts volontaires vs crashs : le module garde la liste des serveurs arrêtés
// manuellement pour que l'auto-restart ne s'applique qu'aux vrais crashs.
// ---------------------------------------------------------------------------

export function useProjects() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const projectsRef = useRef(projects);

  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  const fetchProjects = async () => {
    try {
      if (isTauriEnv()) {
        const { invoke } = await import('@tauri-apps/api/core');
        const res = await invoke('get_projects_cmd');
        setProjects(res || []);
      }
    } catch (e) {
      console.warn('Failed to load projects:', e.message);
    } finally {
      setLoading(false);
    }
  };

  const saveProjects = async (updatedProjects) => {
    try {
      if (isTauriEnv()) {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('save_projects_cmd', { projects: updatedProjects });
      }
      setProjects(updatedProjects.map(project => ({ ...project, servers: (project.servers || []).map(server => {
        const live = projectsRef.current.flatMap(item => item.servers || []).find(item => item.id === server.id);
        return live ? { ...server, state: live.state, pid: live.pid, lastExitReason: live.lastExitReason } : server;
      }) })));
      return true;
    } catch (e) {
      triggerToast({ title: 'Projets non enregistrés', message: String(e), type: 'error' });
      return false;
    }
  };

  useEffect(() => {
    fetchProjects();

    if (!isTauriEnv()) return undefined;

    // Garde-fou anti crash-loop : max 3 relances par serveur sur 2 minutes.
    const restartTimestamps = new Map();
    const restartTimers = new Map();
    let disposed = false;

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
        let found = null;
        for (const p of projectsRef.current) {
          for (const s of p.servers || []) {
            if (s.id === serverId) {
              found = { project: p, server: s };
              break;
            }
          }
          if (found) break;
        }
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

    let unlistenFn = null;
    import('@tauri-apps/api/event')
      .then(({ listen }) => {
        listen('server-status-changed', (event) => {
          if (disposed) return;
          const { server_id, state, pid, intentional, exit_code, exit_error } = event.payload;
          if (state === 'running' || intentional) {
            clearTimeout(restartTimers.get(server_id));
            restartTimers.delete(server_id);
          }

          const wasRunning = projectsRef.current.some((p) =>
            (p.servers || []).some((s) => s.id === server_id && s.state === 'running'),
          );
          const unexpected = state === 'stopped' && wasRunning && !intentional && !isManualStop(server_id);
          const exitReason = unexpected && (exit_code != null || exit_error)
            ? exit_error || 'Code de sortie ' + exit_code : null;

          const next = projectsRef.current.map((p) => ({
            ...p,
            servers: (p.servers || []).map((s) =>
              s.id === server_id ? { ...s, state, pid: pid ?? null,
                lastExitReason: state === 'running' || intentional ? null : exitReason || s.lastExitReason || null } : s,
            ),
          }));
          projectsRef.current = next;
          setProjects(next);

          // Auto-restart anti-crash : seulement si le serveur tournait, n'a pas
          // été arrêté manuellement, et que l'option est activée dans les réglages.
          if (unexpected) {
            if (exitReason) {
              const name = projectsRef.current.flatMap((project) => project.servers || []).find((server) => server.id === server_id)?.name || 'Le serveur';
              triggerToast({ title: 'Arrêt inattendu', message: name + ' · ' + exitReason + '. Consultez les logs.', type: 'error' });
            }
            if (readStoredSetting('auto_restart') === 'true') {
              scheduleAutoRestart(server_id);
            }
          }
          unmarkManualStop(server_id);
        }).then((fn) => {
          if (disposed) fn();
          else unlistenFn = fn;
        });
      })
      .catch(() => {});

    return () => {
      disposed = true;
      restartTimers.forEach(clearTimeout);
      if (unlistenFn) unlistenFn();
    };
  }, []);

  return {
    projects,
    saveProjects,
    reload: fetchProjects,
    loading,
  };
}

export function useSystemMetrics() {
  const [metrics, setMetrics] = useState({
    cpu_usage: 0,
    ram_total_mb: 0,
    ram_used_mb: 0,
    managed_cpu_pct: 0,
    managed_ram_mb: 0,
    active_servers_count: 0,
    server_metrics: {},
  });
  const [history, setHistory] = useState([]);

  useEffect(() => {
    if (!isTauriEnv()) return undefined;
    let unlistenFn = null;
    let disposed = false;
    import('@tauri-apps/api/event')
      .then(({ listen }) => {
        listen('system-metrics', (event) => {
          if (disposed) return;
          setMetrics(event.payload);
          const { cpu_usage, ram_used_mb, managed_cpu_pct, managed_ram_mb } = event.payload;
          const sample = {
            cpu_usage,
            ram_used_mb,
            managed_cpu_pct,
            managed_ram_mb,
            timestamp: Date.now(),
          };
          setHistory((previous) =>
            [
              ...previous.filter((point) => point.timestamp >= sample.timestamp - 900000),
              sample,
            ].slice(-1000),
          );
        }).then((fn) => {
          if (disposed) fn();
          else unlistenFn = fn;
        });
      })
      .catch(() => {});

    return () => {
      disposed = true;
      if (unlistenFn) unlistenFn();
    };
  }, []);

  return { ...metrics, history };
}
