import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

// Test the same embedded context used by Sprint, after Vite has generated dist/.
// A corrupt compression cache must stop packaging, even if the files exist.
for (const args of [['run', 'build'], ['run', 'test:embedded']]) {
  const result = spawnSync(process.execPath, [process.env.npm_execpath, ...args], {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
