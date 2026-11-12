import React, { useState } from 'react';
import SettingRow from '../../components/ui/SettingRow';
import { invoke } from '@tauri-apps/api/core';
import { APP_VERSION, GITHUB_REPO } from '../../lib/updates';
import McpConnectModal, { McpMark } from '../../components/modals/McpConnectModal';

export default function AboutSettings({ onOpenUpdateModal }) {
  const [mcpOpen, setMcpOpen] = useState(false);
  return (
    <>
      <SettingRow title="Sprint" description={'Version ' + APP_VERSION}>
        <button className="btn" onClick={onOpenUpdateModal}>
          Mises à jour
        </button>
      </SettingRow>
      <SettingRow title="Code source" description="Le projet et ses versions, sur GitHub.">
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
      <SettingRow
        title="Connecter une IA"
        description="Branche Sprint dans Claude Code, Cursor ou Codex."
      >
        <button type="button" className="btn" onClick={() => setMcpOpen(true)}>
          <McpMark />
          MCP
        </button>
      </SettingRow>
      <McpConnectModal isOpen={mcpOpen} onClose={() => setMcpOpen(false)} />
    </>
  );
}
