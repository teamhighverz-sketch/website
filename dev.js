// dev.js - Fast, lightweight dev runner without heavy concurrently overhead
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('\n\x1b[36m%s\x1b[0m', '═══════════════════════════════════════════════════');
console.log('\x1b[36m%s\x1b[0m', '   ⚡ STARTING HIGHVERZ (Vite + API)...           ');
console.log('\x1b[36m%s\x1b[0m', '═══════════════════════════════════════════════════\n');

// 1. Start Express API server. Keep Vite available and recover the API if its
// child process is stopped unexpectedly (for example, by a signal).
let api = null;
let apiRestartTimer = null;
let apiRestartDelay = 1000;
let isShuttingDown = false;

function startApi() {
  if (isShuttingDown) return;

  api = spawn(process.execPath, [path.join(__dirname, 'server/index.js')], {
    stdio: 'inherit',
    env: { ...process.env, FORCE_COLOR: '1' }
  });

  api.on('error', (error) => {
    console.error('[API] Failed to start:', error.message);
  });

  api.once('exit', (code, signal) => {
    if (isShuttingDown) return;
    console.error(`[API] Exited unexpectedly (code ${code ?? 'none'}, signal ${signal ?? 'none'}). Restarting in ${apiRestartDelay / 1000}s...`);
    apiRestartTimer = setTimeout(startApi, apiRestartDelay);
    apiRestartDelay = Math.min(apiRestartDelay * 2, 10000);
  });
}

startApi();

// 2. Start Vite dev server directly via binary
const viteBin = path.join(__dirname, 'node_modules/vite/bin/vite.js');
const vite = spawn(process.execPath, [viteBin, '--host'], {
  stdio: 'inherit',
  env: { ...process.env, FORCE_COLOR: '1' }
});

function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log('\n\x1b[33m%s\x1b[0m', 'Shutting down Highverz dev servers...');
  try { api.kill('SIGTERM'); } catch (_) {}
  if (apiRestartTimer) clearTimeout(apiRestartTimer);
  try { vite.kill('SIGTERM'); } catch (_) {}
  setTimeout(() => {
    try { api.kill('SIGKILL'); } catch (_) {}
    try { vite.kill('SIGKILL'); } catch (_) {}
    process.exit(0);
  }, 300);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('exit', shutdown);

vite.on('exit', (code) => {
  if (!isShuttingDown && code !== 0 && code !== null) {
    console.error(`[Vite] Exited with code ${code}`);
    shutdown();
  }
});
