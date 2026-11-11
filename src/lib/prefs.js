/**
 * Préférences d'interface (thème, taille du texte, animations, barre latérale).
 * Stockées dans localStorage, appliquées sur <html> via des attributs data-*
 * pour que tout le CSS puisse réagir sans re-render React.
 */

import { DEFAULT_DASHBOARD, dashboardPrefs } from './dashboardPrefs';
import { applyAccent } from './accent';
const KEY = 'sprint_ui_prefs';

export const TEXT_SIZES = [
  { id: 'sm', label: 'Compact', zoom: 0.92 },
  { id: 'md', label: 'Standard', zoom: 1 },
  { id: 'lg', label: 'Confortable', zoom: 1.12 },
  { id: 'xl', label: 'Très grand', zoom: 1.25 },
];

export const DEFAULT_PREFS = {
  theme: 'dark',
  textSize: 'md',
  reduceMotion: 'system', // 'system' | 'on' | 'off'
  sidebarCollapsed: false,
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
      theme: saved?.theme === 'light' ? 'light' : 'dark',
      favoriteProjectIds: Array.isArray(saved?.favoriteProjectIds)
        ? [...new Set(saved.favoriteProjectIds.filter((id) => typeof id === 'string'))]
        : [],
      dashboard: dashboardPrefs(saved?.dashboard),
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // stockage indisponible : les préférences restent valables pour la session
  }
}

export function resolveTheme(theme) {
  return theme === 'light' ? 'light' : 'dark';
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

let themeTransition;
let themeSequence = 0;
let themeFallbackTimer;

function applyTheme(nextTheme, reduced) {
  const root = document.documentElement;
  const sequence = ++themeSequence;
  themeTransition?.skipTransition();
  clearTimeout(themeFallbackTimer);
  root.classList.remove('theme-changing');

  const update = () => {
    if (sequence !== themeSequence) return;
    root.dataset.theme = nextTheme;
    applyAccent();
  };
  if (!root.dataset.theme || root.dataset.theme === nextTheme || reduced) {
    update();
    return;
  }

  if (typeof document.startViewTransition === 'function') {
    const transition = document.startViewTransition(update);
    themeTransition = transition;
    transition.finished.catch(() => {}).finally(() => {
      if (themeTransition === transition) themeTransition = undefined;
    });
  } else {
    root.classList.add('theme-changing');
    update();
    themeFallbackTimer = setTimeout(() => root.classList.remove('theme-changing'), 650);
  }
}

export function applyPrefs(prefs) {
  const root = document.documentElement;
  const reduced = prefs.reduceMotion === 'on';
  root.dataset.motion = reduced ? 'reduce' : 'full';
  applyTheme(resolveTheme(prefs.theme), reduced);
  const size = TEXT_SIZES.find((s) => s.id === prefs.textSize) || TEXT_SIZES[1];
  applyZoom(size.zoom);
}
