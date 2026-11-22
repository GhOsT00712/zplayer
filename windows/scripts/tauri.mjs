import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const frontend = fileURLToPath(new URL('../', import.meta.url));
const nativeApp = fileURLToPath(new URL('../app/src-tauri/', import.meta.url));
const [command, ...args] = process.argv.slice(2);
// An embedded Vite build is necessary to measure Tauri's app origin.
if (command === 'dev' && !args.includes('--no-dev-server')) args.push('--no-dev-server');
const result = spawnSync(process.execPath, [
  require.resolve('@tauri-apps/cli/tauri.js'), ...[command, ...args].filter(Boolean),
], {
  cwd: frontend,
  env: { ...process.env, TAURI_FRONTEND_PATH: frontend, TAURI_APP_PATH: nativeApp },
  stdio: 'inherit',
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
