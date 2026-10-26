import { readStoredSetting } from './settingsStorage';
/**
 * Préférences d'interface (thème, taille du texte, animations, barre latérale).
 * Stockées dans localStorage, appliquées sur <html> via des attributs data-*
 * pour que tout le CSS puisse réagir sans re-render React.
 */

import { DEFAULT_DASHBOARD, dashboardPrefs } from './dashboardPrefs';
import { applyAccent } from './accent';
const KEY = 'sprint_ui_prefs';

export const THEMES = [
  { id: 'system', label: 'Automatique' },
  { id: 'dark', label: 'Sombre' },
  { id: 'light', label: 'Clair' },
];

export const TEXT_SIZES = [
  { id: 'sm', label: 'Compact', zoom: 0.92 },
  { id: 'md', label: 'Standard', zoom: 1 },
  { id: 'lg', label: 'Confortable', zoom: 1.12 },
  { id: 'xl', label: 'Très grand', zoom: 1.25 },
];

export const DEFAULT_PREFS = {
  theme: 'system',
  textSize: 'md',
  reduceMotion: 'system', // 'system' | 'on' | 'off'
  backgroundIntensity: 30,
  backgroundBlur: 30,
  backgroundSpeed: 100,
  sidebarCollapsed: false,
  onboardingDismissed: false,
  favoriteProjectIds: [],
  dashboard: DEFAULT_DASHBOARD,
};

export function loadPrefs() {
  try {
    const raw = localStorage.getItem(KEY);
    const saved = raw ? JSON.parse(raw) : {};
    return {
      ...DEFAULT_PREFS,
      ...saved,
      ...backgroundPrefs(saved),
      favoriteProjectIds: Array.isArray(saved?.favoriteProjectIds)
        ? [...new Set(saved.favoriteProjectIds.filter((id) => typeof id === 'string'))]
        : [],
      dashboard: dashboardPrefs(saved?.dashboard),
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function backgroundPrefs(prefs = {}) {
  const ranges = { backgroundIntensity: 100, backgroundBlur: 60, backgroundSpeed: 200 };
  return Object.fromEntries(Object.entries(ranges).map(([key, max]) => [
    key,
    Number.isFinite(prefs?.[key])
      ? Math.min(max, Math.max(0, prefs[key]))
      : DEFAULT_PREFS[key],
  ]));
}

export function savePrefs(prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // stockage indisponible : les préférences restent valables pour la session
  }
}

function systemPrefersLight() {
  return (
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches
  );
}

export function resolveTheme(theme) {
  if (theme === 'light' || theme === 'dark') return theme;
  return systemPrefersLight() ? 'light' : 'dark';
}

async function applyZoom(zoom) {
  const isTauri = typeof window !== 'undefined' && (window.__TAURI_INTERNALS__ || window.__TAURI__);
  if (isTauri) {
    try {
      const { getCurrentWebview } = await import('@tauri-apps/api/webview');
      await getCurrentWebview().setZoom(zoom);
      document.documentElement.style.zoom = '';
      return;
    } catch {
      // permission absente : repli sur le zoom CSS ci-dessous
    }
  }
  document.documentElement.style.zoom = zoom === 1 ? '' : String(zoom);
}

export function applyPrefs(prefs) {
  const root = document.documentElement;
  root.dataset.theme = resolveTheme(prefs.theme);
  applyAccent(
    root.style.getPropertyValue('--accent-color') ||
      readStoredSetting('custom_hex') ||
      '#8b5cf6',
  );
  root.dataset.motion =
    prefs.reduceMotion === 'on'
      ? 'reduce'
      : prefs.reduceMotion === 'off'
        ? 'full'
        : window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
          ? 'reduce'
          : 'full';
  const size = TEXT_SIZES.find((s) => s.id === prefs.textSize) || TEXT_SIZES[1];
  applyZoom(size.zoom);
}
