import React, { useState, useEffect } from 'react';
import { X, Edit3, Save, Check } from 'lucide-react';
import Modal from '../../components/ui/Modal';

const COLOR_PRESETS = [
  '#a855f7', // Violet
  '#3b82f6', // Bleu
  '#10b981', // Émeraude
  '#ec4899', // Rose
  '#f59e0b', // Ambre
  '#06b6d4', // Cyan
  '#6366f1', // Indigo
  '#ef4444', // Rouge
];

export default function EditProjectModal({ isOpen, onClose, project, projects, saveProjects }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#a855f7');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    if (project) {
      setName(project.name || '');
      setColor(project.color || '#a855f7');
    }
  }, [project]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    const updatedProjects = projects.map((p) => {
      if (p.id === project.id) {
        return {
          ...p,
          name: name.trim() || p.name,
          color: color || p.color,
        };
      }
      return p;
    });

    setSaving(true);
    let saved;
    try { saved = await saveProjects(updatedProjects); } finally { setSaving(false); }
    if (saved === false) { setSaveError('Les modifications n’ont pas été enregistrées. Réessayez.'); return; }
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} dismissible={!saving} maxWidth="max-w-md">
      <div className="p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--line)] pb-4">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center border"
              style={{
                backgroundColor: `${color}20`,
                borderColor: `${color}50`,
                color: color,
              }}
            >
              <Edit3 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white tracking-tight">Modifier le Projet</h2>
              <p className="text-xs text-zinc-400">Nom et couleur thématique de la carte projet</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Fermer"
            className="p-2 rounded-lg bg-white/[0.04] hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {saveError && <p role="alert" className="text-xs text-rose-400">{saveError}</p>}
          {/* Project Name */}
          <div>
            <label htmlFor="edit-prj-name" className="block text-xs font-medium text-zinc-400 mb-1.5 font-mono">
              Nom du Projet
            </label>
            <input
              id="edit-prj-name"
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-white/[0.04] border border-[var(--line)] text-xs text-white font-mono focus:outline-none theme-accent-border"
            />
          </div>

          {/* Project Color Palette */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-2 font-mono flex items-center gap-1.5">
              <span>Couleur de la Puce Projet</span>
            </label>
            <div className="grid grid-cols-4 gap-2.5">
              {COLOR_PRESETS.map((presetHex) => {
                const isSelected = color.toLowerCase() === presetHex.toLowerCase();
                return (
                  <button
                    key={presetHex}
                    type="button"
                    aria-label={`Couleur ${presetHex}`}
                    aria-pressed={isSelected}
                    onClick={() => setColor(presetHex)}
                    className={`h-9 rounded-lg border flex items-center justify-center transition-all cursor-pointer ${
                      isSelected ? 'ring-2 ring-white scale-105' : 'hover:scale-95 border-[var(--line)]'
                    }`}
                    style={{ backgroundColor: presetHex }}
                  >
                    {isSelected && <Check className="w-4 h-4 text-white" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="pt-4 flex items-center justify-end gap-3 border-t border-[var(--line)]">
            <button
              type="button"
              onClick={onClose}
            disabled={saving}
              className="px-4 py-2.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 hover:text-white text-xs font-semibold border border-[var(--line)] transition-all cursor-pointer "
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-lg theme-accent-btn text-white font-semibold text-xs flex items-center gap-2 transition-all cursor-pointer "
            >
              <Save className="w-4 h-4" />
              <span>Enregistrer</span>
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
