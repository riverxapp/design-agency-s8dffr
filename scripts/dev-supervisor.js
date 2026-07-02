import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const PORT = Number(process.env.PORT || 5173);
const HOST = process.env.HOST || '0.0.0.0';
const HEALTHCHECK_PATH = process.env.HEALTHCHECK_PATH || '/';
const VITE_DEV = String(process.env.VITE_DEV || 'true') === 'true';
const NEXT_DEV = String(process.env.NEXT_DEV || 'true') === 'true';
const GIT_BOOTSTRAP = String(process.env.GIT_BOOTSTRAP || 'false') === 'true';
const GIT_POLL = String(process.env.GIT_POLL || 'true') === 'true';
const GIT_POLL_INTERVAL = Number(process.env.GIT_POLL_INTERVAL || 2000);
const PREVIEW_BRANCH = process.env.PREVIEW_BRANCH || 'main';
const REPO_URL = process.env.REPO_URL || '';

const mode = VITE_DEV || NEXT_DEV ? 'dev' : 'preview';
let serverProcess;
let stopping = false;

function runCommand(cmd, args, opts = {}) {
  return spawn(cmd, args, {
    stdio: 'inherit',
    shell: false,
    env: process.env,
    ...opts
  });
}

function runGitBootstrap() {
  if (!GIT_BOOTSTRAP) return;
  if (!REPO_URL) {
    console.warn('[dev-supervisor] GIT_BOOTSTRAP is true but REPO_URL is empty; skipping bootstrap');
    return;
  }
  const init = runCommand('git', ['init']);
  init.on('exit', () => {
    runCommand('git', ['remote', 'remove', 'origin']).on('exit', () => {
      runCommand('git', ['remote', 'add', 'origin', REPO_URL]).on('exit', () => {
        runCommand('git', ['fetch', 'origin', PREVIEW_BRANCH]).on('exit', () => {
          runCommand('git', ['reset', '--hard', `origin/${PREVIEW_BRANCH}`]);
        });
      });
    });
  });
}

function runGitPoll() {
  if (!GIT_POLL) return;
  const poll = async () => {
    while (!stopping) {
      const fetch = runCommand('git', ['fetch', 'origin', PREVIEW_BRANCH], { stdio: 'ignore' });
      await new Promise((resolve) => fetch.on('exit', resolve));
      await delay(GIT_POLL_INTERVAL);
    }
  };
  poll().catch((err) => console.error('[dev-supervisor] git poll failed', err));
}

async function warmup() {
  const base = `http://${HOST === '0.0.0.0' ? '127.0.0.1' : HOST}:${PORT}`;
  const url = new URL(HEALTHCHECK_PATH, base);

  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        console.log(`[dev-supervisor] warmup success: ${url}`);
        return;
      }
    } catch {
      // wait for server boot
    }
    await delay(1000);
  }

  console.warn(`[dev-supervisor] warmup timed out: ${url}`);
}

function startServer() {
  const args = [mode, '--host', HOST, '--strictPort', '--port', String(PORT)];
  serverProcess = runCommand('pnpm', ['vite', ...args]);

  serverProcess.on('exit', (code, signal) => {
    if (!stopping) {
      console.error(`[dev-supervisor] server exited unexpectedly (code=${code}, signal=${signal})`);
      process.exit(code || 1);
    }
  });
}

function shutdown(signal) {
  stopping = true;
  console.log(`[dev-supervisor] received ${signal}, shutting down`);
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill('SIGTERM');
  }
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

runGitBootstrap();
runGitPoll();
startServer();
warmup().catch((err) => console.warn('[dev-supervisor] warmup failed', err));
