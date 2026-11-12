import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { createInterface } from 'node:readline';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

const INSTRUCTIONS = [
  'Sprint garde ses projets dans %APPDATA%\\sprint\\projects.json.',
  'Pour brancher un dossier, appelle sprint_connect avec le chemin absolu.',
  'N’édite jamais ce fichier toi-même : un JSON invalide est mis en quarantaine et Sprint perd la liste.',
  'Ne devine pas la commande ni le port. sprint_connect les lit dans le projet.',
  'Si le dossier est déjà branché, sprint_connect ne crée pas de doublon.',
].join(' ');

export function configDir() {
  if (process.env.SPRINT_CONFIG_DIR) return process.env.SPRINT_CONFIG_DIR;
  const base = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(base, 'sprint');
}

export function projectsFile() {
  return path.join(configDir(), 'projects.json');
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function hasDep(pkg, name) {
  return Boolean(pkg?.dependencies?.[name] || pkg?.devDependencies?.[name]);
}

function packageManager(root) {
  if (existsSync(path.join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(path.join(root, 'yarn.lock'))) return 'yarn';
  if (existsSync(path.join(root, 'bun.lockb')) || existsSync(path.join(root, 'bun.lock'))) return 'bun';
  return 'npm';
}

function devCommand(manager, script) {
  if (manager === 'pnpm') return `pnpm ${script}`;
  if (manager === 'yarn') return `yarn ${script}`;
  if (manager === 'bun') return `bun ${script}`;
  return script === 'dev' ? 'npm run dev' : `npm run ${script}`;
}

function portInText(text) {
  const match = String(text).match(/(?:--port|-p)(?:=|\s+)(\d{2,5})\b/) || String(text).match(/\bport\s*[:=]\s*(\d{2,5})\b/);
  if (!match) return null;
  const port = Number(match[1]);
  return port >= 1 && port <= 65535 ? port : null;
}

function portFromUrl(value) {
  try {
    const port = Number(new URL(value).port);
    return port >= 1 && port <= 65535 ? port : null;
  } catch {
    return null;
  }
}

function frameworkOf(root, pkg) {
  if (!pkg) {
    if (existsSync(path.join(root, 'Cargo.toml'))) return { framework: 'Rust', command: 'cargo run', port: 8080, portSource: 'défaut Rust' };
    if (existsSync(path.join(root, 'pyproject.toml')) || existsSync(path.join(root, 'requirements.txt'))) {
      return { framework: 'Python', command: 'python main.py', port: 8000, portSource: 'défaut Python' };
    }
    if (existsSync(path.join(root, 'go.mod'))) return { framework: 'Go', command: 'go run .', port: 8080, portSource: 'défaut Go' };
    return { framework: 'Node.js', command: 'npm run dev', port: 3000, portSource: 'défaut Node.js' };
  }

  const manager = packageManager(root);
  let framework = 'Node.js';
  let command = devCommand(manager, 'dev');
  if (hasDep(pkg, 'next')) framework = 'Next.js';
  else if (hasDep(pkg, 'vite')) framework = 'Vite';
  else if (hasDep(pkg, '@nestjs/core')) framework = 'NestJS';
  else if (hasDep(pkg, 'express')) framework = 'Express';
  else if (hasDep(pkg, 'nuxt')) framework = 'Nuxt';
  else if (hasDep(pkg, 'vue')) framework = 'Vue';
  else if (hasDep(pkg, 'svelte') || hasDep(pkg, '@sveltejs/kit')) framework = 'Svelte';
  else if (hasDep(pkg, 'react')) framework = 'React';
  else if (hasDep(pkg, 'tauri') || hasDep(pkg, '@tauri-apps/api')) {
    framework = 'Tauri';
    command = 'cargo tauri dev';
  }

  const tauriFile = ['src-tauri/tauri.conf.json', 'tauri.conf.json']
    .map((file) => path.join(root, file))
    .find((file) => existsSync(file));
  let port = null;
  let portSource = null;
  if (tauriFile) {
    framework = 'Tauri';
    const tauri = readJson(tauriFile);
    port = portFromUrl(tauri?.build?.devUrl);
    portSource = port ? 'tauri.conf.json build.devUrl' : null;
    if (pkg.scripts?.tauri) command = devCommand(manager, 'tauri dev');
    else command = 'cargo tauri dev';
  }

  const fromCommand = portInText(command) || portInText(pkg.scripts?.dev || '');
  if (!port && fromCommand) {
    port = fromCommand;
    portSource = 'script du projet';
  }
  if (!port && (framework === 'Vite' || framework === 'Vue' || framework === 'Svelte' || framework === 'Tauri')) {
    for (const file of ['vite.config.js', 'vite.config.ts', 'vite.config.mjs']) {
      const config = path.join(root, file);
      if (!existsSync(config)) continue;
      const found = portInText(readFileSync(config, 'utf8'));
      if (found) {
        port = found;
        portSource = file;
        break;
      }
    }
  }
  if (!port) {
    port = framework === 'Vite' || framework === 'Vue' || framework === 'Svelte' || framework === 'Tauri' ? 5173 : 3000;
    portSource = `port habituel ${framework}`;
  }
  return { framework, command, port, portSource };
}

export function sameRoot(left, right) {
  const normalize = (value) => path.resolve(value).replace(/[\\/]+$/, '').toLowerCase();
  return normalize(left) === normalize(right);
}

export function inspectProject(root) {
  const resolved = path.resolve(root);
  if (!existsSync(resolved)) {
    return { ok: false, error: `Dossier introuvable : ${resolved}` };
  }
  const pkg = readJson(path.join(resolved, 'package.json'));
  const detected = frameworkOf(resolved, pkg);
  const head = path.join(resolved, '.git', 'HEAD');
  let branch = null;
  if (existsSync(head)) {
    const content = readFileSync(head, 'utf8').trim();
    branch = content.startsWith('ref: refs/heads/') ? content.slice('ref: refs/heads/'.length) : content.slice(0, 7);
  }
  return {
    ok: true,
    root: resolved,
    name: path.basename(resolved),
    framework: detected.framework,
    command: detected.command,
    port: detected.port,
    portSource: detected.portSource,
    branch,
  };
}

function loadProjects() {
  const file = projectsFile();
  if (!existsSync(file)) return { ok: true, projects: [] };
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    if (!Array.isArray(parsed)) return { ok: false, error: 'projects.json n’est pas une liste. Il n’a pas été modifié.' };
    return { ok: true, projects: parsed };
  } catch (error) {
    return { ok: false, error: `projects.json est illisible (${error.message}). Il n’a pas été modifié.` };
  }
}

function persist(projects) {
  const dir = configDir();
  mkdirSync(dir, { recursive: true });
  const file = projectsFile();
  const tmp = `${file}.tmp`;
  const body = `${JSON.stringify(projects, null, 2)}\n`;
  writeFileSync(tmp, body);
  if (existsSync(file)) copyFileSync(file, `${file}.bak`);
  try {
    writeFileSync(file, body);
  } finally {
    if (existsSync(tmp)) unlinkSync(tmp);
  }
  return file;
}

function publicProject(project) {
  return {
    id: project.id,
    name: project.name,
    root: project.root,
    framework: project.framework ?? null,
    servers: (project.servers || []).map((server) => ({
      id: server.id,
      name: server.name,
      command: server.command,
      port: server.port,
      ramLimit: server.ramLimit ?? null,
    })),
  };
}

function validate(projects) {
  const projectIds = new Set();
  const serverIds = new Set();
  for (const project of projects) {
    if (!project.id || projectIds.has(project.id)) return 'Chaque projet doit avoir un identifiant unique.';
    projectIds.add(project.id);
    if (!String(project.name || '').trim() || !String(project.root || '').trim()) return 'Le nom et le dossier du projet sont obligatoires.';
    for (const server of project.servers || []) {
      if (!server.id || serverIds.has(server.id)) return 'Chaque serveur doit avoir un identifiant unique.';
      serverIds.add(server.id);
      if (!String(server.name || '').trim() || !String(server.command || '').trim()) return 'Le nom et la commande du serveur sont obligatoires.';
      if (!(Number.isInteger(server.port) && server.port >= 1 && server.port <= 65535)) return 'Le port TCP doit être un nombre entre 1 et 65535.';
      if (server.ramLimit === 0) return 'La limite RAM doit être supérieure à zéro.';
    }
  }
  return null;
}

export function listProjects() {
  const loaded = loadProjects();
  if (!loaded.ok) return loaded;
  return { ok: true, file: projectsFile(), projects: loaded.projects.map(publicProject) };
}

export function connectProject({ root, name, command, port, serverName } = {}) {
  if (!root) return { ok: false, error: 'Le chemin du dossier est obligatoire.' };
  const inspected = inspectProject(root);
  if (!inspected.ok) return inspected;
  const loaded = loadProjects();
  if (!loaded.ok) return loaded;

  const existing = loaded.projects.find((project) => sameRoot(project.root, inspected.root));
  if (existing && command == null && port == null && name == null && serverName == null) {
    return {
      ok: true,
      created: false,
      file: projectsFile(),
      project: publicProject(existing),
      note: 'Déjà branché. Aucun doublon créé.',
    };
  }

  const nextCommand = command?.trim() || inspected.command;
  const nextPort = port == null ? inspected.port : Number(port);
  const nextName = (name || inspected.name).trim();

  let project;
  let created = false;
  if (existing) {
    const servers = existing.servers?.length ? existing.servers : [];
    const [first, ...rest] = servers;
    const kept = first
      ? [{
          ...first,
          name: serverName?.trim() || first.name,
          command: command != null ? command.trim() : first.command,
          port: port != null ? Number(port) : first.port,
          state: 'stopped',
        }, ...rest]
      : [{
          id: `srv_${randomUUID()}`,
          name: (serverName || 'dev').trim(),
          command: nextCommand,
          port: nextPort,
          state: 'stopped',
          env: {},
          ramLimit: 500,
        }];
    project = { ...existing, name: nextName, framework: existing.framework || inspected.framework, servers: kept };
    loaded.projects = loaded.projects.map((item) => (item.id === existing.id ? project : item));
  } else {
    created = true;
    project = {
      id: `prj_${randomUUID()}`,
      name: nextName,
      root: inspected.root,
      color: '#a855f7',
      framework: inspected.framework,
      branch: inspected.branch,
      servers: [{
        id: `srv_${randomUUID()}`,
        name: (serverName || 'dev').trim(),
        command: nextCommand,
        port: nextPort,
        state: 'stopped',
        env: {},
        ramLimit: 500,
      }],
    };
    loaded.projects.push(project);
  }

  const invalid = validate(loaded.projects);
  if (invalid) return { ok: false, error: invalid };
  const file = persist(loaded.projects);
  return {
    ok: true,
    created,
    file,
    detected: { command: inspected.command, port: inspected.port, portSource: inspected.portSource, framework: inspected.framework },
    project: publicProject(project),
    note: created
      ? 'Enregistré. Si Sprint est ouvert, relance-le pour voir le projet : l’app garde sa liste en mémoire.'
      : 'Déjà branché. Le réglage demandé a été appliqué au projet existant, sans créer de doublon.',
  };
}

const tools = [
  {
    name: 'sprint_list',
    description: 'Liste les projets déjà branchés dans Sprint, sans leurs variables d’environnement.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'sprint_inspect',
    description: 'Lit un dossier et dit quelle commande et quel port Sprint doit utiliser. N’écrit rien.',
    inputSchema: {
      type: 'object',
      properties: { root: { type: 'string', description: 'Chemin absolu du dossier du projet.' } },
      required: ['root'],
      additionalProperties: false,
    },
  },
  {
    name: 'sprint_connect',
    description: 'Branche un dossier dans Sprint. Relit la commande et le port dans le projet, refuse un fichier illisible, et ne crée pas de doublon si le dossier est déjà branché.',
    inputSchema: {
      type: 'object',
      properties: {
        root: { type: 'string', description: 'Chemin absolu du dossier du projet.' },
        name: { type: 'string', description: 'Nom affiché. Par défaut, le nom du dossier.' },
        command: { type: 'string', description: 'Commande explicite. Sans cet argument, Sprint utilise celle détectée.' },
        port: { type: 'integer', description: 'Port explicite. Sans cet argument, Sprint utilise celui détecté.' },
        serverName: { type: 'string', description: 'Nom du serveur. Défaut : dev.' },
      },
      required: ['root'],
      additionalProperties: false,
    },
  },
];

function callTool(name, args) {
  if (name === 'sprint_list') return listProjects();
  if (name === 'sprint_inspect') return inspectProject(args.root);
  if (name === 'sprint_connect') return connectProject(args);
  return { ok: false, error: `Outil inconnu : ${name}` };
}

function reply(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
}

function fail(id, message) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32603, message } })}\n`);
}

function handle(message) {
  if (message.method === 'notifications/initialized' || message.method === 'notifications/cancelled') return;
  if (message.method === 'initialize') {
    reply(message.id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'sprint', version: '0.5.14' },
      instructions: INSTRUCTIONS,
    });
    return;
  }
  if (message.method === 'tools/list') {
    reply(message.id, { tools });
    return;
  }
  if (message.method === 'tools/call') {
    const result = callTool(message.params?.name, message.params?.arguments || {});
    reply(message.id, {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      isError: result.ok === false,
    });
    return;
  }
  if (message.method === 'ping') {
    reply(message.id, {});
    return;
  }
  if (message.id != null) fail(message.id, `Méthode non gérée : ${message.method}`);
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectRun) {
  const input = createInterface({ input: process.stdin });
  input.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      handle(JSON.parse(trimmed));
    } catch (error) {
      process.stderr.write(`${error.message}\n`);
    }
  });
}
