import React from 'react';
import { Play, Square, RotateCw, Loader2 } from 'lucide-react';
import useServerOperations from '../../hooks/useServerOperations';
import { performServerAction } from '../../lib/serverActions';

export default function ServerControls({ project, server, compact = false, nameInLabel = false }) {
  const getOperation = useServerOperations();
  const operation = getOperation(server.id);
  const running = server.state === 'running';
  const label = operation === 'restart' ? 'Redémarrage…' : operation === 'stop' ? 'Arrêt…'
    : operation === 'start' ? 'Démarrage…' : running ? 'Arrêter' : 'Lancer';
  const busy = !!operation || server.state === 'starting';
  return (
    <>
      {operation && <span className="server-operation-label" role="status">{label}</span>}
      {running && <button className="icon-button" title="Redémarrer"
        aria-label={'Redémarrer ' + server.name} disabled={busy}
        onClick={() => performServerAction('restart', project, server)}>
        <RotateCw size={14} />
      </button>}
      <button
        className={compact ? 'server-action-button ' + (running ? 'stop' : 'start')
          : 'icon-button ' + (running ? 'text-rose-300' : 'text-emerald-300')}
        disabled={busy} title={label} aria-label={nameInLabel ? label + ' ' + server.name : label}
        onClick={() => performServerAction(running ? 'stop' : 'start', project, server)}>
        {operation ? <Loader2 size={14} className="animate-spin" />
          : running ? <Square size={13} /> : <Play size={14} />}
      </button>
    </>
  );
}
