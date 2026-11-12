import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectProject, connectProject, listProjects } from './server.mjs';

const root = mkdtempSync(path.join(os.tmpdir(), 'sprint-mcp-'));
const project = path.join(root, 'demo');
const config = path.join(root, 'config');
mkdirSync(project, { recursive: true });
writeFileSync(path.join(project, 'package.json'), JSON.stringify({
  name: 'demo',
  scripts: { dev: 'vite', tauri: 'tauri' },
  dependencies: { react: '19.0.0', '@tauri-apps/api': '2.0.0' },
  devDependencies: { vite: '8.0.0' },
}));
mkdirSync(path.join(project, 'src-tauri'), { recursive: true });
writeFileSync(path.join(project, 'src-tauri', 'tauri.conf.json'), JSON.stringify({
  build: { devUrl: 'http://localhost:5173' },
}));
writeFileSync(path.join(project, 'vite.config.js'), 'export default { server: { port: 5173 } }\n');
process.env.SPRINT_CONFIG_DIR = config;

const inspected = inspectProject(project);
assert.equal(inspected.ok, true);
assert.equal(inspected.framework, 'Tauri');
assert.equal(inspected.command, 'npm run tauri dev');
assert.equal(inspected.port, 5173);
assert.equal(inspected.portSource, 'tauri.conf.json build.devUrl');

const first = connectProject({ root: project });
assert.equal(first.ok, true);
assert.equal(first.created, true);
assert.equal(first.project.servers.length, 1);
assert.equal(first.project.servers[0].command, 'npm run tauri dev');
assert.equal(first.project.servers[0].port, 5173);
assert.equal(first.project.servers[0].ramLimit, 500);

const again = connectProject({ root: project });
assert.equal(again.created, false);
assert.equal(again.project.servers.length, 1);
assert.match(again.note, /Aucun doublon/);

const renamed = connectProject({ root: project, name: 'Démo' });
assert.equal(renamed.project.name, 'Démo');
assert.equal(renamed.project.servers.length, 1);
assert.equal(renamed.project.servers[0].command, 'npm run tauri dev');

const listed = listProjects();
assert.equal(listed.projects.length, 1);

const file = path.join(config, 'projects.json');
writeFileSync(file, '{ pas du json');
const before = readFileSync(file, 'utf8');
const refused = connectProject({ root: project });
assert.equal(refused.ok, false);
assert.equal(readFileSync(file, 'utf8'), before);
assert.equal(existsSync(`${file}.bak`), true);

const server = spawn(process.execPath, [fileURLToPath(new URL('./server.mjs', import.meta.url))], {
  stdio: ['pipe', 'pipe', 'pipe'],
});
let buffer = '';
const messages = [];
server.stdout.on('data', (chunk) => {
  buffer += chunk.toString();
  const lines = buffer.split('\n');
  buffer = lines.pop();
  for (const line of lines) if (line.trim()) messages.push(JSON.parse(line));
});
const send = (message) => server.stdin.write(`${JSON.stringify(message)}\n`);
send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {} } });
send({ jsonrpc: '2.0', method: 'notifications/initialized' });
send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'sprint_inspect', arguments: { root: project } } });

await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('stdio timeout')), 5000);
  server.stdout.on('data', () => {
    if (messages.length >= 3) {
      clearTimeout(timer);
      resolve();
    }
  });
});
server.kill();

assert.equal(messages[0].result.serverInfo.name, 'sprint');
assert.equal(messages[0].result.instructions.includes('projects.json'), true);
assert.deepEqual(messages[1].result.tools.map((tool) => tool.name), ['sprint_list', 'sprint_inspect', 'sprint_connect']);
const inspectedByTool = JSON.parse(messages[2].result.content[0].text);
assert.equal(inspectedByTool.port, 5173);
assert.equal(messages[2].result.isError, false);

console.log('mcp ok');
