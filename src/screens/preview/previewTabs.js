const DISMISSED_KEY = 'sprint_preview_dismissed_tabs';
const OPEN_KEY = 'sprint_preview_open_tabs';

export function readDismissedTabs() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(DISMISSED_KEY) || '[]');
    return new Set(Array.isArray(saved) ? saved.filter((id) => typeof id === 'string') : []);
  } catch { return new Set(); }
}

export function saveDismissedTabs(ids) {
  try { sessionStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids])); } catch { /* Keep the current session usable. */ }
}

export function syncPreviewTabs(openIds, servers, dismissed) {
  const available = new Set(servers.map((server) => server.id));
  const result = openIds.filter((id) => available.has(id));
  for (const server of servers) {
    if (server.state === 'running' && !dismissed.has(server.id) && !result.includes(server.id)) result.push(server.id);
  }
  return result;
}

export function readOpenTabs() {
  try {
    const raw = sessionStorage.getItem(OPEN_KEY);
    if (raw == null) return null;
    const saved = JSON.parse(raw);
    return Array.isArray(saved) ? saved.filter((id) => typeof id === 'string') : [];
  } catch { return null; }
}

export function saveOpenTabs(ids) {
  try { sessionStorage.setItem(OPEN_KEY, JSON.stringify(ids)); } catch { /* Keep the current session usable. */ }
}

export function initialPreviewSelection(servers, { initialServerId = null, savedServerId = null, savedOpenIds = null, dismissed = new Set() } = {}) {
  const seed = [];
  const push = (id) => { if (id && !seed.includes(id)) seed.push(id); };
  if (initialServerId) push(initialServerId);
  if (Array.isArray(savedOpenIds)) savedOpenIds.forEach(push);
  const openIds = syncPreviewTabs(seed, servers, dismissed);
  const serverId = [initialServerId, savedServerId, ...openIds].find((id) => id && openIds.includes(id)) || null;
  return { serverId, openIds };
}
