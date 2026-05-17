import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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
mkdirSync(dirname(serverDistWeb), { recursive: true });
cpSync(webOut, serverDistWeb, { recursive: true });

const tauriWeb = resolve(root, 'packages/tauri/web');
const tauriProject = resolve(root, 'packages/tauri');
const copiedTargets = ['packages/server/web', 'packages/server/dist/web'];
if (existsSync(tauriProject)) {
  if (existsSync(tauriWeb)) {
    rmSync(tauriWeb, { recursive: true, force: true });
  }
  cpSync(webOut, tauriWeb, { recursive: true });
  copiedTargets.push('packages/tauri/web');
}

const flutterWeb = resolve(root, 'packages/flutter/assets/web');
const flutterPubspec = resolve(root, 'packages/flutter/pubspec.yaml');
if (existsSync(flutterPubspec)) {
  if (existsSync(flutterWeb)) {
    rmSync(flutterWeb, { recursive: true, force: true });
  }
  cpSync(webOut, flutterWeb, { recursive: true });
  copiedTargets.push('packages/flutter/assets/web');

  const webAssetDirs = listAssetDirs(flutterWeb, 'assets/web');
  updateFlutterAssets(flutterPubspec, webAssetDirs);
  console.log(`[copy-web] updated packages/flutter/pubspec.yaml with ${webAssetDirs.length} stable web asset directories`);
}

console.log(`[copy-web] packages/web/out -> ${copiedTargets.join(' + ')}`);

function listAssetDirs(absDir, assetPath) {
  const dirs = shouldIncludeAssetDir(assetPath) ? [`${assetPath}/`] : [];
  const entries = readdirSync(absDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    dirs.push(...listAssetDirs(resolve(absDir, entry.name), `${assetPath}/${entry.name}`));
  }

  return dirs;
}

function shouldIncludeAssetDir(assetPath) {
  const parts = assetPath.split('/');
  if (parts[0] !== 'assets' || parts[1] !== 'web' || parts[2] !== '_next') {
    return true;
  }
  if (parts.length === 3) {
    return false;
  }
  if (parts.length === 4) {
    return parts[3] === 'static';
  }
  if (parts.length === 5 && parts[3] === 'static') {
    return parts[4] === 'chunks' || parts[4] === 'media';
  }
  return true;
}

function updateFlutterAssets(pubspecPath, assetDirs) {
  const startMarker = '    # BEGIN GENERATED WEB ASSETS';
  const endMarker = '    # END GENERATED WEB ASSETS';
  const generatedBlock = [
    startMarker,
    ...assetDirs.map((assetDir) => `    - ${assetDir}`),
    endMarker,
  ].join('\n');

  const pubspec = readFileSync(pubspecPath, 'utf8');

  if (pubspec.includes(startMarker) && pubspec.includes(endMarker)) {
    const updated = pubspec.replace(
      new RegExp(`${escapeRegExp(startMarker)}[\\s\\S]*?${escapeRegExp(endMarker)}`),
      generatedBlock,
    );
    writeFileSync(pubspecPath, updated);
    return;
  }

  const updated = pubspec.replace(
    /(^flutter:\n(?:  .*\n)*?  assets:\n)(?:    - assets\/web\/\n)?/m,
    `$1${generatedBlock}\n`,
  );

  if (updated === pubspec) {
    throw new Error('[copy-web] Could not find flutter.assets in packages/flutter/pubspec.yaml');
  }

  writeFileSync(pubspecPath, updated);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
