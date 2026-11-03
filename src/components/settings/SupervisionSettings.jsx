import React from 'react';
import SettingRow from '../ui/SettingRow';


export default function SupervisionSettings({ settings, toggleSetting }) {
  return (
    <>
      <SettingRow
        title="Relancer après un crash"
        description="Jusqu’à 3 tentatives en 2 minutes pour éviter les relances en boucle."
        checked={settings.auto_restart}
        onToggle={(value) => toggleSetting('auto_restart', value)}
      />
      <details className="settings-disclosure">
        <summary>Options des logs</summary>
        <SettingRow
          title="Masquer les serveurs arrêtés"
          description="Le journal s’ouvre sur les serveurs actifs. Vous pouvez toujours afficher les autres."
          checked={settings.hide_stopped_servers}
          onToggle={(value) => toggleSetting('hide_stopped_servers', value)}
        />
        <SettingRow
          title="Nettoyer les codes ANSI"
          description="Garder des logs lisibles, avec les erreurs et succès en couleur."
          checked={settings.clean_ansi_logs}
          onToggle={(value) => toggleSetting('clean_ansi_logs', value)}
        />
      </details>
      <p className="settings-note">
        Les limites de mémoire se règlent pour chaque serveur dans Projets.
      </p>
    </>
  );
}
