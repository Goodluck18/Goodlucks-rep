/**
 * One command for local development:
 *   1. starts the PHP API on API_PORT (default 8090) using the SQLite dev DB,
 *   2. starts the Vite/Express host on PORT (default 3000) which proxies /api.
 *
 * Ctrl+C stops both.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { runPhpScript, startApiServer } from './php.mjs';

const root = path.resolve(import.meta.dirname, '..');
const apiPort = Number(process.env.API_PORT || 8090);
const appPort = Number(process.env.PORT || 3000);

const api = await startApiServer({ port: apiPort, quiet: true });
console.log(`[dev] PHP API ready on http://127.0.0.1:${api.port}`);

// Give the seeded demo accounts a local password so the dashboards and the
// admin console are usable straight away (development + SQLite only).
const seeded = runPhpScript('php-backend/dev_accounts.php', [], { APP_ENV: 'development', DB_DRIVER: 'sqlite' });
if (seeded.status === 0 && seeded.stdout.trim() !== '') {
  console.log(seeded.stdout.trim());
} else if (seeded.status !== 0) {
  console.warn('[dev] demo accounts not prepared:\n' + (seeded.stderr || seeded.stdout).trim());
}

const tsx = process.platform === 'win32'
  ? path.join(root, 'node_modules', '.bin', 'tsx.cmd')
  : path.join(root, 'node_modules', '.bin', 'tsx');

const web = spawn(tsx, ['server.ts'], {
  cwd: root,
  env: { ...process.env, PHP_API_URL: `http://127.0.0.1:${api.port}`, PORT: String(appPort) },
  stdio: 'inherit',
});

let shuttingDown = false;
const shutdown = (code = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;
  api.stop();
  web.kill('SIGTERM');
  process.exit(code);
};

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
web.on('exit', (code) => shutdown(code ?? 0));
