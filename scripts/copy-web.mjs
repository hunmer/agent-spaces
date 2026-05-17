import { cpSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const webOut = resolve(root, 'packages/web/out');
const serverWeb = resolve(root, 'packages/server/web');
const serverDistWeb = resolve(root, 'packages/server/dist/web');

if (!existsSync(webOut)) {
  console.error('[copy-web] packages/web/out not found. Run `pnpm build` first.');
  process.exit(1);
}

if (existsSync(serverWeb)) {
  rmSync(serverWeb, { recursive: true, force: true });
}

cpSync(webOut, serverWeb, { recursive: true });
if (existsSync(serverDistWeb)) {
  rmSync(serverDistWeb, { recursive: true, force: true });
}
cpSync(webOut, serverDistWeb, { recursive: true });

const tauriWeb = resolve(root, 'packages/tauri/web');
if (existsSync(tauriWeb)) {
  rmSync(tauriWeb, { recursive: true, force: true });
}
cpSync(webOut, tauriWeb, { recursive: true });

const flutterWeb = resolve(root, 'packages/flutter/assets/web');
if (existsSync(flutterWeb)) {
  rmSync(flutterWeb, { recursive: true, force: true });
}
cpSync(webOut, flutterWeb, { recursive: true });

console.log('[copy-web] packages/web/out -> packages/server/web + packages/server/dist/web + packages/tauri/web + packages/flutter/web');
