/**
 * Shared helpers for running the PHP API in development and in CI.
 *
 * Uses a real PHP binary when one is available (recommended), and falls back to
 * the PHP-WASM CLI (dev dependency) so the app also runs in environments
 * without PHP installed, such as this sandbox.
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const projectRoot = path.resolve(import.meta.dirname, '..');

/** @returns {{cmd: string, baseArgs: string[], kind: 'native'|'wasm'}} */
export function phpCommand() {
  if (process.env.PHP_BINARY && existsSync(process.env.PHP_BINARY)) {
    return { cmd: process.env.PHP_BINARY, baseArgs: [], kind: 'native' };
  }

  const probe = spawnSync('php', ['-r', 'echo PHP_VERSION;'], { encoding: 'utf8' });
  if (!probe.error && probe.status === 0) {
    return { cmd: 'php', baseArgs: [], kind: 'native' };
  }

  const wasm = path.join(projectRoot, 'node_modules', '.bin', 'php-wasm-cli');
  if (existsSync(wasm)) {
    return { cmd: wasm, baseArgs: [], kind: 'wasm' };
  }

  throw new Error(
    'No PHP runtime found. Install PHP 8.1+ (cli with pdo_mysql/pdo_sqlite) or run "npm install" to get the PHP-WASM fallback.'
  );
}

/**
 * Build the environment used by the API server.
 */
export function apiEnv(overrides = {}) {
  return {
    ...process.env,
    APP_ENV: process.env.APP_ENV || 'development',
    DB_DRIVER: process.env.DB_DRIVER || 'sqlite',
    DB_SQLITE_PATH: process.env.DB_SQLITE_PATH || path.join(projectRoot, '.data', 'dev.sqlite'),
    ...overrides,
  };
}

/**
 * Start the PHP built-in server pointing at the API front controller.
 *
 * @returns {Promise<{process: import('node:child_process').ChildProcess, port: number, stop: () => void}>}
 */
export async function startApiServer({ port = Number(process.env.API_PORT || 8080), env = {}, quiet = false } = {}) {
  const { cmd, baseArgs } = phpCommand();
  const args = [
    ...baseArgs,
    '-S', `0.0.0.0:${port}`,
    '-t', path.join(projectRoot, 'php-backend'),
    path.join(projectRoot, 'php-backend', 'router.php'),
  ];

  const child = spawn(cmd, args, {
    cwd: projectRoot,
    env: apiEnv(env),
    stdio: quiet ? 'ignore' : ['ignore', 'pipe', 'pipe'],
  });

  child.on('error', (err) => {
    console.error('[php api] failed to start:', err.message);
  });

  if (!quiet) {
    child.stderr?.on('data', (chunk) => {
      const text = String(chunk);
      // The built-in server is chatty about connection polling; keep real errors.
      if (/PHP (Fatal|Parse|Warning|Notice)|error/i.test(text)) {
        process.stderr.write(`[php api] ${text}`);
      }
    });
  }

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForHealth(baseUrl);

  return {
    process: child,
    port,
    baseUrl,
    stop: () => {
      try {
        child.kill('SIGTERM');
      } catch {
        /* ignore */
      }
    },
  };
}

async function waitForHealth(baseUrl, timeoutMs = 30_000) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(4000) });
      if (response.ok) {
        return;
      }
      lastError = new Error(`health returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`PHP API did not become healthy at ${baseUrl}: ${lastError?.message}`);
}

/**
 * Run a PHP CLI script (used for admin bootstrap and migrations).
 */
export function runPhpScript(script, args = [], env = {}) {
  const { cmd, baseArgs } = phpCommand();
  const result = spawnSync(cmd, [...baseArgs, path.join(projectRoot, script), ...args], {
    cwd: projectRoot,
    env: apiEnv(env),
    encoding: 'utf8',
    timeout: 120_000,
  });
  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error,
  };
}
