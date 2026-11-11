const WINDOWS_PROCESSES = new Set([
  'system', 'registry', 'svchost', 'services', 'lsass', 'wininit', 'winlogon',
  'csrss', 'smss', 'spoolsv', 'audiodg', 'searchindexer', 'sihost', 'fontdrvhost',
]);

export function portCategory(entry, project) {
  if (project) return 'projects';
  const name = (entry.process_name || '').toLowerCase().replace(/\.exe$/, '');
  return WINDOWS_PROCESSES.has(name) || entry.pid === 4 ? 'windows' : 'applications';
}

export function portAccess(entry) {
  const value = entry.local_address || '';
  const host = value.startsWith('[') ? value.slice(1, value.indexOf(']'))
    : value.replace(new RegExp(':' + entry.port + '$'), '');
  const local = host === '::1' || host.startsWith('127.') || host === 'localhost';
  const any = host === '0.0.0.0' || host === '::';
  return {
    label: local ? 'Local uniquement' : any ? 'Toutes les interfaces' : 'Interface réseau',
    address: value,
    url: `http://${local || any || !host ? 'localhost' : host.includes(':') ? '[' + host + ']' : host}:${entry.port}`,
  };
}

export function projectWebUrl(project, entry) {
  if (!project || /(?:tauri|cargo)/i.test(project.command || '')) return null;
  if (project.url && /^https?:\/\//i.test(project.url)) return project.url;
  if (/(?:vite|next|nuxt|astro|webpack|serve|http|npm|pnpm|yarn|bun)/i.test(project.command || ''))
    return portAccess(entry).url;
  return null;
}
