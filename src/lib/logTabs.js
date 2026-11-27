const OPEN_KEY = 'sprint_logs_open_tabs';
const DISMISSED_KEY = 'sprint_logs_dismissed_tabs';
const ACTIVE_KEY = 'sprint_logs_active_tab';
const SPLIT_KEY = 'sprint_logs_split_tab';
const SPLIT_MODE_KEY = 'sprint_logs_split_mode';

function readJson(key, fallback) {
  try {
    const raw = sessionStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Keep the current session usable. */
  }
}

export function readOpenLogIds() {
  const saved = readJson(OPEN_KEY, null);
  return Array.isArray(saved) ? saved.filter((id) => typeof id === 'string') : [];
}

export function saveOpenLogIds(ids) {
  writeJson(OPEN_KEY, ids);
}

export function readDismissedLogIds() {
  const saved = readJson(DISMISSED_KEY, []);
  return new Set(Array.isArray(saved) ? saved.filter((id) => typeof id === 'string') : []);
}

export function saveDismissedLogIds(ids) {
  writeJson(DISMISSED_KEY, [...ids]);
}

export function readActiveLogId() {
  const saved = readJson(ACTIVE_KEY, null);
  return typeof saved === 'string' ? saved : null;
}

export function saveActiveLogId(id) {
  writeJson(ACTIVE_KEY, id || null);
}

export function readSplitLogId() {
  const saved = readJson(SPLIT_KEY, null);
  return typeof saved === 'string' ? saved : null;
}

export function saveSplitLogId(id) {
  writeJson(SPLIT_KEY, id || null);
}

export function readLogSplitMode() {
  return readJson(SPLIT_MODE_KEY, false) === true;
}

export function saveLogSplitMode(enabled) {
  writeJson(SPLIT_MODE_KEY, !!enabled);
}

export function isServerLive(server) {
  return server?.state === 'running' || server?.state === 'starting';
}

export function serverStatusTone(server) {
  if (server?.state === 'running') return 'running';
  if (server?.state === 'starting') return 'starting';
  if (server?.state === 'error' || server?.lastExitReason) return 'error';
  return 'stopped';
}

export function serverStatusLabel(server, pending = false) {
  if (pending || server?.state === 'starting') return 'Démarrage…';
  if (server?.state === 'running') return 'En cours';
  if (server?.state === 'error' || server?.lastExitReason) return 'Erreur';
  return 'Arrêté';
}

export function syncLogTabs(openIds, servers, dismissed) {
  const available = new Set(servers.map((server) => server.id));
  const result = openIds.filter((id) => available.has(id));
  for (const server of servers) {
    if (isServerLive(server) && !dismissed.has(server.id) && !result.includes(server.id)) {
      result.push(server.id);
    }
  }
  return result;
}
