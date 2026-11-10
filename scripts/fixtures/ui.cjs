const projects = [
  {
    id: 'project1',
    name: 'Projet avec un nom très long pour vérifier les limites de mise en page',
    root: 'D:/Workspace/Projet',
    framework: 'React',
    branch: 'codex/une-branche-de-developpement-longue',
    servers: [
      {
        id: 'server1',
        name: 'Interface de développement avec un nom long',
        command: 'npm run dev -- --host 0.0.0.0',
        port: 3000,
        state: 'running',
        env: {},
      },
      {
        id: 'server2',
        name: 'API de développement',
        command: 'npm run api',
        port: 3001,
        state: 'running',
        env: {},
      },
      {
        id: 'server3',
        name: 'Serveur arrêté',
        command: 'npm run start',
        port: 3002,
        state: 'stopped',
        env: {},
      },
    ],
  },
];
projects[0].servers.push(
  ...Array.from({ length: 9 }, (_, index) => ({
    id: 'extra' + index,
    name: 'Serveur de test ' + index,
    command: 'npm run dev',
    state: 'stopped',
    port: 3010 + index,
    env: {},
  })),
);
const entry = `import { mockIPC, mockWindows } from '/node_modules/@tauri-apps/api/mocks.js';
import { emit } from '/node_modules/@tauri-apps/api/event.js';
window.__layoutCommands = []; window.__commands = []; window.__emit = emit; window.__failSave = false; window.__trayActivity = 0;
window.__toasts = [];
window.__ports = [
  { port: 135, pid: 900, process_name: 'svchost.exe', protocol: 'TCP', local_address: '[0.0.0.0]:135' },
  { port: 445, pid: 4, process_name: 'System', protocol: 'TCP', local_address: '[::]:445' },
  { port: 3000, pid: 1234, process_name: 'node.exe', protocol: 'TCP', local_address: '[127.0.0.1]:3000' },
  { port: 3001, pid: 1234, process_name: 'node.exe', protocol: 'TCP', local_address: '[0.0.0.0]:3001' },
  { port: 6463, pid: 2222, process_name: 'Discord', protocol: 'TCP', local_address: '[::1]:6463' },
  ...Array.from({length: 30}, (_, i) => ({port: 7000 + i, pid: 4000 + i, process_name: 'Application ' + i, protocol: 'TCP', local_address: '[192.168.1.5]:' + (7000 + i)}))
];
window.addEventListener('sprint-toast', event => window.__toasts.push(event.detail));
mockIPC((cmd, args) => {
  window.__layoutCommands.push(cmd); window.__commands.push({cmd,args}); if (cmd === "save_projects_cmd" && window.__failSave) throw new Error("Test: disque indisponible"); if (cmd === "get_tray_state_cmd") return {projects: [{"id":"p1","name":"SR Editer","servers":[{"id":"s1","name":"Application desktop","port":4313,"state":"running"},{"id":"s2","name":"Site web local","port":3000,"state":"stopped"}]},{"id":"p2","name":"SiteStudio","servers":[{"id":"s3","name":"Web Dev Server","port":5173,"state":"running"},{"id":"s4","name":"Tauri Desktop","port":0,"state":"stopped"}]}],running_count:2,activity:window.__trayActivity};
  if (cmd === 'get_projects_cmd') return ${JSON.stringify(projects)};
  if (cmd === 'get_ports_cmd') { if (window.__failPorts) throw new Error('Scan indisponible'); return window.__ports; }
  if (cmd === 'ping_port_cmd') return window.__portOnline !== false;
  if (cmd === 'start_server_cmd' && window.__failStart) throw new Error('Commande de lancement invalide');
  if (cmd === 'stop_server_cmd' && window.__failStop) throw new Error('Test: arrêt impossible');
  if (cmd === 'start_server_cmd' && window.__holdStart) return new Promise(resolve => { window.__resolveStart = resolve; });
  if (cmd === 'stop_server_cmd' && window.__holdStop) return new Promise(resolve => { window.__resolveStop = resolve; });

  if (cmd === 'get_local_ip_cmd') return '192.168.1.5';
  if (cmd === 'get_settings_cmd') return null;
  if (cmd === 'plugin:dialog|open') return 'D:/Workspace/Projet';
  if (cmd === 'detect_stack_cmd') return {framework: 'React', default_dev_cmd: 'npm run dev', package_manager: 'npm'};
  if (cmd === 'list_env_files_cmd') return ['.env','.env.local'];
  if (cmd === 'read_env_file') return 'PORT=3000\\nTEST_LAYOUT=fixture';
  if (cmd.includes('zoom')) throw new Error('Exercise CSS zoom fallback');
  return null;
}, { shouldMockEvents: true });
mockWindows('main');
await import('/src/main.jsx');
setInterval(() => emit('system-metrics', { cpu_usage: 20, ram_total_mb: 16000, ram_used_mb: 8000, managed_cpu_pct: 12, managed_ram_mb: 256, active_servers_count: 2, server_metrics: {} }), 200);
`;

module.exports = { entry, projects };
