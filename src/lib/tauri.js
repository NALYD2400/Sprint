export function isTauriEnv() {
  return typeof window !== 'undefined' && (!!window.__TAURI_INTERNALS__ || !!window.__TAURI__);
}

/** Abonnement no-op hors webview Tauri, pour ne pas appeler l'IPC avant qu'elle existe. */
export function subscribeTauri(name, handler) {
  if (!isTauriEnv()) return Promise.resolve(() => {});
  return import('@tauri-apps/api/event').then(({ listen }) => listen(name, handler));
}
