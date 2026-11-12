const DISMISSED_KEY = 'sprint_preview_dismissed_tabs';

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
