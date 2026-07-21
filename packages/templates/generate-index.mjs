#!/usr/bin/env node
import { readdirSync, readFileSync, writeFileSync, existsSync, unlinkSync, statSync, mkdirSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { inflateRawSync, deflateRawSync, crc32 } from 'node:zlib';

const agentsDir = fileURLToPath(new URL('.', import.meta.url));

function folderMD5(dir) {
  const hashes = [];
  function walk(d) {
    for (const file of readdirSync(d)) {
      if (file === 'node_modules' || file === '.git') continue;
      const fullPath = join(d, file);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) walk(fullPath);
      else hashes.push(createHash('md5').update(readFileSync(fullPath)).digest('hex'));
    }
  }
  walk(dir);
  return createHash('md5').update(hashes.sort().join('')).digest('hex');
}

function fileMD5(filePath) {
  return createHash('md5').update(readFileSync(filePath)).digest('hex');
}

function fileMtime(filePath) {
  return statSync(filePath).mtime.toISOString();
}

function getLatestMtime(dir) {
  let latest = 0;
  function walk(d) {
    for (const file of readdirSync(d)) {
      if (file === 'node_modules' || file === '.git') continue;
      const fullPath = join(d, file);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) walk(fullPath);
      else if (stat.mtimeMs > latest) latest = stat.mtimeMs;
    }
  }
  walk(dir);
  return latest > 0 ? new Date(latest).toISOString() : undefined;
}

// 枚举插件目录下实际存在的文件（相对路径，POSIX 分隔符，排除 node_modules/.git）。
// 写入 index.json 的 files 字段，供前端按清单逐个下载。
function listDirFiles(dir) {
  const out = [];
  function walk(d, rel) {
    for (const file of readdirSync(d)) {
      if (file === 'node_modules' || file === '.git') continue;
      const fullPath = join(d, file);
      const relPath = rel ? `${rel}/${file}` : file;
      const stat = statSync(fullPath);
      if (stat.isDirectory()) walk(fullPath, relPath);
      else out.push(relPath);
    }
  }
  walk(dir, '');
  return out;
}

function loadExistingIndex(indexPath) {
  if (!existsSync(indexPath)) return new Map();
  try {
    const items = JSON.parse(readFileSync(indexPath, 'utf-8'));
    return new Map((Array.isArray(items) ? items : []).map(item => [item.id, item]));
  } catch {
    return new Map();
  }
}

function scanPromptStore() {
  const dir = join(agentsDir, 'prompt');
  if (!existsSync(dir)) return;
  const indexPath = join(dir, 'index.json');
  const existing = loadExistingIndex(indexPath);
  const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
  const index = files.map((filename) => {
    const id = basename(filename, '.md');
    const filePath = join(dir, filename);
    const content = readFileSync(filePath, 'utf-8');
    const firstHeading = content.split('\n').find((l) => /^#\s+/.test(l));
    const name = firstHeading ? firstHeading.replace(/^#\s+/, '').trim() : id.replace(/[-_]/g, ' ');
    const md5 = fileMD5(filePath);
    const prev = existing.get(id);
    const updatedAt = (!prev || prev.md5 !== md5) ? fileMtime(filePath) : prev.updatedAt;
    return { id, name, filename, md5, updatedAt };
  });
  writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
  console.log(`[prompt] ${index.length} templates`);
}

function scanOutputStyleStore() {
  const dir = join(agentsDir, 'output-styles');
  if (!existsSync(dir)) return;
  const indexPath = join(dir, 'index.json');
  const existing = loadExistingIndex(indexPath);
  const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
  const index = files.map((filename) => {
    const id = basename(filename, '.md');
    const filePath = join(dir, filename);
    const content = readFileSync(filePath, 'utf-8');
    const firstHeading = content.split('\n').find((l) => /^#\s+/.test(l));
    const name = firstHeading ? firstHeading.replace(/^#\s+/, '').trim() : id.replace(/[-_]/g, ' ');
    const md5 = fileMD5(filePath);
    const prev = existing.get(id);
    const updatedAt = (!prev || prev.md5 !== md5) ? fileMtime(filePath) : prev.updatedAt;
    return { id, name, filename, md5, updatedAt };
  });
  writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
  console.log(`[output-styles] ${index.length} templates`);
}

function scanSkillStore() {
  const dir = join(agentsDir, 'skills');
  if (!existsSync(dir)) return;
  const indexPath = join(dir, 'index.json');
  const existing = loadExistingIndex(indexPath);
  const index = [];
  const addSkill = (skillDir, skillName, group) => {
    const skillFile = join(skillDir, 'SKILL.md');
    if (!existsSync(skillFile)) return;
    const content = readFileSync(skillFile, 'utf-8');
    const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    let name = skillName;
    if (fm) {
      const nameLine = fm[1].split(/\r?\n/).find((l) => /^\s*name\s*:/i.test(l));
      if (nameLine) name = nameLine.split(':', 2)[1].trim() || skillName;
    }
    const md5 = folderMD5(skillDir);
    const prev = existing.get(skillName);
    const updatedAt = (!prev || prev.md5 !== md5) ? getLatestMtime(skillDir) : prev.updatedAt;
    // 一级目录 skill（group 为空）path 即 skillName；二级 group skill path 为 group/skillName
    const path = group ? `${group}/${skillName}` : skillName;
    index.push({ id: skillName, name, group, path, md5, updatedAt });
  };
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const entryDir = join(dir, entry.name);
    // 一级 skill：目录本身含 SKILL.md
    if (existsSync(join(entryDir, 'SKILL.md'))) {
      addSkill(entryDir, entry.name, '');
      continue;
    }
    // 二级 group：entry 作为 group，遍历其子目录
    for (const skillEntry of readdirSync(entryDir, { withFileTypes: true })) {
      if (!skillEntry.isDirectory()) continue;
      addSkill(join(entryDir, skillEntry.name), skillEntry.name, entry.name);
    }
  }
  writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
  console.log(`[skills] ${index.length} skills`);
}

function scanMcpStore() {
  const dir = join(agentsDir, 'mcps');
  if (!existsSync(dir)) return;
  const indexPath = join(dir, 'index.json');
  const existing = loadExistingIndex(indexPath);
  const files = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'index.json');
  const index = files.map((filename) => {
    const id = basename(filename, '.json');
    const filePath = join(dir, filename);
    const raw = readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    const servers = data.mcpServers || data;
    const serverName = Object.keys(servers)[0] || id;
    const config = servers[serverName] || {};
    const envKeys = config.env ? Object.keys(config.env).filter((k) => !config.env[k]) : [];
    const md5 = fileMD5(filePath);
    const prev = existing.get(id);
    const updatedAt = (!prev || prev.md5 !== md5) ? fileMtime(filePath) : prev.updatedAt;
    return {
      id,
      name: serverName,
      description: config.command ? `${config.command} ${(config.args || []).join(' ')}` : '',
      filename,
      needsEnv: envKeys.length > 0 ? envKeys : undefined,
      md5,
      updatedAt,
    };
  });
  writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
  console.log(`[mcps] ${index.length} templates`);
}
function scanAgentStore() {
  const dir = join(agentsDir, 'agents');
  if (!existsSync(dir)) return;
  const indexPath = join(dir, 'index.json');
  const existing = loadExistingIndex(indexPath);
  const index = [];
  for (const groupEntry of readdirSync(dir, { withFileTypes: true })) {
    if (!groupEntry.isDirectory()) continue;
    const group = groupEntry.name;
    const groupDir = join(dir, group);
    for (const file of readdirSync(groupDir)) {
      if (!file.endsWith('.md')) continue;
      const id = basename(file, '.md');
      const filePath = join(groupDir, file);
      const content = readFileSync(filePath, 'utf-8');
      const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      let name = id.replace(/[-_]/g, ' ');
      let description = '';
      let emoji = '';
      if (fm) {
        for (const line of fm[1].split(/\r?\n/)) {
          const m = line.match(/^\s*(\w+)\s*:\s*(.+)/);
          if (!m) continue;
          const [, key, val] = m;
          if (key === 'name') name = val.trim();
          else if (key === 'description') description = val.trim();
          else if (key === 'emoji') emoji = val.trim();
        }
      }
      const md5 = fileMD5(filePath);
      const prev = existing.get(id);
      const updatedAt = (!prev || prev.md5 !== md5) ? fileMtime(filePath) : prev.updatedAt;
      index.push({ id, name, group, path: `${group}/${id}`, description, emoji, md5, updatedAt });
    }
  }
  writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
  console.log(`[agents] ${index.length} agents`);
}

function scanPluginStore() {
  const dir = join(agentsDir, 'plugins');
  if (!existsSync(dir)) return;
  const locales = ['zh', 'en'];
  const remoteIndexPath = join(dir, 'plugins.json');
  const remoteItems = existsSync(remoteIndexPath)
    ? JSON.parse(readFileSync(remoteIndexPath, 'utf-8'))
    : [];
  const remoteByDir = new Map(
    (Array.isArray(remoteItems) ? remoteItems : [])
      .filter(item => item && typeof item === 'object')
      .map(item => {
        const manifestPath = typeof item.manifestUrl === 'string' ? item.manifestUrl.split('/')[0] : '';
        const downloadPath = typeof item.downloadUrl === 'string' ? item.downloadUrl.replace(/\.zip$/i, '') : '';
        return [manifestPath || downloadPath || item.id, item];
      }),
  );
  const existing = loadExistingIndex(join(dir, 'index.json'));
  const indexes = new Map([['default', []], ...locales.map(locale => [locale, []])]);
  const pickLocalized = (data, field, locale) => data[`${field}_${locale}`] ?? data[field];
  const buildItem = (entryName, data, locale) => {
    const id = data.id || entryName;
    return {
      id,
      name: locale ? pickLocalized(data, 'name', locale) || id : data.name || id,
      version: data.version || '0.0.0',
      description: locale ? pickLocalized(data, 'description', locale) || '' : data.description || '',
      author: data.author || { name: 'Unknown' },
      tags: locale && Array.isArray(data[`tags_${locale}`])
        ? data[`tags_${locale}`]
        : Array.isArray(data.tags) ? data.tags : [],
      type: data.type,
      hasView: Boolean(data.hasView),
      hasWorkflow: Boolean(data.hasWorkflow || data.workflowNodes || data.entries?.workflow),
      path: entryName,
      iconUrl: data.iconUrl || data.iconPath || (data.icon ? `plugins/${entryName}/${data.icon}` : undefined),
    };
  };
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const pluginDir = join(dir, entry.name);
    const manifestFile = ['plugin.json', 'manifest.json', 'info.json', 'web-plugin.json', 'package.json']
      .find(filename => existsSync(join(pluginDir, filename)));
    const localManifest = manifestFile ? JSON.parse(readFileSync(join(pluginDir, manifestFile), 'utf-8')) : {};
    const remoteManifest = remoteByDir.get(entry.name) || {};
    const data = { ...remoteManifest, ...localManifest };
    const md5 = folderMD5(pluginDir);
    const files = listDirFiles(pluginDir);
    const defaultItem = buildItem(entry.name, data);
    const prev = existing.get(defaultItem.id);
    const updatedAt = (!prev || prev.md5 !== md5) ? getLatestMtime(pluginDir) : prev.updatedAt;
    indexes.get('default').push({ ...defaultItem, md5, updatedAt, files });
    for (const locale of locales) indexes.get(locale).push({ ...buildItem(entry.name, data, locale), md5, updatedAt, files });
  }
  writeFileSync(join(dir, 'index.json'), JSON.stringify(indexes.get('default'), null, 2), 'utf-8');
  for (const locale of locales) {
    writeFileSync(join(dir, `index_${locale}.json`), JSON.stringify(indexes.get(locale), null, 2), 'utf-8');
  }
  console.log(`[plugins] ${indexes.get('default').length} plugins`);
}

scanAgentStore();

scanMcpStore();
scanPluginStore();

scanPromptStore();
scanOutputStyleStore();
scanSkillStore();

function scanWorkflowStore() {
  const dir = join(agentsDir, 'workflows');
  if (!existsSync(dir)) return;
  const indexPath = join(dir, 'index.json');
  const existing = loadExistingIndex(indexPath);
  const files = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'index.json');
  const index = files.map((filename) => {
    const filePath = join(dir, filename);
    const raw = readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    const id = data.id || basename(filename, '.json');
    const md5 = fileMD5(filePath);
    const prev = existing.get(id);
    const updatedAt = (!prev || prev.md5 !== md5) ? fileMtime(filePath) : prev.updatedAt;
    return {
      id,
      name: data.name || basename(filename, '.json'),
      description: data.description || '',
      filename,
      nodeCount: data.data?.nodes?.length || 0,
      agentCount: data.data?.agents ? Object.keys(data.data.agents).length : 0,
      md5,
      updatedAt,
    };
  });
  writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
  console.log(`[workflows] ${index.length} templates`);
}
scanWorkflowStore();

// ---- Minimal zero-dependency ZIP reader (store + deflate) ----
function readZipEntries(buf) {
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x05 && buf[i + 3] === 0x06) {
      const cdCount = buf.readUInt16LE(i + 10);
      const cdOffset = buf.readUInt32LE(i + 16);
      const entries = [];
      let p = cdOffset;
      for (let j = 0; j < cdCount; j++) {
        if (buf.readUInt32LE(p) !== 0x02014b50) break;
        const compMethod = buf.readUInt16LE(p + 10);
        const compSize = buf.readUInt32LE(p + 20);
        const nameLen = buf.readUInt16LE(p + 28);
        const extraLen = buf.readUInt16LE(p + 30);
        const commentLen = buf.readUInt16LE(p + 32);
        const localHeaderOffset = buf.readUInt32LE(p + 42);
        const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
        entries.push({ name, compMethod, compSize, localHeaderOffset });
        p += 46 + nameLen + extraLen + commentLen;
      }
      return entries;
    }
  }
  throw new Error('Invalid zip: EOCD not found');
}

function readZipEntry(buf, entry) {
  if (entry.name.endsWith('/')) return null; // directory
  const lh = entry.localHeaderOffset;
  const dataStart = lh + 30 + buf.readUInt16LE(lh + 26) + buf.readUInt16LE(lh + 28);
  const raw = buf.subarray(dataStart, dataStart + entry.compSize);
  if (entry.compMethod === 0) return raw;      // stored
  if (entry.compMethod === 8) return inflateRawSync(raw); // deflated
  throw new Error(`Unsupported zip compression for ${entry.name}: ${entry.compMethod}`);
}

function readZip(filePath) {
  const buf = readFileSync(filePath);
  const entries = readZipEntries(buf);
  const findEntry = (name) =>
    entries.find((e) => e.name === name) ||
    entries.find((e) => !e.name.endsWith('/') && e.name.split('/').pop() === name);
  const ICON_RE = /(^|\/)(icon|avatar)\.(png|jpe?g|webp|gif|svg)$/i;
  return {
    read: (name) => {
      const e = findEntry(name);
      return e ? readZipEntry(buf, e) : null;
    },
    findIcon: () =>
      entries.find((e) => e.name === 'icon.png') ||
      entries.find((e) => e.name === 'avatar.png') ||
      entries.find((e) => ICON_RE.test(e.name)) ||
      null,
  };
}

function scanMiniAppStore() {
  // NOTE: requires pack-mini-apps.mjs to run first — it writes intro/{id}.md
  // and sets manifest.hasIntro in each zip. Running only generate-index against
  // stale zips would cause the intro cleanup below to wipe the intro directory.
  const dir = join(agentsDir, 'mini-app');
  if (!existsSync(dir)) return;
  const indexPath = join(dir, 'index.json');
  const iconsDir = join(dir, 'icons');
  mkdirSync(iconsDir, { recursive: true });
  const existing = loadExistingIndex(indexPath);
  const index = [];
  const seenIds = new Set();
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.zip')) continue;
    const id = basename(entry.name, '.zip');
    seenIds.add(id);
    const zipPath = join(dir, entry.name);
    const zip = readZip(zipPath);

    let name = id.replace(/[-_]/g, ' ');
    let icon;
    let iconUrl;
    let description;
    let type;
    const manifestBuf = zip.read('manifest.json');
    let version;
    let tags;
    let hasIntro = false;
    if (manifestBuf) {
      try {
        const manifest = JSON.parse(manifestBuf.toString('utf-8'));
        name = manifest.name || name;
        icon = manifest.icon;
        description = manifest.description;
        type = manifest.type;
        version = manifest.version;
        tags = Array.isArray(manifest.tags) ? manifest.tags : [];
        hasIntro = manifest.hasIntro === true;
      } catch { /* ignore */ }
    }

    // Extract icon.png (fallback: avatar.png) to mini-app/icons/{id}.{ext}
    const iconEntry = zip.findIcon();
    if (iconEntry) {
      const iconData = readZipEntry(readFileSync(zipPath), iconEntry);
      if (iconData) {
        const ext = (extname(iconEntry.name) || '.png').slice(1).toLowerCase() || 'png';
        writeFileSync(join(iconsDir, `${id}.${ext}`), iconData);
        iconUrl = `mini-app/icons/${id}.${ext}`;
      }
    }

    const md5 = fileMD5(zipPath);
    const prev = existing.get(id);
    const updatedAt = (!prev || prev.md5 !== md5) ? fileMtime(zipPath) : prev.updatedAt;
    index.push({
      id, name, type, icon, iconUrl, description,
      hasIntro, version, tags,
      zipUrl: `mini-app/${entry.name}`, md5, updatedAt,
    });
  }

  // Clean stale icons whose template zip no longer exists
  for (const f of readdirSync(iconsDir)) {
    if (!seenIds.has(f.replace(/\.[^.]+$/, ''))) unlinkSync(join(iconsDir, f));
  }

  // Clean stale intro files whose template no longer ships an intro
  const introDir = join(dir, 'intro');
  if (existsSync(introDir)) {
    const introIds = new Set(index.filter((i) => i.hasIntro).map((i) => i.id));
    for (const f of readdirSync(introDir)) {
      if (!f.endsWith('.md')) continue;
      const id = basename(f, '.md');
      if (!introIds.has(id)) unlinkSync(join(introDir, f));
    }
  }

  writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
  console.log(`[mini-app] ${index.length} templates`);
}
scanMiniAppStore();

// ---- ZIP store-mode packer (zero-dep, for skillspackage bundling) ----
// 写入 store + deflate 混合 zip：小文本走 deflate 压缩，其余（含内嵌 zip）走 store。
function collectDirFiles(dir, prefix) {
  const out = [];
  for (const file of readdirSync(dir)) {
    if (file === 'node_modules' || file === '.git') continue;
    const fullPath = join(dir, file);
    const rel = prefix ? `${prefix}/${file}` : file;
    const s = statSync(fullPath);
    if (s.isDirectory()) out.push(...collectDirFiles(fullPath, rel));
    else out.push({ rel, fullPath });
  }
  return out;
}

function writeZip(files, outPath) {
  // files: Array<{ rel: string, data: Buffer }>
  const localParts = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const nameBuf = Buffer.from(f.rel, 'utf-8');
    // 选择压缩方式：大于 1KB 且非二进制 zip 尝试 deflate，否则 store
    const isAlreadyZip = f.rel.toLowerCase().endsWith('.zip');
    let compMethod = 0;
    let fileData = f.data;
    if (!isAlreadyZip && f.data.length > 1024) {
      const deflated = deflateRawSync(f.data);
      if (deflated.length < f.data.length) {
        compMethod = 8;
        fileData = deflated;
      }
    }
    const crc = crc32(f.data);
    const compSize = fileData.length;
    const uncompSize = f.data.length;

    // Local file header
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);            // version needed
    lh.writeUInt16LE(0, 6);             // flags
    lh.writeUInt16LE(compMethod, 8);
    lh.writeUInt16LE(0, 10);            // mod time
    lh.writeUInt16LE(0, 12);            // mod date
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(compSize, 18);
    lh.writeUInt32LE(uncompSize, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);            // extra len
    localParts.push(lh, nameBuf, fileData);

    // Central directory header
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);            // version made by
    ch.writeUInt16LE(20, 6);            // version needed
    ch.writeUInt16LE(0, 8);             // flags
    ch.writeUInt16LE(compMethod, 10);
    ch.writeUInt16LE(0, 12);            // mod time
    ch.writeUInt16LE(0, 14);            // mod date
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(compSize, 20);
    ch.writeUInt32LE(uncompSize, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt16LE(0, 30);            // extra len
    ch.writeUInt16LE(0, 32);            // comment len
    ch.writeUInt16LE(0, 34);            // disk number
    ch.writeUInt16LE(0, 36);            // internal attrs
    ch.writeUInt32LE(0, 38);            // external attrs
    ch.writeUInt32LE(offset, 42);       // local header offset
    central.push(ch, nameBuf);

    offset += lh.length + nameBuf.length + fileData.length;
  }

  const centralBuf = Buffer.concat(central);
  const cdOffset = offset;
  const cdSize = centralBuf.length;

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  eocd.writeUInt16LE(0, 20);

  writeFileSync(outPath, Buffer.concat([...localParts, centralBuf, eocd]));
}

function scanSkillsPackageStore() {
  // 以 {slug}.zip 作为唯一真相源：扫描器只遍历 zip，从 zip 内读 manifest 生成索引。
  // 不再扫描源目录、不再自动重打包——zip 由外部维护。
  const dir = join(agentsDir, 'skillspackage');
  if (!existsSync(dir)) return;
  const indexPath = join(dir, 'index.json');
  const existing = loadExistingIndex(indexPath);
  const index = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.zip')) continue;
    const zipPath = join(dir, entry.name);
    const slugFromFile = entry.name.slice(0, -4);

    // 从 zip 内读 manifest.json：兼容 {slug}/manifest.json 与根 manifest.json 两种布局
    let manifest = {};
    try {
      const zip = readZip(zipPath);
      const raw =
        zip.read(`${slugFromFile}/manifest.json`) ||
        zip.read('manifest.json') ||
        null;
      if (raw) manifest = JSON.parse(raw.toString('utf-8'));
    } catch (e) {
      console.warn(`[skillspackage] skip ${entry.name}: ${e.message}`);
      continue;
    }
    const slug = manifest.slug || slugFromFile;
    const name = manifest.displayName || slug;
    const summary = manifest.summary || '';
    const skillSlugs = Array.isArray(manifest.skillSlugs) ? manifest.skillSlugs : [];

    const md5 = fileMD5(zipPath);
    const prev = existing.get(slug);
    const updatedAt = (!prev || prev.md5 !== md5) ? fileMtime(zipPath) : prev.updatedAt;

    index.push({
      id: slug,
      name,
      summary,
      skillSlugs,
      skillCount: skillSlugs.length,
      zipUrl: `skillspackage/${slug}.zip`,
      md5,
      updatedAt,
    });
  }
  writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
  console.log(`[skillspackage] ${index.length} packages`);
}
scanSkillsPackageStore();
