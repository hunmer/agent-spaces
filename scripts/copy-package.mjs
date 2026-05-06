import { readFileSync, writeFileSync, cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const src = resolve(root, 'packages/server/package.json');
const dst = resolve(root, 'packages/server/dist/package.json');
const distDir = dirname(dst);
const pnpmVersion = '10.17.1';

const pkg = JSON.parse(readFileSync(src, 'utf8'));

const deps = { ...pkg.dependencies };
if (deps['@agent-spaces/shared'] === 'workspace:*') {
  deps['@agent-spaces/shared'] = 'file:./shared';
}
deps.zod = '^4.0.0';

const prod = {
  name: pkg.name,
  version: pkg.version,
  type: pkg.type,
  main: 'app.js',
  packageManager: `pnpm@${pnpmVersion}`,
  scripts: { start: 'NODE_ENV=production node app.js', setup: 'bash ./install.sh' },
  dependencies: deps,
  pnpm: {
    overrides: {
      '@codeany/open-agent-sdk>zod': '3.25.76',
      '@codeany/open-agent-sdk>zod-to-json-schema': '3.24.6',
    },
    onlyBuiltDependencies: ['node-pty', 'protobufjs'],
    supportedArchitectures: {
      os: ['current'],
      cpu: ['current'],
      libc: ['current'],
    },
  },
  engines: pkg.engines,
};

mkdirSync(distDir, { recursive: true });
writeFileSync(dst, JSON.stringify(prod, null, 2) + '\n');
writeFileSync(
  resolve(root, 'packages/server/dist/.npmrc'),
  [
    'shamefully-hoist=true',
    'strict-peer-dependencies=false',
    'only-built-dependencies[]=node-pty',
    'only-built-dependencies[]=protobufjs',
    '',
  ].join('\n'),
);
writeFileSync(
  resolve(root, 'packages/server/dist/install.sh'),
  `#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "$0")"

cat > .npmrc <<'EOF'
shamefully-hoist=true
strict-peer-dependencies=false
only-built-dependencies[]=node-pty
only-built-dependencies[]=protobufjs
EOF

node <<'NODE'
const fs = require('node:fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.pnpm ??= {};
pkg.pnpm.overrides = {
  '@codeany/open-agent-sdk>zod': '3.25.76',
  '@codeany/open-agent-sdk>zod-to-json-schema': '3.24.6',
};
pkg.pnpm.onlyBuiltDependencies = ['node-pty', 'protobufjs'];
pkg.pnpm.supportedArchitectures = {
  os: ['current'],
  cpu: ['current'],
  libc: ['current'],
};
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\\n');
NODE

if ! command -v pnpm >/dev/null 2>&1; then
  corepack enable
fi

pnpm_cmd=(corepack pnpm@${pnpmVersion})

rm -rf node_modules pnpm-lock.yaml
"\${pnpm_cmd[@]}" install --prod --ignore-scripts
"\${pnpm_cmd[@]}" rebuild node-pty protobufjs

if find node_modules/.pnpm -maxdepth 1 -name 'zod-to-json-schema@3.25.2_zod@3.23.0' | grep -q .; then
  echo "Bad zod peer resolution remains: zod-to-json-schema@3.25.2_zod@3.23.0" >&2
  exit 1
fi

"\${pnpm_cmd[@]}" ignored-builds
if find node_modules/.pnpm -maxdepth 1 \\( -name '@openai+codex@*-darwin-*' -o -name '@openai+codex@*-win32-*' -o -name '@anthropic-ai+claude-agent-sdk-darwin-*' -o -name '@anthropic-ai+claude-agent-sdk-win32-*' \\) | grep -q .; then
  echo "Unexpected non-Linux agent platform package was installed" >&2
  exit 1
fi

node <<'NODE'
const packagesByPlatform = {
  'darwin-arm64': '@anthropic-ai/claude-agent-sdk-darwin-arm64',
  'darwin-x64': '@anthropic-ai/claude-agent-sdk-darwin-x64',
  'linux-arm64-glibc': '@anthropic-ai/claude-agent-sdk-linux-arm64',
  'linux-arm64-musl': '@anthropic-ai/claude-agent-sdk-linux-arm64-musl',
  'linux-x64-glibc': '@anthropic-ai/claude-agent-sdk-linux-x64',
  'linux-x64-musl': '@anthropic-ai/claude-agent-sdk-linux-x64-musl',
  'win32-arm64': '@anthropic-ai/claude-agent-sdk-win32-arm64',
  'win32-x64': '@anthropic-ai/claude-agent-sdk-win32-x64',
};

const libc = process.platform === 'linux'
  ? (process.report?.getReport?.().header?.glibcVersionRuntime ? 'glibc' : 'musl')
  : undefined;
const key = [process.platform, process.arch, libc].filter(Boolean).join('-');
const claudePackage = packagesByPlatform[key];

Promise.resolve()
  .then(() => import('zod-to-json-schema'))
  .then(() => import('@codeany/open-agent-sdk'))
  .then(() => require('node-pty'))
  .then(() => {
    if (!claudePackage) return;
    require.resolve(claudePackage + '/claude');
  })
  .then(() => console.log('install verification ok'))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
NODE

echo "Install complete. Start with: npm run start"
`,
);

// Copy shared/dist into server/dist/shared so file:./shared resolves
const sharedDistDir = resolve(root, 'packages/server/dist/shared');
const sharedSrcDir = resolve(root, 'packages/shared');
if (existsSync(sharedDistDir)) rmSync(sharedDistDir, { recursive: true });
cpSync(sharedSrcDir, sharedDistDir, {
  recursive: true,
  filter: (src) => {
    const rel = src.slice(sharedSrcDir.length);
    return !rel.includes('/node_modules/') && !rel.startsWith('/node_modules');
  },
});

// Write a minimal package.json in the copied shared dir
const sharedPkg = JSON.parse(readFileSync(resolve(sharedSrcDir, 'package.json'), 'utf8'));
writeFileSync(
  resolve(sharedDistDir, 'package.json'),
  JSON.stringify({ name: sharedPkg.name, version: sharedPkg.version, type: sharedPkg.type, main: sharedPkg.main, exports: sharedPkg.exports }, null, 2) + '\n',
);

console.log('[copy-package] packages/server/dist/package.json + shared/');
