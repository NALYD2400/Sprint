import React, { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { X, Plus, Sparkles, Server } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import SprintNavIcon from '../../components/layout/SprintNavIcon';
import { isValidProjectPort } from '../../lib/projectChanges';
import { isTauriEnv } from '../../lib/tauri';

export default function AddProjectModal({ isOpen, onClose, onAddProject, onAdded }) {
  const [folderPath, setFolderPath] = useState('');
  const [projectName, setProjectName] = useState('');
  const [stackInfo, setStackInfo] = useState(null);
  const [detecting, setDetecting] = useState(false);
  const [serverCommand, setServerCommand] = useState('npm run dev');
  const [serverPort, setServerPort] = useState('3000');
  const [color, setColor] = useState('#a855f7');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSelectFolder = async () => {
    if (!isTauriEnv()) {
      setError('La sélection de dossier nécessite l’application de bureau Sprint.');
      return;
    }
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Sélectionner le dossier du projet',
      });
      if (selected) {
        setFolderPath(selected);
        setError('');
        const name = selected.split(/[\\/]/).pop() || 'Nouveau Projet';
        setProjectName(name);

        setDetecting(true);
        try {
          const detected = await invoke('detect_stack_cmd', { path: selected });
          setStackInfo(detected);
          if (detected.default_dev_cmd) {
            setServerCommand(detected.default_dev_cmd);
          }
        } catch (e) {
          setStackInfo(null);
          console.error('Stack detection failed:', e);
        } finally {
          setDetecting(false);
        }
      }
    } catch (e) {
      console.error('Error selecting directory:', e);
      setError('Impossible d’ouvrir le sélecteur de dossier.');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving || !folderPath || !projectName.trim()) return;
    if (!serverCommand.trim()) { setError('La commande de lancement est obligatoire.'); return; }

    if (!isValidProjectPort(serverPort)) {
      setError('Indiquez un port TCP entre 1 et 65535, ou laissez vide pour un serveur sans port.');
      return;
    }

    const newProject = {
      id: `prj_${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`}`,
      name: projectName.trim(),
      root: folderPath,
      color,
      framework: stackInfo?.framework || 'Node.js',
      servers: [
        {
          id: `srv_${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`}`,
          name: 'dev',
          command: serverCommand.trim(),
          port: Number(serverPort),
          ramLimit: 500,
          state: 'stopped',
          env: {},
        },
      ],
    };

    setSaving(true);
    let saved;
    try { saved = await onAddProject(newProject); } finally { setSaving(false); }
    if (saved === false) { setError('Le projet n’a pas été enregistré. Vérifiez l’erreur et réessayez.'); return; }
    onAdded();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} dismissible={!saving} maxWidth="max-w-lg">
      <div className="p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-[var(--line)] pb-4">
          <div className="flex items-center gap-3">
            <span className="page-header-icon" aria-hidden="true">
              <SprintNavIcon name="projects" active />
            </span>
            <div>
              <h2 className="text-base font-semibold text-[var(--text-hi)]">Ajouter un projet</h2>
              <p className="text-xs text-[var(--text-mid)]">Importation locale avec détection automatique du stack</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Fermer"
            className="p-1.5 rounded-lg hover:bg-[var(--surface-3)] text-[var(--text-mid)] hover:text-[var(--text-hi)] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Folder Selector */}
          <div>
            <label htmlFor="prj-folder" className="block font-medium text-[var(--text-mid)] mb-1.5">Dossier du projet</label>
            <div className="flex gap-2">
              <input
                id="prj-folder"
                type="text"
                readOnly
                value={folderPath}
                placeholder="Aucun dossier sélectionné…"
                className="flex-1 px-3 py-2 rounded-lg bg-[var(--surface-2)] border border-[var(--line-strong)] text-[var(--text-hi)] placeholder-[var(--text-lo)] font-mono focus:outline-none"
              />
              <button
                type="button"
                onClick={handleSelectFolder}
                className="px-3.5 py-2 rounded-lg theme-accent-btn font-medium transition-[filter,transform] duration-150 cursor-pointer"
              >
                Parcourir
              </button>
            </div>
          </div>

          {/* Project Name & Framework Info */}
          {folderPath && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="prj-name" className="block font-medium text-[var(--text-mid)] mb-1.5">Nom du projet</label>
                  <input
                    id="prj-name"
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--surface-2)] border border-[var(--line-strong)] text-[var(--text-hi)] focus:outline-none theme-accent-border"
                  />
                </div>
                <div>
                  <label htmlFor="prj-color" className="block font-medium text-[var(--text-mid)] mb-1.5">Couleur d’accent</label>
                  <input
                    id="prj-color"
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-full h-9 p-1 rounded-lg bg-[var(--surface-2)] border border-[var(--line-strong)] cursor-pointer"
                  />
                </div>
              </div>

              {detecting && (
                <div className="p-3 rounded-lg bg-[var(--surface-2)] border border-[var(--line)] flex items-center gap-2 text-[var(--text-mid)]">
                  <Sparkles className="w-4 h-4 animate-pulse theme-accent-text" />
                  <span>Détection du stack en cours…</span>
                </div>
              )}

              {stackInfo && !detecting && (
                <div className="py-2 flex items-center justify-between border-t border-[var(--line)]">
                  <div className="flex items-center gap-2 text-[var(--text-hi)]">
                    <Sparkles className="w-4 h-4 theme-accent-text" />
                    <span>Stack détecté : <strong>{stackInfo.framework}</strong></span>
                  </div>
                  <span className="font-mono text-xs text-[var(--text-mid)]">
                    {stackInfo.package_manager}
                  </span>
                </div>
              )}

              {/* Dev Server Command & Port */}
              <div className="pt-3 border-t border-[var(--line)] space-y-3">
                <div className="flex items-center gap-2 font-medium text-[var(--text-hi)]">
                  <Server className="w-4 h-4 theme-accent-text" />
                  <span>Configuration du serveur</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label htmlFor="prj-cmd" className="block text-xs text-[var(--text-mid)] mb-1">Commande</label>
                    <input
                      id="prj-cmd"
                      type="text"
                      value={serverCommand}
                      onChange={(e) => setServerCommand(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg bg-[var(--surface-2)] border border-[var(--line-strong)] text-[var(--text-hi)] font-mono focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="prj-port" className="block text-xs text-[var(--text-mid)] mb-1">Port</label>
                    <input
                      id="prj-port"
                      type="number"
                      min="0"
                      max="65535"
                      placeholder="Aucun"
                      value={serverPort}
                      onChange={(e) => setServerPort(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg bg-[var(--surface-2)] border border-[var(--line-strong)] text-[var(--text-hi)] font-mono focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          {error && (
            <div role="alert" className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3.5 py-2.5">
              {error}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--line)]">
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
              disabled={saving || !folderPath || !projectName.trim()}
              className="px-4 py-2 rounded-lg theme-accent-btn font-medium transition-[filter,transform] duration-150 cursor-pointer flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              {saving ? 'Enregistrement…' : 'Ajouter le projet'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
