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
  for (const [serverId, batch] of pendingLines) {
    pendingLines.delete(serverId);
    const cache = ensureCache(serverId);
    // Earlier lines in a single burst would be evicted by the history limit
    // anyway; avoid parsing and allocating entries that cannot be retained.
    logSeq += Math.max(0, batch.total - MAX_LOG_LINES);
    const count = Math.min(batch.total, MAX_LOG_LINES);
    const start = batch.total > MAX_LOG_LINES ? batch.total % MAX_LOG_LINES : 0;
    for (let index = 0; index < count; index++) {
      const line = batch.lines[(start + index) % MAX_LOG_LINES];
      const meta = parseLogLine(line);
      cache.push({ id: ++logSeq, raw: line, ...meta });
    }
    if (cache.length > MAX_LOG_LINES) {
      cache.splice(0, cache.length - MAX_LOG_LINES);
    }
    const listeners = logListeners.get(serverId);
    if (listeners?.size) {
      const snapshot = [...cache];
      for (const fn of listeners) fn(snapshot);
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
          batch = { lines: [], total: 0 };
          pendingLines.set(server_id, batch);
        }
        // A bounded ring keeps bursts from allocating an unbounded pending queue.
        batch.lines[batch.total % MAX_LOG_LINES] = line;
        batch.total++;

        if (!flushScheduled) {
          flushScheduled = true;
          setTimeout(flushLogs, LOG_BATCH_MS);
        }
      });
    })
    .catch(() => {});
}
