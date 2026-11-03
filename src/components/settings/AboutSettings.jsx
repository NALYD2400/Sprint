import React from 'react';
import SettingRow from '../ui/SettingRow';
import { invoke } from '@tauri-apps/api/core';
import pkg from '../../../package.json';
import AssistantSettings from './AssistantSettings';
import { GITHUB_REPO } from '../../services/updates';


export default function AboutSettings({ onOpenUpdateModal }) {
  return (
    <>
      <SettingRow title="Sprint" description={'Version ' + pkg.version}>
        <button className="btn" onClick={onOpenUpdateModal}>
          Mises à jour
        </button>
      </SettingRow>
      <SettingRow
        title="Code source"
        description="Retrouvez le projet et ses versions sur GitHub."
      >
        <button
          className="btn"
          onClick={() =>
            invoke('open_browser', {
              url: `https://github.com/${GITHUB_REPO}`,
            })
          }
        >
          GitHub
        </button>
      </SettingRow>
      <details className="settings-disclosure">
        <summary>Configurer un assistant IA</summary>
        <AssistantSettings />
      </details>
    </>
  );
}
