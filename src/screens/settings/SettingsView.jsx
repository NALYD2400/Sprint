import { HelpContent } from '../../components/modals/HelpModal';
import AboutSettings from './AboutSettings';
import StorageSettings from './StorageSettings';
import SystemSettings from './SystemSettings';
import SupervisionSettings from './SupervisionSettings';
import DashboardSettings from './DashboardSettings';
import AppearanceSettings from './AppearanceSettings';
import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { RotateCcw, Palette, Activity, SlidersHorizontal, Monitor, Archive, Info, Keyboard } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import SprintNavIcon from '../../components/layout/SprintNavIcon';
import { DEFAULT_PREFS } from '../../lib/prefs';
import { DEFAULT_DASHBOARD, dashboardPrefs } from '../../lib/dashboardPrefs';
import { triggerToast } from '../../lib/toastBus';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { applyAccent } from '../../lib/accent';
import { DEFAULT_SETTINGS, syncStoredSettings, loadStoredSettings, writeStoredSetting } from '../../lib/settingsStorage';

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

  const [savedSuccess, setSavedSuccess] = useState(false);
  const [configDirPath, setConfigDirPath] = useState('%APPDATA%/sprint');
  const [confirmReset, setConfirmReset] = useState(false);
  const [pendingImport, setPendingImport] = useState(null);
  const [saveState, setSaveState] = useState('');
  const saveQueue = useRef(Promise.resolve());
  const saveSequence = useRef(0);

  const savedTimerRef = useRef(null);

  // Load unified settings from Rust backend at launch
  useEffect(() => {
    let disposed = false;
    invoke('get_settings_cmd')
      .then((backendSettings) => {
        if (backendSettings && !disposed && !saveSequence.current) {
          setSettings((prev) => ({ ...prev, ...backendSettings }));
          applyAccent();
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

  const executeResetDefaults = async () => {
    const def = { ...DEFAULT_SETTINGS };
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
    applyAccent();
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
  const toggleSetting = (key, value) => {
    saveUpdatedSettings({ ...settings, [key]: value });
  };
  const categories = [
    ['appearance', 'Apparence', 'Mode sombre, texte et animations.', Palette],
    ['dashboard', 'Tableau de bord', 'Mesures et blocs affichés.', Activity],
    ['supervision', 'Serveurs & logs', 'Relance, journal et serveurs arrêtés.', SlidersHorizontal],
    ['system', 'Système', 'Raccourci, démarrage et notifications.', Monitor],
    ['storage', 'Sauvegardes', 'Exportez ou restaurez vos projets.', Archive],
    ['about', 'À propos', 'Version et mises à jour.', Info],
    ['help', 'Aide et raccourcis', 'Raccourcis clavier et termes utilisés dans Sprint.', Keyboard],
  ];

  return (
    <div className="page workspace-page settings-page">
      <PageHeader
        title="Paramètres" icon={<SprintNavIcon name="settings" active />}
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
          {categories.map(([id, label, description, Icon]) => (
            <button
              key={id}
              onClick={() => {
                setActiveTab(id);
                contentRef.current?.scrollTo({ top: 0 });
              }}
              aria-current={activeTab === id ? 'page' : undefined}
              aria-label={label}
              type="button"
            >
              <span className="settings-nav-icon"><Icon size={16} aria-hidden="true" /></span>
              <span className="settings-nav-copy"><span>{label}</span><small>{description}</small></span>
            </button>
          ))}
        </nav>
        <div className="settings-content" ref={contentRef}>
          <div key={activeTab} className="settings-section-enter">
            <div className="settings-section-top">
            <div className="settings-section-heading">
              <h2>{categories.find(([id]) => id === activeTab)?.[1]}</h2>
              <p>{categories.find(([id]) => id === activeTab)?.[2]}</p>
            </div>
            {(saveState || !['storage', 'about', 'help'].includes(activeTab)) && <div className="settings-save-status" role="status">
              {saveState === 'saving' ? 'Enregistrement…' : saveState === 'error' ? 'Modifications non enregistrées' : savedSuccess ? 'Enregistré' : 'Enregistrement automatique'}
              {saveState === 'error' && <button className="quiet-button" onClick={() => saveUpdatedSettings(settings)}>Réessayer</button>}
            </div>}
            </div>
            {activeTab === 'appearance' && <AppearanceSettings prefs={prefs} onPrefsChange={onPrefsChange} showAutoSaved={showAutoSaved} />}
            {activeTab === 'dashboard' && <DashboardSettings config={config} changeDashboard={changeDashboard} />}
            {activeTab === 'supervision' && <SupervisionSettings settings={settings} toggleSetting={toggleSetting} />}
            {activeTab === 'system' && <SystemSettings settings={settings} handleUpdateShortcut={handleUpdateShortcut} toggleAutoStart={toggleAutoStart} toggleSetting={toggleSetting} />}
            {activeTab === 'storage' && <StorageSettings projects={projects} configDirPath={configDirPath} handleOpenConfigDir={handleOpenConfigDir} handleExportConfig={handleExportConfig} handleImportConfig={handleImportConfig} />}
            {activeTab === 'about' && <AboutSettings onOpenUpdateModal={onOpenUpdateModal} />}
            {activeTab === 'help' && <HelpContent />}
          </div>
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
