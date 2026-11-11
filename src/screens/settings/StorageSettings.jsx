import React from 'react';
import SettingRow from '../../components/ui/SettingRow';


export default function StorageSettings({ projects, configDirPath, handleOpenConfigDir, handleExportConfig, handleImportConfig }) {
  return (
    <>
      <SettingRow title="Dossier de configuration" description={configDirPath}>
        <button className="btn" onClick={handleOpenConfigDir}>
          Ouvrir le dossier
        </button>
      </SettingRow>
      <SettingRow
        title="Exporter les projets"
        description="Télécharger la configuration des projets au format JSON."
      >
        <button className="btn" onClick={handleExportConfig}>
          Exporter
        </button>
      </SettingRow>
      <SettingRow
        title="Restaurer une sauvegarde"
        description="Remplacer la liste de projets par une sauvegarde JSON."
      >
        <label className="btn">
          Importer
          <input
            aria-label="Importer une sauvegarde"
            type="file"
            accept=".json"
            onChange={handleImportConfig}
            className="sr-only"
          />
        </label>
      </SettingRow>
      <p className="settings-note">
        {projects.length} projets enregistrés ·{' '}
        {projects.reduce((count, project) => count + (project.servers || []).length, 0)}{' '}
        serveurs configurés
      </p>
    </>
  );
}
