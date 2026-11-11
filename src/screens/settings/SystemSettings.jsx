import React from 'react';
import SettingRow from '../../components/ui/SettingRow';
import ShortcutRecorder from './ShortcutRecorder';


export default function SystemSettings({ settings, handleUpdateShortcut, toggleAutoStart, toggleSetting }) {
  return (
    <>
      <SettingRow
        title="Raccourci global"
        description="Afficher ou masquer Sprint depuis une autre application."
      >
        <ShortcutRecorder
          value={settings.global_shortcut}
          onChange={handleUpdateShortcut}
        />
      </SettingRow>
      <SettingRow
        title="Fermer dans la zone de notification"
        description="La croix masque la fenêtre et laisse vos serveurs en marche."
        checked={settings.minimize_to_tray}
        onToggle={(value) =>
          toggleSetting('minimize_to_tray', value)
        }
      />
      <SettingRow
        title="Lancer avec Windows"
        checked={settings.autostart}
        onToggle={toggleAutoStart}
      />
      <SettingRow
        title="Notifications dans Sprint"
        checked={settings.notif_app}
        onToggle={(value) => toggleSetting('notif_app', value)}
      />
      <SettingRow
        title="Notifications Windows"
        checked={settings.notif_windows}
        onToggle={(value) =>
          toggleSetting('notif_windows', value)
        }
      />
    </>
  );
}
