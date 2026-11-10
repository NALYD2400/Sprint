// Keep both generations of preference keys in sync during the Portly → Sprint migration.
const KEYS = {
  custom_hex: 'custom_hex',
  canvas_bg: 'cfg_canvas',
  auto_restart: 'cfg_autorestart',
  hide_stopped_servers: 'cfg_hidestopped',
  clean_ansi_logs: 'cfg_cleanansi',
  minimize_to_tray: 'cfg_minimizetotray',
  notif_windows: 'cfg_notif_windows',
  notif_app: 'cfg_notif_app',
  global_shortcut: 'cfg_shortcut',
};

export const DEFAULT_SETTINGS = {
  custom_hex: '#a855f7',
  canvas_bg: true,
  auto_restart: false,
  hide_stopped_servers: true,
  clean_ansi_logs: true,
  minimize_to_tray: true,
  notif_windows: true,
  notif_app: true,
  global_shortcut: 'Ctrl+Alt+P',
  autostart: false,
};

export function readStoredSetting(field, fallback = null) {
  const suffix = KEYS[field];
  if (!suffix) throw new Error('Réglage inconnu : ' + field);
  return localStorage.getItem('sprint_' + suffix) ?? localStorage.getItem('portly_' + suffix) ?? fallback;
}

export function writeStoredSetting(field, value) {
  const suffix = KEYS[field];
  if (!suffix) throw new Error('Réglage inconnu : ' + field);
  for (const prefix of ['portly', 'sprint']) localStorage.setItem(prefix + '_' + suffix, String(value));
}

export function loadStoredSettings() {
  const settings = { ...DEFAULT_SETTINGS };
  for (const field of Object.keys(KEYS)) {
    const fallback = DEFAULT_SETTINGS[field];
    const value = readStoredSetting(field, String(fallback));
    if (typeof fallback === 'boolean') {
      settings[field] = fallback ? value !== 'false' : value === 'true';
    } else {
      settings[field] = value;
    }
  }
  return settings;
}

export function syncStoredSettings(settings) {
  for (const field of Object.keys(KEYS)) {
    if (settings[field] === undefined) continue;
    writeStoredSetting(field, settings[field]);
  }
  window.dispatchEvent(new Event('sprint_canvas_toggle'));
}
