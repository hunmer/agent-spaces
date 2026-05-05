import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const src = resolve(root, 'packages/server/package.json');
const dst = resolve(root, 'packages/server/dist/package.json');

const pkg = JSON.parse(readFileSync(src, 'utf8'));

const prod = {
  name: pkg.name,
  version: pkg.version,
  type: pkg.type,
  main: 'app.js',
  scripts: { start: 'node app.js' },
  dependencies: pkg.dependencies,
  engines: pkg.engines,
};

writeFileSync(dst, JSON.stringify(prod, null, 2) + '\n');
console.log('[copy-package] packages/server/package.json -> packages/server/dist/package.json');
