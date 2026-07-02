import fs from 'node:fs';

const failures = [];

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function ensure(condition, message) {
  if (!condition) failures.push(message);
}

function includesAll(text, required, label) {
  for (const item of required) {
    ensure(text.includes(item), `${label} missing: ${item}`);
  }
}

const pkg = readJson('package.json');
ensure(pkg.type === 'module', 'package.json type must be module');
ensure(typeof pkg.packageManager === 'string' && pkg.packageManager.startsWith('pnpm@'), 'packageManager must be pnpm');
ensure(pkg.scripts?.dev?.includes('--host 0.0.0.0'), 'dev script must bind 0.0.0.0');
ensure(pkg.scripts?.dev?.includes('--strictPort'), 'dev script must use --strictPort');
ensure(pkg.scripts?.preview?.includes('--host 0.0.0.0'), 'preview script must bind 0.0.0.0');
ensure(pkg.scripts?.preview?.includes('--strictPort'), 'preview script must use --strictPort');
ensure(pkg.scripts?.['verify:dev-runtime'] === 'node scripts/verify-dev-runtime.js', 'verify:dev-runtime script mismatch');

const dockerfile = fs.readFileSync('Dockerfile', 'utf8');
includesAll(
  dockerfile,
  [
    'FROM node:22-alpine',
    'WORKDIR /app',
    'apk add --no-cache git ca-certificates',
    'corepack enable && corepack prepare pnpm@10.26.2 --activate',
    'EXPOSE 5173',
    'CMD ["node", "scripts/dev-supervisor.js"]'
  ],
  'Dockerfile'
);

const envExample = fs.readFileSync('.env.example', 'utf8');
includesAll(
  envExample,
  [
    'VITE_APP_NAME=RiverX App',
    'VITE_API_BASE_URL=/api',
    'VITE_DEV=true',
    'NEXT_DEV=true',
    'PORT=5173',
    'HEALTHCHECK_PATH=/',
    'GIT_BOOTSTRAP=false',
    'GIT_POLL=true',
    'GIT_POLL_INTERVAL=2000',
    'PREVIEW_BRANCH=main',
    'REPO_URL=',
    'DATABASE_URL=',
    'DB_MIGRATE_RETRY_MS=3000',
    'DB_MIGRATE_CONNECT_TIMEOUT_SEC=10',
    'PGCONNECT_TIMEOUT=10',
    'DATABASE_SSL=false'
  ],
  '.env.example'
);

const supervisor = fs.readFileSync('scripts/dev-supervisor.js', 'utf8');
includesAll(
  supervisor,
  [
    'VITE_DEV',
    'NEXT_DEV',
    "process.env.PORT || 5173",
    "'--host', HOST",
    "'--strictPort'",
    "'--port', String(PORT)",
    'HEALTHCHECK_PATH',
    'GIT_BOOTSTRAP',
    'GIT_POLL'
  ],
  'scripts/dev-supervisor.js'
);

const runtimeConfig = fs.readFileSync('assets/js/runtime-config.js', 'utf8');
includesAll(
  runtimeConfig,
  ['import.meta.env.VITE_APP_NAME', 'import.meta.env.VITE_API_BASE_URL', 'window.__APP_CONFIG__'],
  'assets/js/runtime-config.js'
);

if (failures.length > 0) {
  console.error('verify:dev-runtime failed');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('verify:dev-runtime passed');
