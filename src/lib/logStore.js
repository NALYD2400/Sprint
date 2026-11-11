import { isTauriEnv } from './tauri';

const MAX_LOG_LINES = 2000;
const LOG_BATCH_MS = 100;

let logSeq = 0;
const globalLogCache = {};
const logListeners = new Map();
const pendingLines = new Map();
let flushScheduled = false;

function parseLogLine(rawText) {
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
      for (const fn of listeners) fn([...cache]);
    }
  }
}

export function readLogs(serverId) {
  return serverId && globalLogCache[serverId] ? [...globalLogCache[serverId]] : [];
}

export function subscribeLogs(serverId, onBatch) {
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
}

export function clearLogCache(serverId) {
  if (!serverId) return;
  globalLogCache[serverId] = [];
  pendingLines.delete(serverId);
  logListeners.get(serverId)?.forEach((listener) => listener([]));
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
