import React, { useEffect, useState } from 'react';
import { X, ChevronRight } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import SprintNavIcon from '../../components/layout/SprintNavIcon';
import { isValidProjectPort } from '../../lib/projectChanges';

const SUGGESTED_SCRIPTS = [
  'npm run dev',
  'npm start',
  'node server.js',
  'npx serve -l 3000',
  'python main.py',
  'cargo run',
  'pnpm dev',
  'bun dev',
  'yarn dev',
];

/**
 * Formulaire unifié d'ajout et d'édition de serveur
 * (remplace AddServerModal + EditServerModal, ~90% dupliqués).
 */
export default function ServerFormModal({
  mode = 'add',
  isOpen,
  onClose,
  project,
  server,
  saveProjectChange,
}) {
  const isEdit = mode === 'edit';
  const [name, setName] = useState(() =>
    isEdit && server ? server.name || 'dev' : `Serveur ${((project && project.servers) || []).length + 1}`,
  );
  const [command, setCommand] = useState(() =>
    isEdit && server ? server.command || '' : 'npm run dev',
  );
  const [port, setPort] = useState(() =>
    isEdit && server ? (server.port ? String(server.port) : '') : '3000',
  );
  const [ramLimit, setRamLimit] = useState(() =>
    isEdit && server ? (server.ramLimit ? String(server.ramLimit) : '') : '500',
  );
  const [error, setError] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const persist = async change => {
    setSaving(true);
    try {
      const saved = await saveProjectChange(change);
      if (saved === false) setError('Les modifications n’ont pas été enregistrées. Réessayez.');
      return saved;
    } finally { setSaving(false); }
  };

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    setShowAdvanced(false);
    if (isEdit && server) {
      setName(server.name || 'dev');
      setCommand(server.command || '');
      setPort(server.port ? String(server.port) : '');
      setRamLimit(server.ramLimit ? String(server.ramLimit) : '');
    } else {
      setName(`Serveur ${((project && project.servers) || []).length + 1}`);
      setCommand('npm run dev');
      setPort('3000');
      setRamLimit('500');
    }
  }, [isOpen, isEdit, server, project]);

  if (!isOpen || !project) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;

    if (!name.trim() || !command.trim()) {
      setError('Le nom et la commande de démarrage sont obligatoires.');
      return;
    }
    if (!isValidProjectPort(port)) {
      setError('Indiquez un port TCP entre 1 et 65535, ou laissez vide pour un serveur sans port.');
      return;
    }
    // Limite RAM vide = Auto-Guard désactivé pour ce serveur
    const ramText = ramLimit.trim();
    let ram;
    if (ramText === '') {
      ram = null;
    } else {
      ram = Number(ramText);
      if (!Number.isInteger(ram) || ram < 1 || ram > 4294967295) {
        setError('Indiquez un nombre entier de mégaoctets supérieur à zéro, ou laissez vide pour désactiver la limite.');
        return;
      }
    }

    const fields = { name: name.trim(), command: command.trim(), port: Number(port), ramLimit: ram };

    if (isEdit && server) {
      const previous = { ...server, port: server.port || 0, ramLimit: server.ramLimit || null };
      const edits = Object.entries(fields).filter(([key, value]) => value !== previous[key]);
      if (edits.length && !await persist({
        type: 'editServer', projectId: project.id, serverId: server.id, ...Object.fromEntries(edits),
      })) return;
    } else {
      const newServer = {
        id: `srv_${project.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        ...fields,
        state: 'stopped',
        env: {},
      };
      if (!await persist({ type: 'addServer', projectId: project.id, server: newServer })) return;
    }

    onClose();
  };

  const field = 'w-full h-9 px-3 rounded-lg bg-[var(--surface-2)] border border-[var(--line)] hover:border-[var(--line-strong)] text-[13px] text-[var(--text-hi)] placeholder-[var(--text-lo)] transition-colors';
  const label = 'block text-xs text-[var(--text-mid)] mb-1.5';

  return (
    <Modal isOpen={isOpen} onClose={onClose} dismissible={!saving} maxWidth="max-w-md">
      <div className="flex items-start justify-between px-6 pt-6">
        <div className="flex items-center gap-3">
          <span className="page-header-icon" aria-hidden="true">
            <SprintNavIcon name="serversActive" active />
          </span>
          <div>
            <h3 className="text-base font-semibold text-[var(--text-hi)] tracking-tight">
              {isEdit ? 'Modifier le serveur' : 'Nouveau serveur'}
            </h3>
            <p className="text-xs text-[var(--text-mid)] mt-0.5">{project.name}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          aria-label="Fermer"
          className="w-7 h-7 -mr-1.5 flex items-center justify-center rounded-md text-[var(--text-mid)] hover:text-[var(--text-hi)] hover:bg-[var(--surface-3)] transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="px-6 pt-5 pb-6 space-y-4">
        <div>
          <label htmlFor="srv-cmd" className={label}>Commande de démarrage</label>
          <input
            id="srv-cmd"
            type="text"
            required
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="npm run dev"
            className={`${field} font-mono`}
          />
          <div className="flex flex-wrap gap-1 mt-2">
            {SUGGESTED_SCRIPTS.map((scriptCmd) => {
              const isSelected = command.trim() === scriptCmd;
              return (
                <button
                  key={scriptCmd}
                  type="button"
                  onClick={() => setCommand(scriptCmd)}
                  className={`h-6 px-2 rounded-md text-[12px] font-mono border transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[var(--surface-3)] text-[var(--text-hi)] border-[var(--line-strong)]'
                      : 'border-transparent text-[var(--text-mid)] hover:text-[var(--text-hi)] hover:bg-[var(--surface-2)]'
                  }`}
                >
                  {scriptCmd}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-[1fr_7rem] gap-3">
          <div>
            <label htmlFor="srv-name" className={label}>Nom</label>
            <input
              id="srv-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Site web, API…"
              className={field}
            />
          </div>
          <div>
            <label htmlFor="srv-port" className={label}>Port</label>
            <input
              id="srv-port"
              type="number"
              min="0"
              max="65535"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder="Aucun"
              className={`${field} font-mono`}
            />
          </div>
        </div>

        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            aria-expanded={showAdvanced}
            className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
          >
            <ChevronRight className={`w-3.5 h-3.5 transition-transform ${showAdvanced ? 'rotate-90' : ''}`} />
            Options avancées
          </button>
          {showAdvanced && (
            <div className="mt-3">
              <label htmlFor="srv-ram" className={label}>Mémoire maximale (Mo)</label>
              <input
                id="srv-ram"
                type="number"
                min="0"
                value={ramLimit}
                onChange={(e) => setRamLimit(e.target.value)}
                placeholder="500"
                className={`${field} font-mono`}
              />
              <p className="text-[12px] text-zinc-500 mt-1.5 leading-relaxed">
                Si le serveur dépasse cette limite, Sprint le relance automatiquement. Laissez vide pour désactiver.
              </p>
            </div>
          )}
        </div>

        {error && (
          <div role="alert" className="text-xs text-red-300 bg-red-500/10 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        <div className="pt-2 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="btn cursor-pointer"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={saving}
            className="h-8 px-4 rounded-md theme-accent-btn text-xs font-medium cursor-pointer"
          >
            {saving ? 'Enregistrement…' : isEdit ? 'Enregistrer' : 'Ajouter'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
