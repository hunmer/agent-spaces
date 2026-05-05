import { readFileSync, writeFileSync, cpSync, existsSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const src = resolve(root, 'packages/server/package.json');
const dst = resolve(root, 'packages/server/dist/package.json');

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
  scripts: { start: 'node app.js' },
  dependencies: deps,
  pnpm: { onlyBuiltDependencies: ['node-pty', 'protobufjs'] },
  engines: pkg.engines,
};

writeFileSync(dst, JSON.stringify(prod, null, 2) + '\n');

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
