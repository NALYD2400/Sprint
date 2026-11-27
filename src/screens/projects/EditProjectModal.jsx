import React, { useState, useEffect } from 'react';
import { X, Save, Check } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import SprintNavIcon from '../../components/layout/SprintNavIcon';

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

export default function EditProjectModal({ isOpen, onClose, project, saveProjectChange }) {
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
    const change = { type: 'editProject', projectId: project.id };
    if (name.trim() && name.trim() !== project.name) change.name = name.trim();
    if (color !== (project.color || '#a855f7')) change.color = color;
    if (!change.name && !change.color) {
      onClose();
      return;
    }

    setSaving(true);
    let saved;
    try { saved = await saveProjectChange(change); } finally { setSaving(false); }
    if (saved === false) { setSaveError('Les modifications n’ont pas été enregistrées. Réessayez.'); return; }
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} dismissible={!saving} maxWidth="max-w-md">
      <div className="p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--line)] pb-4">
          <div className="flex items-center gap-3">
            <span className="page-header-icon" aria-hidden="true">
              <SprintNavIcon name="projects" active />
            </span>
            <div>
              <h2 className="text-base font-semibold text-[var(--text-hi)] tracking-tight">Modifier le projet</h2>
              <p className="text-xs text-[var(--text-mid)] flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} aria-hidden="true" />
                <span>Nom et couleur de repère du projet</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Fermer"
            className="p-2 rounded-lg bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-mid)] hover:text-[var(--text-hi)] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {saveError && <p role="alert" className="text-xs text-rose-400">{saveError}</p>}
          {/* Project Name */}
          <div>
            <label htmlFor="edit-prj-name" className="block text-xs font-medium text-[var(--text-mid)] mb-1.5">
              Nom du projet
            </label>
            <input
              id="edit-prj-name"
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-[var(--surface-2)] border border-[var(--line-strong)] text-xs text-[var(--text-hi)] focus:outline-none theme-accent-border"
            />
          </div>

          {/* Project Color Palette */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-mid)] mb-2 flex items-center gap-1.5">
              <span>Couleur du projet</span>
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
                    className={`h-9 rounded-lg border flex items-center justify-center transition-[transform,box-shadow] duration-150 ease-out cursor-pointer ${
                      isSelected ? 'ring-2 ring-[var(--text-hi)] ring-offset-2 ring-offset-[var(--bg-elevated)] scale-105' : 'hover:scale-95 border-[var(--line)]'
                    }`}
                    style={{ backgroundColor: presetHex }}
                  >
                    {isSelected && <Check className="w-4 h-4 text-[#fff]" />}
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
              className="btn cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-lg theme-accent-btn font-semibold text-xs flex items-center gap-2 transition-[filter,transform] duration-150 cursor-pointer"
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
