import { SKILL_MARKDOWN } from '../../services/assistantSkill';
import AboutSettings from '../settings/AboutSettings';
import AssistantSettings from '../settings/AssistantSettings';
import StorageSettings from '../settings/StorageSettings';
import SystemSettings from '../settings/SystemSettings';
import SupervisionSettings from '../settings/SupervisionSettings';
import DashboardSettings from '../settings/DashboardSettings';
import AppearanceSettings from '../settings/AppearanceSettings';
import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { RotateCcw } from 'lucide-react';
import PageHeader from '../ui/PageHeader';
import { DEFAULT_PREFS } from '../../services/prefs';
import { DEFAULT_DASHBOARD, dashboardPrefs } from '../../services/dashboardPrefs';
import { triggerToast } from '../../services/toastBus';
import ConfirmDialog from '../ui/ConfirmDialog';
import { applyAccent } from '../../services/accent';
import { syncStoredSettings, loadStoredSettings, writeStoredSetting } from '../../services/settingsStorage';

function isValidHex(hex) {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex);
}

export default function SettingsView({
  projects = [],
  onOpenUpdateModal,
  reloadProjects,
  prefs,
  onPrefsChange,
  initialSection = 'appearance',
}) {
  const [activeTab, setActiveTab] = useState(initialSection);
  const contentRef = useRef(null);

  const [settings, setSettings] = useState(loadStoredSettings);

  const [hexDraft, setHexDraft] = useState(settings.custom_hex);
  const [hexError, setHexError] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [copiedSkill, setCopiedSkill] = useState(false);
  const [configDirPath, setConfigDirPath] = useState('%APPDATA%/sprint');
  const [confirmReset, setConfirmReset] = useState(false);
  const [pendingImport, setPendingImport] = useState(null);
  const [saveState, setSaveState] = useState('');
  const saveQueue = useRef(Promise.resolve());
  const saveSequence = useRef(0);

  const savedTimerRef = useRef(null);
  const copiedTimerRef = useRef(null);

  // Load unified settings from Rust backend at launch
  useEffect(() => {
    let disposed = false;
    invoke('get_settings_cmd')
      .then((backendSettings) => {
        if (backendSettings && !disposed && !saveSequence.current) {
          setSettings((prev) => ({ ...prev, ...backendSettings }));
          setHexDraft(backendSettings.custom_hex);
          applyAccent(backendSettings.custom_hex);
          syncStoredSettings(backendSettings);
        }
      })
      .catch(() => {});

    invoke('is_autostart_cmd')
      .then((enabled) => {
        if (!disposed) setSettings((prev) => ({ ...prev, autostart: !!enabled }));
      })
      .catch(() => {});
    return () => { disposed = true; };
  }, []);

  useEffect(
    () => () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    },
    [],
  );

  const showAutoSaved = () => {
    setSavedSuccess(true);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSavedSuccess(false), 2000);
  };

  const saveUpdatedSettings = (newSettings, silent = false) => {
    const sequence = ++saveSequence.current;
    setSettings(newSettings);
    setSaveState('saving');
    // Sync backend Rust
    saveQueue.current = saveQueue.current.catch(() => {}).then(() => invoke('save_settings_cmd', { settings: newSettings }))
      .then(() => {
        syncStoredSettings(newSettings);
        if (sequence === saveSequence.current) {
          setSaveState('');
          if (!silent) showAutoSaved();
        }
      })
      .catch((error) => {
        if (sequence === saveSequence.current) setSaveState('error');
        triggerToast({
          title: 'Enregistrement impossible',
          message: String(error),
          type: 'error',
        });
      });
  };

  const commitHexColor = (candidate) => {
    const trimmed = candidate.trim();
    if (isValidHex(trimmed)) {
      setHexError(false);
      setHexDraft(trimmed);
      applyAccent(trimmed);
      writeStoredSetting('custom_hex', trimmed);
      const updated = { ...settings, custom_hex: trimmed };
      saveUpdatedSettings(updated);
    } else {
      setHexError(true);
    }
  };

  const handleUpdateShortcut = (value) => {
    invoke('register_global_shortcut_cmd', { shortcut: value })
      .then(() => {
        writeStoredSetting('global_shortcut', value);
        const updated = { ...settings, global_shortcut: value };
        saveUpdatedSettings(updated);
        triggerToast({
          title: '⌨️ Raccourci Enregistré',
          message: `Nouveau raccourci global: ${value}`,
          type: 'success',
        });
      })
      .catch((e) => {
        triggerToast({
          title: '⚠️ Raccourci Refusé',
          message: String(e),
          type: 'error',
        });
      });
  };

  const toggleAutoStart = async (val) => {
    try {
      await invoke('set_autostart_cmd', { enable: val });
      const updated = { ...settings, autostart: val };
      saveUpdatedSettings(updated);
      triggerToast({
        title: val ? '🚀 Démarrage Windows Activé' : '⏹ Démarrage Windows Désactivé',
        message: val
          ? 'Sprint se lancera automatiquement à la connexion.'
          : 'Sprint ne se lancera plus automatiquement.',
        type: 'info',
      });
    } catch (e) {
      triggerToast({
        title: '⚠️ Échec du Réglage OS',
        message: `Impossible de modifier le démarrage automatique: ${String(e)}`,
        type: 'error',
      });
    }
  };

  const handleOpenConfigDir = async () => {
    try {
      const path = await invoke('open_config_dir_cmd');
      setConfigDirPath(path);
      triggerToast({
        title: '📂 Dossier de Configuration',
        message: 'Explorateur ouvert dans le dossier AppData/sprint',
        type: 'info',
      });
    } catch (e) {
      triggerToast({
        title: '⚠️ Explorateur',
        message: String(e),
        type: 'error',
      });
    }
  };

  const handleExportConfig = async () => {
    try {
      const currentProjects = await invoke('get_projects_cmd');
      const dataStr = JSON.stringify(currentProjects || [], null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sprint_config_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      triggerToast({
        title: '📦 Export Réussi',
        message: 'Sauvegarde de vos projets téléchargée avec succès.',
        type: 'success',
      });
    } catch (e) {
      triggerToast({
        title: "⚠️ Échec de l'Export",
        message: String(e),
        type: 'error',
      });
    }
  };

  const handleImportConfig = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const importedData = JSON.parse(e.target.result);
        if (!Array.isArray(importedData)) {
          triggerToast({
            title: '⚠️ Format Invalide',
            message: 'Le fichier ne contient pas une liste valide de projets Sprint.',
            type: 'error',
          });
          return;
        }
        if (importedData.some(project => !project || typeof project.id !== 'string' || typeof project.name !== 'string'
          || typeof project.root !== 'string' || !Array.isArray(project.servers))) throw new Error('Configuration invalide');
        setPendingImport({ projects: importedData, name: file.name });
      } catch {
        triggerToast({
          title: "⚠️ Échec de l'Import",
          message: 'Impossible de lire le fichier JSON fourni.',
          type: 'error',
        });
      }
    };
    reader.readAsText(file);
  };

  const restoreImport = async () => {
    if (!pendingImport) return;
    try {
      await invoke('save_projects_cmd', { projects: pendingImport.projects });
      await reloadProjects?.();
      setPendingImport(null);
      triggerToast({ title: 'Projets restaurés', message: 'La sauvegarde a été importée.', type: 'success' });
    } catch (reason) {
      triggerToast({ title: 'Restauration impossible', message: String(reason), type: 'error' });
    }
  };

  const handleDownloadSkill = () => {
    const blob = new Blob([SKILL_MARKDOWN], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'SKILL.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopySkill = async () => {
    try { await navigator.clipboard.writeText(SKILL_MARKDOWN); }
    catch (reason) {
      triggerToast({ title: 'Copie impossible', message: String(reason), type: 'error' });
      return;
    }
    setCopiedSkill(true);
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = setTimeout(() => setCopiedSkill(false), 2000);
    triggerToast({
      title: '📋 Skill IA Copié !',
      message: 'Collez ce contenu dans votre workspace IA.',
      type: 'success',
      duration: 2000,
    });
  };

  const executeResetDefaults = async () => {
    const def = {
      custom_hex: '#a855f7',
      canvas_bg: true,
      auto_restart: false,
      hide_stopped_servers: true,
      clean_ansi_logs: true,
      minimize_to_tray: true,
      notif_windows: true,
      notif_app: true,
      global_shortcut: 'Ctrl+Alt+P',
      autostart: false,
    };
    try {
      await invoke('register_global_shortcut_cmd', {
        shortcut: def.global_shortcut,
      });
      await invoke('set_autostart_cmd', { enable: false });
      await invoke('save_settings_cmd', { settings: def });
    } catch (error) {
      triggerToast({
        title: 'Réinitialisation incomplète',
        message: String(error),
        type: 'error',
      });
      return;
    }
    onPrefsChange({ ...DEFAULT_PREFS, dashboard: { ...DEFAULT_DASHBOARD } });
    setSettings(def);
    setHexDraft('#a855f7');
    applyAccent('#a855f7');
    syncStoredSettings(def);
    showAutoSaved();
    setConfirmReset(false);
    triggerToast({
      title: '🔄 Paramètres Réinitialisés',
      message: 'Toutes les préférences par défaut ont été restaurées.',
      type: 'info',
    });
  };

  const config = dashboardPrefs(prefs?.dashboard);
  const changeDashboard = (patch) => {
    onPrefsChange({ dashboard: { ...config, ...patch } });
    showAutoSaved();
  };
  const moveBlock = (id, direction) => {
    const blocks = [...config.blocks];
    const index = blocks.indexOf(id);
    const target = index + direction;
    if (target < 0 || target >= blocks.length) return;
    [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
    changeDashboard({ blocks });
  };
  const toggleSetting = (key, value) => {
    saveUpdatedSettings({ ...settings, [key]: value });
  };
  const categories = [
    ['appearance', 'Apparence', 'Thème, couleur et confort de lecture.'],
    ['dashboard', 'Tableau de bord', 'Composez votre vue d’ensemble.'],
    ['supervision', 'Serveurs & logs', 'Comportement des serveurs et du journal.'],
    ['system', 'Système', 'Raccourcis, démarrage et notifications.'],
    ['storage', 'Sauvegardes', 'Exportez ou restaurez vos projets.'],
    ['ai-skill', 'Assistants IA', 'Configurez Sprint avec votre assistant.'],
    ['about', 'À propos', 'Version et mises à jour.'],
  ];

  return (
    <div className="page workspace-page settings-page animate-fadeIn">
      <PageHeader
        title="Paramètres"
        lead="Une interface à votre façon."
        actions={
          <button className="quiet-button" onClick={() => setConfirmReset(true)}>
            <RotateCcw size={14} />
            Réinitialiser
          </button>
        }
      />
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Sections des paramètres">
          {categories.map(([id, label]) => (
            <button
              key={id}
              onClick={() => {
                setActiveTab(id);
                contentRef.current?.scrollTo({ top: 0 });
              }}
              aria-current={activeTab === id ? 'page' : undefined}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="settings-content" ref={contentRef}>
          <div className="settings-section-heading">
            <h2>{categories.find(([id]) => id === activeTab)?.[1]}</h2>
            <p>{categories.find(([id]) => id === activeTab)?.[2]}</p>
          </div>
          <div className="settings-save-status" role="status">
            {saveState === 'saving' ? 'Enregistrement…' : saveState === 'error' ? 'Modifications non enregistrées' : savedSuccess ? 'Enregistré' : 'Enregistrement automatique'}
            {saveState === 'error' && <button className="quiet-button" onClick={() => saveUpdatedSettings(settings)}>Réessayer</button>}
          </div>
          {activeTab === 'appearance' && <AppearanceSettings prefs={prefs} onPrefsChange={onPrefsChange} showAutoSaved={showAutoSaved} settings={settings} hexDraft={hexDraft} setHexDraft={setHexDraft} hexError={hexError} setHexError={setHexError} commitHexColor={commitHexColor} toggleSetting={toggleSetting} />}
          {activeTab === 'dashboard' && <DashboardSettings config={config} changeDashboard={changeDashboard} moveBlock={moveBlock} />}
          {activeTab === 'supervision' && <SupervisionSettings settings={settings} toggleSetting={toggleSetting} />}
          {activeTab === 'system' && <SystemSettings settings={settings} handleUpdateShortcut={handleUpdateShortcut} toggleAutoStart={toggleAutoStart} toggleSetting={toggleSetting} />}
          {activeTab === 'storage' && <StorageSettings projects={projects} configDirPath={configDirPath} handleOpenConfigDir={handleOpenConfigDir} handleExportConfig={handleExportConfig} handleImportConfig={handleImportConfig} />}
          {activeTab === 'ai-skill' && <AssistantSettings copiedSkill={copiedSkill} handleCopySkill={handleCopySkill} handleDownloadSkill={handleDownloadSkill} />}
          {activeTab === 'about' && <AboutSettings onOpenUpdateModal={onOpenUpdateModal} />}
        </div>
      </div>
      <ConfirmDialog
        open={!!pendingImport}
        title="Restaurer cette sauvegarde ?"
        message={pendingImport ? `${pendingImport.name} contient ${pendingImport.projects.length} projet(s). Cette liste remplacera vos ${projects.length} projet(s) actuels. Les fichiers et les serveurs en marche sont conservés.` : ''}
        confirmLabel="Restaurer les projets"
        onConfirm={restoreImport}
        onCancel={() => setPendingImport(null)}
      />
      <ConfirmDialog
        open={confirmReset}
        title="Réinitialiser les paramètres ?"
        message="Restaurer les préférences d’affichage, les réglages du tableau de bord et les options de Sprint. Vos projets sont conservés."
        confirmLabel="Réinitialiser"
        onConfirm={executeResetDefaults}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}
