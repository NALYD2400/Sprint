import React, { useState, useEffect, useRef, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  FileText,
  Save,
  X,
  Eye,
  EyeOff,
  Check,
  AlertCircle,
  Plus,
  Trash2,
  Copy,
  Search,
  Code2,
  ListFilter,
  FilePlus,
} from 'lucide-react';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { triggerToast } from '../../lib/toastBus';

export default function EnvEditorModal({ isOpen, onClose, projectRoot }) {
  const [envFiles, setEnvFiles] = useState(['.env']);
  const [selectedFile, setSelectedFile] = useState('.env');
  const [content, setContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [showSecrets, setShowSecrets] = useState(false);
  const [viewMode, setViewMode] = useState('raw'); // 'raw' | 'table'
  const [searchQuery, setSearchQuery] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [targetSwitchFile, setTargetSwitchFile] = useState(null);
  const savedTimerRef = useRef(null);

  const isModalOpen = !!projectRoot && isOpen !== false;
  const isDirty = content !== savedContent;

  // Charger la liste des fichiers .env disponibles
  useEffect(() => {
    if (isModalOpen && projectRoot) {
      invoke('list_env_files_cmd', { projectRoot })
        .then((files) => {
          const fileList = Array.isArray(files) && files.length > 0 ? files : ['.env'];
          setEnvFiles(fileList);
          if (!fileList.includes(selectedFile)) {
            setSelectedFile(fileList[0]);
          }
        })
        .catch(() => {
          setEnvFiles(['.env']);
        });
    }
  }, [isModalOpen, projectRoot, selectedFile]);

  // Charger le contenu du fichier sélectionné
  useEffect(() => {
    let disposed = false;
    if (isModalOpen && projectRoot && selectedFile) {
      setLoading(true);
      setError('');
      setShowSecrets(false);
      invoke('read_env_file', { projectRoot, fileName: selectedFile })
        .then((res) => {
          if (disposed) return;
          setContent(res || '');
          setSavedContent(res || '');
        })
        .catch((err) => {
          if (disposed) return;
          setError(String(err));
          setContent('');
          setSavedContent('');
        })
        .finally(() => { if (!disposed) setLoading(false); });
    }
    return () => { disposed = true; };
  }, [isModalOpen, projectRoot, selectedFile]);

  useEffect(
    () => () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    },
    []
  );

  const handleSelectFile = (file) => {
    if (file === selectedFile) return;
    if (isDirty) {
      setTargetSwitchFile(file);
      setConfirmDiscard(true);
    } else {
      setSelectedFile(file);
    }
  };

  const handleCreateNewEnvFile = () => {
    if (!newFileName.trim()) return;
    let cleanName = newFileName.trim();
    if (!cleanName.startsWith('.env')) {
      cleanName = `.env.${cleanName}`;
    }
    if (!envFiles.includes(cleanName)) {
      setEnvFiles((prev) => [...prev, cleanName].sort());
    }
    setSelectedFile(cleanName);
    setContent('');
    setSavedContent('');
    setIsCreatingFile(false);
    setNewFileName('');
  };

  const requestClose = () => {
    if (isDirty) {
      setTargetSwitchFile(null);
      setConfirmDiscard(true);
    } else {
      onClose();
    }
  };

  const handleSave = async () => {
    setError('');
    try {
      await invoke('save_env_file', {
        projectRoot,
        fileName: selectedFile,
        content,
      });
      setSavedContent(content);
      setSaved(true);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaved(false), 2500);
      triggerToast({
        title: '💾 Fichier Enregistré',
        message: `${selectedFile} a été mis à jour avec succès.`,
        type: 'success',
      });
    } catch (e) {
      setError(`Échec de la sauvegarde : ${String(e)}`);
    }
  };

  // Parsing pour la vue Tableau (Key-Value)
  const parsedEntries = useMemo(() => {
    const lines = content.split('\n');
    return lines.map((line, index) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        return { type: 'comment', raw: line, index };
      }
      const eqIdx = line.indexOf('=');
      if (eqIdx === -1) {
        return { type: 'invalid', raw: line, index };
      }
      const key = line.slice(0, eqIdx).trim();
      const value = line.slice(eqIdx + 1);
      return { type: 'kv', key, value, raw: line, index };
    });
  }, [content]);

  const handleUpdateKvValue = (index, newKey, newVal) => {
    const lines = content.split('\n');
    lines[index] = `${newKey}=${newVal}`;
    setContent(lines.join('\n'));
  };

  const handleDeleteEntry = (index) => {
    const lines = content.split('\n');
    lines.splice(index, 1);
    setContent(lines.join('\n'));
  };

  const handleAddNewVariable = () => {
    const lines = content ? content.split('\n') : [];
    lines.push('NEW_VARIABLE=value');
    setContent(lines.join('\n'));
    setViewMode('table');
  };

  // Vue masquée pour le mode brut
  const maskedLines = content.split('\n').map((line) => {
    const match = line.match(/^(\s*[A-Za-z_][A-Za-z0-9_]*\s*=\s*)(.*)$/);
    if (match) {
      const value = match[2];
      const visible = value.length > 0 ? '•'.repeat(Math.min(value.length, 12)) : '';
      return `${match[1]}${visible}`;
    }
    return line;
  });

  const filteredKvEntries = useMemo(() => {
    if (!searchQuery) return parsedEntries;
    const q = searchQuery.toLowerCase();
    return parsedEntries.filter(
      (e) =>
        e.type === 'kv' &&
        (e.key.toLowerCase().includes(q) || (showSecrets && e.value.toLowerCase().includes(q)))
    );
  }, [parsedEntries, searchQuery, showSecrets]);

  return (
    <>
      <Modal isOpen={isModalOpen} onClose={requestClose} maxWidth="max-w-3xl">
        <div className="p-6 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--line)] pb-3.5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white tracking-tight flex items-center gap-2">
                  <span>Éditeur d'Environnement (.env)</span>
                  <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full theme-accent-badge">
                    {selectedFile}
                  </span>
                </h2>
                <p className="text-[12px] text-zinc-400 font-mono truncate max-w-lg mt-0.5">
                  {projectRoot}\{selectedFile}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={requestClose}
              aria-label="Fermer"
              className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Multi-Files Selector Tabs */}
          <div className="flex items-center justify-between gap-2 flex-wrap border-b border-[var(--line)] pb-3">
            <div className="flex items-center gap-1.5 overflow-x-auto py-1 no-scrollbar">
              {envFiles.map((file) => {
                const isActive = file === selectedFile;
                return (
                  <button
                    key={file}
                    type="button"
                    onClick={() => handleSelectFile(file)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer border flex items-center gap-1.5 ${
                      isActive
                        ? 'theme-accent-btn text-white border-transparent'
                        : 'border-[var(--line)] bg-white/[0.03] text-zinc-400 hover:text-white hover:bg-white/[0.06]'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>{file}</span>
                  </button>
                );
              })}

              {isCreatingFile ? (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={newFileName}
                    onChange={(e) => setNewFileName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateNewEnvFile();
                      if (e.key === 'Escape') setIsCreatingFile(false);
                    }}
                    placeholder=".env.local"
                    autoFocus
                    className="px-2.5 py-1 rounded-lg bg-black/40 border border-[var(--line-strong)] text-xs font-mono text-white focus:outline-none w-28"
                  />
                  <button
                    type="button"
                    onClick={handleCreateNewEnvFile}
                    className="p-1.5 rounded-lg theme-accent-btn text-white text-xs"
                    title="Valider"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsCreatingFile(false)}
                    className="p-1.5 rounded-lg bg-white/10 text-zinc-400 hover:text-white text-xs"
                    title="Annuler"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsCreatingFile(true)}
                  className="px-2.5 py-1.5 rounded-lg border border-dashed border-[var(--line-strong)] text-zinc-400 hover:text-white hover:bg-white/[0.04] text-xs font-medium transition-all cursor-pointer flex items-center gap-1"
                >
                  <FilePlus className="w-3.5 h-3.5" />
                  <span>+ Nouveau fichier</span>
                </button>
              )}
            </div>

            {/* View Mode Switcher */}
            <div className="flex items-center gap-1 bg-black/40 border border-[var(--line)] p-1 rounded-lg">
              <button
                type="button"
                onClick={() => setViewMode('raw')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                  viewMode === 'raw'
                    ? 'theme-accent-btn text-white font-semibold'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Code2 className="w-3.5 h-3.5" />
                <span>Texte Brut</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                  viewMode === 'table'
                    ? 'theme-accent-btn text-white font-semibold'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <ListFilter className="w-3.5 h-3.5" />
                <span>Clés/Valeurs</span>
              </button>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center justify-between gap-3 text-xs flex-wrap">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowSecrets(!showSecrets)}
                aria-pressed={showSecrets}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 transition-colors cursor-pointer border border-[var(--line)]"
              >
                {showSecrets ? <EyeOff className="w-3.5 h-3.5 text-amber-400" /> : <Eye className="w-3.5 h-3.5" />}
                <span>{showSecrets ? 'Masquer les valeurs' : 'Afficher les secrets en clair'}</span>
              </button>

              {viewMode === 'table' && (
                <button
                  type="button"
                  onClick={handleAddNewVariable}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg theme-accent-badge transition-colors cursor-pointer font-semibold"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Ajouter une variable</span>
                </button>
              )}
            </div>

            {viewMode === 'table' && (
              <div className="relative">
                <Search className="w-3 h-3 text-zinc-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filtrer les clés..."
                  className="pl-8 pr-3 py-1.5 rounded-lg bg-white/[0.04] border border-[var(--line)] text-xs text-white placeholder-zinc-600 focus:outline-none theme-accent-border font-mono w-44"
                />
              </div>
            )}

            <div className="flex items-center gap-3">
              {isDirty && <span className="text-amber-400 font-medium">● Modifications non enregistrées</span>}
              {saved && (
                <span className="flex items-center gap-1 text-emerald-400 font-medium">
                  <Check className="w-3.5 h-3.5" /> Enregistré !
                </span>
              )}
            </div>
          </div>

          {/* Editor Workspace */}
          <div className="relative">
            {loading ? (
              <div className="h-64 flex items-center justify-center text-xs text-zinc-500 font-mono">
                Chargement de {selectedFile}...
              </div>
            ) : viewMode === 'raw' ? (
              showSecrets ? (
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="PORT=3000\nDATABASE_URL=postgres://..."
                  rows={13}
                  spellCheck={false}
                  aria-label="Contenu du fichier .env en clair"
                  className="w-full p-4 rounded-xl bg-black/40 border border-[var(--line)] text-xs font-mono text-emerald-300 placeholder-zinc-600 focus:outline-none theme-accent-border leading-relaxed resize-none"
                />
              ) : (
                <div
                  aria-label="Contenu du fichier .env, valeurs masquées"
                  className="w-full h-72 p-4 rounded-xl bg-black/40 border border-[var(--line)] text-xs font-mono text-zinc-300 leading-relaxed overflow-y-auto select-none"
                >
                  {content ? (
                    maskedLines.map((line, idx) => {
                      const isKey = /^\s*[A-Za-z_][A-Za-z0-9_]*\s*=/.test(line);
                      const isComment = /^\s*#/.test(line);
                      return (
                        <div
                          key={idx}
                          className={`${isComment ? 'text-zinc-500 italic' : isKey ? 'text-emerald-300' : 'text-zinc-400'}`}
                        >
                          {line || '\u00A0'}
                        </div>
                      );
                    })
                  ) : (
                    <span className="text-zinc-600 italic">Fichier {selectedFile} vide ou inexistant.</span>
                  )}
                </div>
              )
            ) : (
              /* Table View Mode */
              <div className="w-full h-72 overflow-y-auto rounded-xl bg-black/40 border border-[var(--line)] p-2 space-y-2">
                {filteredKvEntries.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-zinc-500 italic">
                    Aucune variable trouvée.
                  </div>
                ) : (
                  filteredKvEntries.map((entry) => {
                    if (entry.type === 'comment') {
                      return (
                        <div
                          key={entry.index}
                          className="px-3 py-1 text-xs text-zinc-500 italic font-mono bg-white/[0.02] rounded-lg"
                        >
                          {entry.raw}
                        </div>
                      );
                    }
                    if (entry.type === 'kv') {
                      return (
                        <div
                          key={entry.index}
                          className="p-2.5 rounded-lg bg-white/[0.03] border border-[var(--line)] hover:border-[var(--line-strong)] transition-all flex items-center justify-between gap-3"
                        >
                          <div className="flex-1 flex items-center gap-2 min-w-0">
                            <input
                              type="text"
                              value={entry.key}
                              onChange={(e) => handleUpdateKvValue(entry.index, e.target.value, entry.value)}
                              className="w-1/3 px-2.5 py-1.5 rounded-lg bg-black/40 border border-[var(--line)] text-xs font-mono font-semibold text-emerald-300 focus:outline-none theme-accent-border"
                              placeholder="CLÉ"
                            />
                            <span className="text-zinc-500 font-mono">=</span>
                            <div className="flex-1 relative">
                              <input
                                type={showSecrets ? 'text' : 'password'}
                                value={entry.value}
                                onChange={(e) => handleUpdateKvValue(entry.index, entry.key, e.target.value)}
                                className="w-full px-2.5 py-1.5 rounded-lg bg-black/40 border border-[var(--line)] text-xs font-mono text-zinc-200 focus:outline-none theme-accent-border"
                                placeholder="valeur..."
                              />
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(entry.value);
                                triggerToast({
                                  title: '📋 Copié !',
                                  message: `Valeur de ${entry.key} copiée dans le presse-papier.`,
                                  type: 'info',
                                  duration: 2000,
                                });
                              }}
                              className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                              title="Copier la valeur"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteEntry(entry.index)}
                              className="p-1.5 rounded-lg hover:bg-red-500/20 text-zinc-400 hover:text-red-400 transition-colors cursor-pointer"
                              title="Supprimer cette variable"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })
                )}
              </div>
            )}
          </div>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-3.5 py-2.5"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="break-words">{error}</span>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[var(--line)]">
            <button
              type="button"
              onClick={requestClose}
              className="px-4 py-2.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 text-xs font-medium transition-colors cursor-pointer"
            >
              Fermer
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!isDirty || loading}
              className="px-5 py-2.5 rounded-lg theme-accent-btn text-white font-semibold text-xs flex items-center gap-2 disabled:opacity-40 transition-all cursor-pointer "
            >
              <Save className="w-4 h-4" />
              <span>Enregistrer {selectedFile}</span>
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDiscard}
        title="Modifications non enregistrées"
        message={`Vous avez modifié le fichier ${selectedFile} sans enregistrer. Voulez-vous vraiment abandonner vos modifications ?`}
        confirmLabel="Abandonner les modifications"
        danger
        onConfirm={() => {
          setConfirmDiscard(false);
          if (targetSwitchFile) {
            setSelectedFile(targetSwitchFile);
            setTargetSwitchFile(null);
          } else {
            onClose();
          }
        }}
        onCancel={() => {
          setConfirmDiscard(false);
          setTargetSwitchFile(null);
        }}
      />
    </>
  );
}


