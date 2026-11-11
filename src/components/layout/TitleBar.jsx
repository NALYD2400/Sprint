import { readStoredSetting } from '../../lib/settingsStorage';
import React, { useRef } from 'react';
import { Square, Minus, Sun, X, createLucideIcon } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import logo from '../../assets/navigation/logo.webp';

// Lucide 0.468.0 Moon (ISC), matching the icon used by Nivra.
const NivraMoon = createLucideIcon('Moon', [
  ['path', { d: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z', key: 'a7tn18' }],
]);

export default function TitleBar({ runningCount = 0, dark = true, onToggleTheme }) {
  const maximizePending = useRef(false);
  const getWin = async () => {
    try {
      if (typeof window !== 'undefined' && (window.__TAURI_INTERNALS__ || window.__TAURI__)) {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        return getCurrentWindow();
      }
    } catch (e) {
      console.warn('Failed to get Tauri window:', e);
    }
    return null;
  };

  const handleMinimize = async () => {
    try {
      const win = await getWin();
      if (win) await win.minimize();
    } catch {}
  };

  const handleMaximize = async () => {
    if (maximizePending.current) return;
    maximizePending.current = true;
    try {
      const win = await getWin();
      if (win) {
        const isMax = await win.isMaximized();
        if (isMax) {
          await win.unmaximize();
        } else {
          await win.maximize();
        }
      }
    } catch {
      // The native window may be closing while the action is pending.
    } finally {
      maximizePending.current = false;
    }
  };

  const handleClose = async () => {
    const minimizeToTray = readStoredSetting('minimize_to_tray') !== 'false';
    try {
      if (minimizeToTray) {
        // Masque dans le tray (réouverture via raccourci global ou icône tray)
        await invoke('hide_window_cmd');
      } else {
        // Fermeture complète : quitte et nettoie tous les process gérés
        await invoke('exit_app');
      }
    } catch {
      try {
        const win = await getWin();
        if (win && typeof win.hide === 'function') {
          await win.hide();
        }
      } catch {}
    }
  };

  const closeTitle =
    readStoredSetting('minimize_to_tray') !== 'false'
      ? 'Réduire dans la barre des tâches'
      : 'Quitter Sprint complètement';

  const ctl =
    'window-control';

  return (
    <div
      data-tauri-drag-region
      className="h-14 shrink-0 w-full flex items-center justify-between pl-2.5 select-none z-50 text-xs cursor-default"
    >
      <div data-tauri-drag-region className="flex items-center gap-3 min-w-0 pointer-events-none">
        <img
          src={logo}
          alt=""
          draggable="false"
          className="w-10 h-10"
        />
        <span className="sprint-wordmark">Sprint<span className="sprint-wordmark-dot">.</span></span>
        {runningCount > 0 && (
          <span className="flex items-center gap-1.5 text-[12px] text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 live-dot" />
            {runningCount} en marche
          </span>
        )}
      </div>

      <div
        className="window-controls"
        onPointerDown={(event) => {
          // Mouse actions should not leave a keyboard focus ring behind.
          if (event.button === 0 && event.target.closest('button')) event.preventDefault();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && event.target instanceof HTMLElement) {
            event.target.blur();
          }
        }}
      >
        <button
          type="button"
          onClick={onToggleTheme}
          aria-pressed={dark}
          aria-label={dark ? 'Passer en mode clair' : 'Passer en mode sombre'}
          title={dark ? 'Passer en mode clair' : 'Passer en mode sombre'}
          className={ctl}
        >
          {dark ? <Sun size={15} aria-hidden="true" /> : <NivraMoon size={15} aria-hidden="true" />}
        </button>
        <button type="button" onClick={handleMinimize} className={ctl} title="Réduire" aria-label="Réduire">
          <Minus className="w-[15px] h-[15px]" strokeWidth={1.6} />
        </button>
        <button type="button" onClick={handleMaximize} className={ctl} title="Agrandir / Restaurer" aria-label="Agrandir / Restaurer">
          <Square className="w-[13px] h-[13px]" strokeWidth={1.6} />
        </button>
        <button type="button" onClick={handleClose} className={`${ctl} window-close`} title={closeTitle} aria-label={closeTitle}>
          <X className="w-[15px] h-[15px]" strokeWidth={1.6} />
        </button>
      </div>
    </div>
  );
}
