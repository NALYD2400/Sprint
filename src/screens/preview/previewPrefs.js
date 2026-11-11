const KEY = 'sprint_preview_prefs';
const MODES = new Set(['desktop', 'tablet', 'mobile', 'dual', 'custom']);
const dimension = (value, min, max, fallback) => Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

export function loadPreviewPrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    let url = '';
    try {
      const target = new URL(saved.url);
      if (['http:', 'https:'].includes(target.protocol)) url = target.href;
    } catch { /* An obsolete or invalid URL is ignored. */ }
    return {
      serverId: typeof saved.serverId === 'string' ? saved.serverId : null,
      url, mode: MODES.has(saved.mode) ? saved.mode : 'desktop',
      width: dimension(saved.width, 240, 3840, 1280),
      height: dimension(saved.height, 240, 2160, 800), fit: saved.fit !== false,
    };
  } catch {
    return { serverId: null, url: '', mode: 'desktop', width: 1280, height: 800, fit: true };
  }
}

export function savePreviewPrefs(prefs) {
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* Session remains usable without storage. */ }
}
