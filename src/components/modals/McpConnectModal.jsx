import React, { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { X } from 'lucide-react';
import Modal from '../ui/Modal';
import { triggerToast } from '../../lib/toastBus';
import { MCP_CLIENTS } from '../../lib/mcpSnippets';
import mascot from '../../../assets/branding/sprint-mascot-transparent.png';

export function McpMark({ large = false }) {
  return (
    <span className={large ? 'mcp-mark mcp-mark-lg' : 'mcp-mark'}>
      <img src={mascot} alt="" draggable="false" />
    </span>
  );
}

export default function McpConnectModal({ isOpen, onClose }) {
  const [clientId, setClientId] = useState('claude');
  const [serverPath, setServerPath] = useState(null);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef(null);

  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  useEffect(() => {
    if (!isOpen) return undefined;
    setClientId('claude');
    setCopied(false);
    setServerPath(null);
    let cancelled = false;
    invoke('mcp_server_path_cmd')
      .then((path) => {
        if (!cancelled) setServerPath(typeof path === 'string' ? path : '');
      })
      .catch(() => {
        if (!cancelled) setServerPath('');
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const client = MCP_CLIENTS.find((item) => item.id === clientId) || MCP_CLIENTS[0];
  const snippet = serverPath ? client.snippet(serverPath) : '';
  const snippetText = serverPath
    ? snippet
    : serverPath === ''
      ? 'Le fichier mcp/server.mjs est introuvable.'
      : 'Recherche du serveur local…';

  const selectClient = (id) => {
    setClientId(id);
    setCopied(false);
    clearTimeout(copiedTimer.current);
  };

  const copy = async () => {
    if (!snippet) return;
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 1600);
    } catch (error) {
      triggerToast({ title: 'Copie impossible', message: String(error), type: 'error' });
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="max-w-xl" labelledBy="mcp-connect-title">
      <div className="mcp-connect">
        <div className="mcp-connect-head">
          <McpMark large />
          <h2 id="mcp-connect-title">MCP</h2>
          <button type="button" className="icon-button mcp-connect-close" onClick={onClose} aria-label="Fermer">
            <X size={16} />
          </button>
        </div>
        <div className="segmented-control" role="group" aria-label="Outil d’IA">
          {MCP_CLIENTS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={item.id === client.id}
              onClick={() => selectClient(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <p className="mcp-connect-hint">{client.hint}</p>
        <pre className="mcp-connect-snippet" aria-label="Commande à copier">{snippetText}</pre>
        <div className="mcp-connect-actions">
          <button type="button" className="btn mcp-connect-copy" onClick={copy} disabled={!snippet} aria-live="polite">
            {copied ? 'Copié' : 'Copier'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
