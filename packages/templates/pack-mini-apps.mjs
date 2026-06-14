#!/usr/bin/env node
/**
 * Pack mini-app project folders into template zips.
 *
 * Usage:
 *   node pack-mini-apps.mjs [source-dir] [--out=<out-dir>]
 *
 * - source-dir defaults to packages/server/agent-spaces-data/mini-apps
 * - out-dir   defaults to packages/templates/mini-app
 * - Relative paths resolve against the repo root.
 *
 * For each subdirectory of source-dir, writes <out-dir>/<id>.zip containing:
 *   manifest.json  (on-disk manifest merged with the richer metadata from
 *                   source-dir/index.json; internal + secret-bearing fields
 *                   like id/createdAt/agentConfigId/agents are stripped)
 *   src/**         (all source files)
 *   configs/**     (runtime config files)
 *   <icon files>   (avatar.png / icon.png / background, if present)
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';

const scriptDir = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(scriptDir, '..', '..');

function parseArgs(argv) {
  const sourceArg = argv.find((a) => !a.startsWith('--'));
  const outArg = argv.find((a) => a.startsWith('--out='));
  const resolveRoot = (p) => (p ? resolve(p) : null);
  return {
    source: resolveRoot(sourceArg) || join(repoRoot, 'packages/server/agent-spaces-data/mini-apps'),
    out: resolveRoot(outArg?.slice('--out='.length)) || join(scriptDir, 'mini-app'),
  };
}

// ---- CRC32 ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---- Zero-dependency ZIP writer (deflate) ----
function buildZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const isDir = entry.name.endsWith('/');
    const data = isDir ? Buffer.alloc(0) : entry.data;
    const compressed = isDir || data.length === 0 ? data : deflateRawSync(data, { level: 9 });
    const crc = isDir ? 0 : crc32(data);
    const method = isDir || data.length === 0 ? 0 : 8;

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0x0800, 6); // UTF-8 filename
    lh.writeUInt16LE(method, 8);
    lh.writeUInt16LE(0, 10);
    lh.writeUInt16LE(0x21, 12); // fixed mtime (1980-01-01)
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(compressed.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);
    localParts.push(lh, nameBuf, compressed);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(method, 10);
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(0x21, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(compressed.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(offset, 42);
    centralParts.push(cd, nameBuf);

    offset += lh.length + nameBuf.length + compressed.length;
  }

  const localBuf = Buffer.concat(localParts);
  const centralBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(localBuf.length, 16);
  return Buffer.concat([localBuf, centralBuf, eocd]);
}

// ---- Manifest merge ----
// Fields kept in the shipped manifest (on-disk manifest.json merged with the
// richer metadata from index.json). Internal ids, timestamps, and the agents
// seed (which may carry API keys) are dropped.
const KEEP_FIELDS = [
  'name', 'description', 'version', 'type', 'tags', 'mainFile',
  'enabledPlugins', 'enableAgents', 'icon', 'avatarUrl', 'backgroundUrl',
];
function buildManifest(id, diskManifest, meta) {
  const merged = { ...(diskManifest || {}), ...(meta || {}) };
  const out = { id };
  for (const key of KEEP_FIELDS) if (merged[key] !== undefined) out[key] = merged[key];
  return out;
}

// ---- Folder walk ----
const SKIP_NAMES = new Set(['node_modules', '.git', '.DS_Store']);
function walkFiles(root) {
  const out = [];
  (function walk(dir, prefix) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_NAMES.has(entry.name)) continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full, rel);
      else out.push({ rel, full });
    }
  })(root, '');
  return out;
}

// ---- Main ----
function main() {
  const { source, out } = parseArgs(process.argv.slice(2));
  if (!existsSync(source)) {
    console.error(`[pack-mini-apps] source not found: ${source}`);
    process.exit(1);
  }

  const indexPath = join(source, 'index.json');
  const metaMap = new Map();
  if (existsSync(indexPath)) {
    try {
      const items = JSON.parse(readFileSync(indexPath, 'utf-8'));
      for (const item of Array.isArray(items) ? items : Object.values(items)) {
        if (item && item.id) metaMap.set(item.id, item);
      }
    } catch { /* ignore */ }
  }

  mkdirSync(out, { recursive: true });

  const projects = readdirSync(source, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  let packed = 0;
  let droppedAgents = 0;
  for (const id of projects) {
    const projectDir = join(source, id);
    const diskManifestPath = join(projectDir, 'manifest.json');
    let diskManifest = {};
    if (existsSync(diskManifestPath)) {
      try { diskManifest = JSON.parse(readFileSync(diskManifestPath, 'utf-8')); } catch { /* ignore */ }
    }
    const meta = metaMap.get(id) || {};
    if (meta.agents) droppedAgents++;

    const manifest = buildManifest(id, diskManifest, meta);
    const entries = [{ name: 'manifest.json', data: Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8') }];

    // src/** — the actual app source (mirrors server exportZip)
    const srcDir = join(projectDir, 'src');
    if (existsSync(srcDir)) {
      for (const { rel, full } of walkFiles(srcDir)) {
        entries.push({ name: `src/${rel.split(sep).join('/')}`, data: readFileSync(full) });
      }
    }

    // Loose asset files referenced by the manifest (icon / avatar / background)
    for (const field of ['icon', 'avatarUrl', 'backgroundUrl']) {
      const val = manifest[field];
      if (typeof val !== 'string' || !val || val.includes('/') || val.includes('\\')) continue;
      const assetPath = join(projectDir, val);
      if (existsSync(assetPath) && statSync(assetPath).isFile()) {
        entries.push({ name: val, data: readFileSync(assetPath) });
      }
    }

    const zipPath = join(out, `${id}.zip`);
    writeFileSync(zipPath, buildZip(entries));
    packed++;
    console.log(`[pack] ${id} -> ${relative(repoRoot, zipPath)} (${entries.length} files)`);
  }

  console.log(`\n[pack-mini-apps] ${packed}/${projects.length} projects packed into ${relative(repoRoot, out)}`);
  if (droppedAgents > 0) {
    console.log(`[pack-mini-apps] NOTE: stripped 'agents' seed from ${droppedAgents} project(s) to avoid shipping API keys.`);
  }
}

main();
