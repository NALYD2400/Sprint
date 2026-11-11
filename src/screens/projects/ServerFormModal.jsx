import React, { useEffect, useState } from 'react';
import { X, ChevronRight } from 'lucide-react';
import Modal from '../../components/ui/Modal';

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

const isValidPort = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 65535;
};

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
  projects,
  saveProjects,
}) {
  const isEdit = mode === 'edit';
  const [name, setName] = useState('');
  const [command, setCommand] = useState('npm run dev');
  const [port, setPort] = useState('3000');
  const [ramLimit, setRamLimit] = useState('500');
  const [error, setError] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const persist = async updated => {
    setSaving(true);
    try {
      const saved = await saveProjects(updated);
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
      setPort(server.port ? String(server.port) : '3000');
      setRamLimit(server.ramLimit ? String(server.ramLimit) : '500');
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
    if (!isValidPort(port)) {
      setError('Le port TCP doit être un nombre entre 1 et 65535.');
      return;
    }
    // Limite RAM vide = Auto-Guard désactivé pour ce serveur
    const ramText = ramLimit.trim();
    let ram;
    if (ramText === '') {
      ram = undefined;
    } else {
      ram = Number(ramText);
      if (!Number.isInteger(ram) || ram < 1 || ram > 4294967295) {
        setError('Indiquez un nombre entier de mégaoctets supérieur à zéro, ou laissez vide pour désactiver la limite.');
        return;
      }
    }

    const portNum = parseInt(port, 10);

    if (isEdit && server) {
      const updatedProjects = projects.map((prj) => {
        if (prj.id !== project.id) return prj;
        return {
          ...prj,
          servers: (prj.servers || []).map((srv) =>
            srv.id === server.id
              ? {
                  ...srv,
                  name: name.trim(),
                  command: command.trim(),
                  port: portNum,
                  ramLimit: ram,
                }
              : srv
          ),
        };
      });
      if (await persist(updatedProjects) === false) return;
    } else {
      const newServer = {
        id: `srv_${project.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: name.trim(),
        command: command.trim(),
        port: portNum,
        ramLimit: ram,
        state: 'stopped',
        env: {},
      };
      const updatedProjects = projects.map((prj) =>
        prj.id === project.id
          ? { ...prj, servers: [...(prj.servers || []), newServer] }
          : prj
      );
      if (await persist(updatedProjects) === false) return;
    }

    onClose();
  };

  const field = 'w-full h-9 px-3 rounded-md bg-white/[0.04] border border-transparent hover:bg-white/[0.06] text-[13px] text-zinc-100 placeholder-zinc-600';
  const label = 'block text-xs text-zinc-400 mb-1.5';

  return (
    <Modal isOpen={isOpen} onClose={onClose} dismissible={!saving} maxWidth="max-w-md">
      <div className="flex items-start justify-between px-6 pt-6">
        <div>
          <h3 className="text-base font-semibold text-white tracking-tight">
            {isEdit ? 'Modifier le serveur' : 'Nouveau serveur'}
          </h3>
          <p className="text-xs text-zinc-500 mt-1">{project.name}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
            disabled={saving}
          aria-label="Fermer"
          className="w-7 h-7 -mr-1.5 flex items-center justify-center rounded-md text-zinc-500 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
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
                  className={`h-6 px-2 rounded-md text-[12px] font-mono transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-white/[0.1] text-white'
                      : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05]'
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
              required
              min="1"
              max="65535"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder="3000"
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
            className="h-8 px-3 rounded-md text-xs text-zinc-400 hover:text-white hover:bg-white/[0.05] transition-colors cursor-pointer"
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
