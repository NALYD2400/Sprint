import React, { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { ArrowUpRight, Settings, Terminal, Play, Square, Power, Loader2, X } from 'lucide-react';
import { applyPrefs, loadPrefs } from '../../lib/prefs';
import { applyAccent } from '../../lib/accent';
import { APP_VERSION } from '../../lib/updates';

export default function TrayPanel() {
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const quitRef = useRef(false);
  const stopRef = useRef(false);
  useEffect(() => {
    quitRef.current = confirmQuit;
  }, [confirmQuit]);
  useEffect(() => {
    stopRef.current = confirmStop;
  }, [confirmStop]);
  const alive = useRef(true);
  const request = useRef(0);
  const busy = useRef(false);
  const refresh = useCallback(async () => {
    const current = ++request.current;
    try {
      const state = await invoke('get_tray_state_cmd');
      if (alive.current && current === request.current) setSnapshot(state);
    } catch (reason) {
      if (alive.current) setError(String(reason));
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    let disposed = false;
    const subscriptions = [];
    const syncTheme = () => {
      applyAccent();
      // Keep the compact native panel at its own text scale.
      applyPrefs({ ...loadPrefs(), textSize: 'md' });
    };
    const onOpen = () => {
      setConfirmQuit(false);
      setConfirmStop(false);
      setError('');
      syncTheme();
      refresh();
    };
    const subscribe = (name, callback) =>
      listen(name, callback)
        .then((unlisten) => {
          if (disposed) unlisten();
          else subscriptions.push(unlisten);
        })
        .catch((reason) => {
          if (!disposed) setError(String(reason));
        });
    subscribe('tray-state-changed', refresh);
    subscribe('tray-panel-opened', onOpen);
    subscribe('server-status-changed', refresh);
    const keydown = (event) => {
      if (event.key === 'Escape') {
        if (quitRef.current) setConfirmQuit(false);
        else if (stopRef.current) setConfirmStop(false);
        else invoke('hide_window_cmd').catch(() => {});
      }
    };
    window.addEventListener('keydown', keydown);
    window.addEventListener('storage', syncTheme);
    const theme = matchMedia('(prefers-color-scheme: light)');
    theme.addEventListener('change', syncTheme);
    syncTheme();
    refresh();
    return () => {
      alive.current = false;
      disposed = true;
      subscriptions.forEach((unlisten) => unlisten());
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('storage', syncTheme);
      theme.removeEventListener('change', syncTheme);
    };
  }, [refresh]);

  const act = async (action, options = {}) => {
    if (action === 'open') {
      try {
        await invoke('tray_action_cmd', { action, serverId: null, tab: null, ...options });
      } catch (reason) {
        if (alive.current) setError(String(reason));
      }
      return;
    }
    if (busy.current || snapshot?.activity) return;
    busy.current = true;
    setPending(true);
    setError('');
    try {
      await invoke('tray_action_cmd', { action, serverId: null, tab: null, ...options });
      if (action !== 'open' && action !== 'quit') await refresh();
    } catch (reason) {
      if (alive.current) setError(String(reason));
    } finally {
      busy.current = false;
      if (alive.current) setPending(false);
    }
  };
  const servers = (snapshot?.projects || []).flatMap((project) =>
    project.servers.map((server) => ({ ...server, projectName: project.name })),
  );
  const running = snapshot?.running_count || 0;
  const stopped = servers.filter((server) => server.state !== 'running').length;
  const disabled = pending || !!snapshot?.activity;
  const status = ['Accès rapide', 'Démarrage en cours…', 'Arrêt en cours…', 'Fermeture…'][
    snapshot?.activity || 0
  ];
  const subtitle = snapshot?.activity
    ? status
    : running
      ? running + ' serveur' + (running > 1 ? 's' : '') + ' en marche'
      : 'Aucun serveur en marche';

  return (
    <main className="tray-panel">
      <header className="tray-heading">
        <div>
          <h1>Sprint</h1>
          <p>{subtitle}</p>
          {disabled && <Loader2 size={12} className="animate-spin" />}
        </div>
        <button
          className="icon-button"
          aria-label="Fermer le panneau"
          onClick={() => invoke('hide_window_cmd').catch(() => {})}
        >
          <X size={16} />
        </button>
      </header>
      <div className="tray-server-list" aria-label="Serveurs configurés">
        {!snapshot ? (
          <p className="tray-empty">Chargement des serveurs…</p>
        ) : !servers.length ? (
          <div className="tray-empty">
            <p>Ajoutez votre premier projet pour retrouver ses serveurs ici.</p>
            <button className="quiet-button" onClick={() => act('open', { tab: 'projects' })}>
              Ajouter un projet <ArrowUpRight size={13} />
            </button>
          </div>
        ) : (
          servers.map((server) => (
            <div className="tray-server" key={server.id}>
              <span className={'server-dot ' + (server.state === 'running' ? 'running' : '')} />
              <button
                className="tray-server-name"
                onClick={() => act('open', { tab: 'terminal', serverId: server.id })}
                title={server.projectName + ' · ' + server.name}
              >
                <strong>{server.name}</strong>
                <span>
                  {server.projectName}
                  {server.port ? ' · :' + server.port : ''}
                  {server.state !== 'running' ? ' · Arrêté' : ''}
                </span>
              </button>
              <button
                className="icon-button"
                disabled={disabled}
                onClick={() => act('toggle-server', { serverId: server.id })}
                aria-label={(server.state === 'running' ? 'Arrêter ' : 'Lancer ') + server.name}
                title={server.state === 'running' ? 'Arrêter ce serveur' : 'Lancer ce serveur'}
              >
                {server.state === 'running' ? <Square size={13} /> : <Play size={14} />}
              </button>
            </div>
          ))
        )}
      </div>
      {confirmStop ? (
        <div className="tray-quit-confirm">
          <p>
            Arrêter les {running} serveur{running > 1 ? 's' : ''} en marche ?
          </p>
          <div>
            <button className="quiet-button" disabled={disabled} onClick={() => setConfirmStop(false)}>
              Annuler
            </button>
            <button
              className="btn"
              disabled={disabled}
              onClick={() => {
                setConfirmStop(false);
                act('stop-all');
              }}
            >
              Arrêter
            </button>
          </div>
        </div>
      ) : (
        <div className="tray-batch-actions">
          <button
            className="quiet-button"
            disabled={disabled || !stopped}
            onClick={() => act('start-all')}
          >
            <Play size={13} />
            Tout lancer <span>{stopped}</span>
          </button>
          <button
            className="quiet-button"
            disabled={disabled || !running}
            onClick={() => setConfirmStop(true)}
          >
            <Square size={12} />
            Tout arrêter <span>{running}</span>
          </button>
        </div>
      )}
      {error && (
        <div className="tray-error" role="alert">
          {error}
          <button className="quiet-button" onClick={refresh}>
            Réessayer
          </button>
        </div>
      )}
      <nav className="tray-navigation" aria-label="Accès rapide">
        <button className="btn" onClick={() => act('open')}>
          Ouvrir Sprint
          <ArrowUpRight size={13} />
        </button>
        <button className="quiet-button" onClick={() => act('open', { tab: 'terminal' })}>
          <Terminal size={13} />
          Logs
        </button>
        <button className="quiet-button" onClick={() => act('open', { tab: 'settings' })}>
          <Settings size={13} />
          Paramètres
        </button>
      </nav>
      <footer className="tray-footer">
        {confirmQuit ? (
          <div className="tray-quit-confirm">
            <p>
              Arrêter les {running} serveur{running > 1 ? 's' : ''} et quitter Sprint ?
            </p>
            <div>
              <button
                className="quiet-button"
                disabled={disabled}
                onClick={() => setConfirmQuit(false)}
              >
                Annuler
              </button>
              <button className="btn" disabled={disabled} onClick={() => act('quit')}>
                Arrêter et quitter
              </button>
            </div>
          </div>
        ) : (
          <>
            <span>v{APP_VERSION}</span>
            <button
              className="quiet-button"
              disabled={disabled}
              onClick={() => (running ? setConfirmQuit(true) : act('quit'))}
            >
              <Power size={13} />
              Quitter Sprint
            </button>
          </>
        )}
      </footer>
    </main>
  );
}
