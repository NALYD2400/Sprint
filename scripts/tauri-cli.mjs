import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const tauriBin = require.resolve('@tauri-apps/cli/tauri.js');

const args = process.argv.slice(2);
const separatorIndex = args.indexOf('--');
const cliArgs = separatorIndex === -1 ? args : args.slice(0, separatorIndex);
const hasConfigFlag = cliArgs.some(
  (arg) => arg === '-c' || arg === '--config' || arg.startsWith('--config='),
);

const forwarded = [...args];
if (args[0] === 'dev' && !hasConfigFlag) {
  forwarded.splice(1, 0, '-c', 'src-tauri/tauri.dev.conf.json');
}

const result = spawnSync(process.execPath, [tauriBin, ...forwarded], {
  cwd: root,
  stdio: 'inherit',
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
