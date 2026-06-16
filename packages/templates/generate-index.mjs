#!/usr/bin/env node
import { readdirSync, readFileSync, writeFileSync, existsSync, unlinkSync, statSync, mkdirSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';

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
  for (const groupEntry of readdirSync(dir, { withFileTypes: true })) {
    if (!groupEntry.isDirectory()) continue;
    const group = groupEntry.name;
    const groupDir = join(dir, group);
    for (const skillEntry of readdirSync(groupDir, { withFileTypes: true })) {
      if (!skillEntry.isDirectory()) continue;
      const skillName = skillEntry.name;
      const skillDir = join(groupDir, skillName);
      const skillFile = join(skillDir, 'SKILL.md');
      if (!existsSync(skillFile)) continue;
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
      index.push({ id: skillName, name, group, path: `${group}/${skillName}`, md5, updatedAt });
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
    const defaultItem = buildItem(entry.name, data);
    const prev = existing.get(defaultItem.id);
    const updatedAt = (!prev || prev.md5 !== md5) ? getLatestMtime(pluginDir) : prev.updatedAt;
    indexes.get('default').push({ ...defaultItem, md5, updatedAt });
    for (const locale of locales) indexes.get(locale).push({ ...buildItem(entry.name, data, locale), md5, updatedAt });
  }
  writeFileSync(join(dir, 'index.json'), JSON.stringify(indexes.get('default'), null, 2), 'utf-8');
  for (const locale of locales) {
    writeFileSync(join(dir, `index_${locale}.json`), JSON.stringify(indexes.get(locale), null, 2), 'utf-8');
  }
  console.log(`[plugins] ${indexes.get('default').length} plugins`);
}

scanAgentStore();

function scanChatStore() {
  const dir = join(agentsDir, 'chat');
  if (!existsSync(dir)) return;
  const indexPath = join(dir, 'index.json');
  const existing = loadExistingIndex(indexPath);
  const index = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.md')) continue;
    const id = basename(file, '.md');
    const filePath = join(dir, file);
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
    index.push({ id, name, group: 'chat', path: id, description, emoji, md5, updatedAt });
  }
  writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
  console.log(`[chat] ${index.length} agents`);
}
scanChatStore();

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
