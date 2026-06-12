#!/usr/bin/env node
import { readdirSync, readFileSync, writeFileSync, existsSync, unlinkSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

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

function scanMiniAppStore() {
  const dir = join(agentsDir, 'mini-app');
  if (!existsSync(dir)) return;
  const indexPath = join(dir, 'index.json');
  const existing = loadExistingIndex(indexPath);
  const index = [];
  for (const entry of readdirSync(dir, { withFileTypes: true})) {
    if (!entry.isDirectory()) continue;
    const templateDir = join(dir, entry.name);
    const manifestFile = join(templateDir, 'manifest.json');
    let name = entry.name.replace(/[-_]/g, ' ');
    let icon;
    let iconUrl;
    if (existsSync(manifestFile)) {
      try {
        const manifest = JSON.parse(readFileSync(manifestFile, 'utf-8'));
        name = manifest.name || name;
        icon = manifest.icon;
        if (manifest.icon && existsSync(join(templateDir, manifest.icon))) {
          iconUrl = `mini-app/${entry.name}/${manifest.icon}`;
        }
      } catch { /* ignore */ }
    }
    // Fallback: use avatar.png if no iconUrl yet
    if (!iconUrl && existsSync(join(templateDir, 'avatar.png'))) {
      iconUrl = `mini-app/${entry.name}/avatar.png`;
    }
    // Collect relative file paths instead of generating zip
    const files = [];
    function walk(d, prefix) {
      for (const f of readdirSync(d, { withFileTypes: true })) {
        const rel = prefix ? `${prefix}/${f.name}` : f.name;
        if (f.isDirectory()) {
          walk(join(d, f.name), rel);
        } else {
          files.push(rel);
        }
      }
    }
    walk(templateDir, '');
    // Remove stale zip if exists
    const zipPath = join(dir, `${entry.name}.zip`);
    if (existsSync(zipPath)) unlinkSync(zipPath);
    const md5 = folderMD5(templateDir);
    const prev = existing.get(entry.name);
    const updatedAt = (!prev || prev.md5 !== md5) ? getLatestMtime(templateDir) : prev.updatedAt;
    index.push({ id: entry.name, name, icon, iconUrl, files, md5, updatedAt });
  }
  writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
  console.log(`[mini-app] ${index.length} templates`);
}
scanMiniAppStore();
