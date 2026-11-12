/** Commandes stdio pour brancher le serveur MCP local de Sprint. */

export function claudeSnippet(serverPath) {
  const quoted = `"${String(serverPath).replace(/"/g, '\\"')}"`;
  return `claude mcp add --transport stdio --scope user sprint -- node ${quoted}`;
}

export function cursorSnippet(serverPath) {
  return `{ "mcpServers": { "sprint": { "command": "node", "args": [${JSON.stringify(serverPath)}] } } }`;
}

function tomlString(value) {
  if (!value.includes("'")) return `'${value}'`;
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function codexSnippet(serverPath) {
  return `[mcp_servers.sprint]\ncommand = "node"\nargs = [${tomlString(serverPath)}]`;
}

export const MCP_CLIENTS = [
  {
    id: 'claude',
    label: 'Claude Code',
    hint: 'À lancer une fois dans un terminal.',
    snippet: claudeSnippet,
  },
  {
    id: 'cursor',
    label: 'Cursor',
    hint: 'À coller dans les réglages MCP de Cursor.',
    snippet: cursorSnippet,
  },
  {
    id: 'codex',
    label: 'Codex',
    hint: 'À coller dans ~/.codex/config.toml.',
    snippet: codexSnippet,
  },
];
