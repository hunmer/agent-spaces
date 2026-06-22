import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { ensureDir, getDataDir } from '../storage/json-store.js';
import { listTemplates } from './agent.js';
import type { AgentConfig } from '@agent-spaces/shared';

export interface SkillInfo {
  name: string;
  description: string;
  filename: string;
  content: string;
  favorited: boolean;
  group: string;
  boundAgents: Array<{ id: string; name: string; avatarUrl?: string }>;
}

interface SkillMeta {
  favorites: string[];
  groups: Record<string, string>;
}

const SKILL_FILE = 'SKILL.md';

function normalizeSkillNames(skills: unknown): string[] {
  if (!Array.isArray(skills)) return [];
  return skills
    .map((skill) => {
      if (typeof skill === 'string') return skill;
      if (skill && typeof skill === 'object' && 'name' in skill && typeof skill.name === 'string') return skill.name;
      return '';
    })
    .map((skill) => skill.trim().replace(/\.md$/i, ''))
    .filter(Boolean);
}

function getSkillsDir(): string {
  return join(getDataDir(), 'skills');
}

function getSkillMetaPath(): string {
  return join(getSkillsDir(), '_meta.json');
}

function readMeta(): SkillMeta {
  const path = getSkillMetaPath();
  if (!existsSync(path)) return { favorites: [], groups: {} };
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'));
    return {
      favorites: raw.favorites || [],
      groups: raw.groups || {},
    };
  } catch {
    return { favorites: [], groups: {} };
  }
}

function writeMeta(meta: SkillMeta): void {
  ensureDir(getSkillsDir());
  writeFileSync(getSkillMetaPath(), JSON.stringify(meta, null, 2), 'utf-8');
}

/** Migrate flat .md files to folder/{SKILL_FILE} format */
function migrateFlatFiles(): void {
  const skillsDir = getSkillsDir();
  if (!existsSync(skillsDir)) return;

  const entries = readdirSync(skillsDir);
  for (const entry of entries) {
    if (!entry.endsWith('.md') || entry.startsWith('_')) continue;
    const filePath = join(skillsDir, entry);
    if (!statSync(filePath).isFile()) continue;

    const name = basename(entry, '.md');
    const folderPath = join(skillsDir, name);
    if (!existsSync(folderPath)) {
      mkdirSync(folderPath, { recursive: true });
      const content = readFileSync(filePath, 'utf-8');
      writeFileSync(join(folderPath, SKILL_FILE), content, 'utf-8');
    }
    unlinkSync(filePath);
  }
}

export function listSkills(): SkillInfo[] {
  migrateFlatFiles();

  const agents = listTemplates();
  const skillsDir = getSkillsDir();
  const meta = readMeta();
  ensureDir(skillsDir);

  const folders = readdirSync(skillsDir)
    .filter((f) => {
      if (f.startsWith('_')) return false;
      const p = join(skillsDir, f);
      return statSync(p).isDirectory();
    });

  return folders.map((folderName) => {
    const skillFile = join(skillsDir, folderName, SKILL_FILE);
    const content = existsSync(skillFile) ? readFileSync(skillFile, 'utf-8') : '';
    const fm = parseFrontmatter(content);
    const boundAgents = agents
      .filter((a: AgentConfig) =>
        normalizeSkillNames(a.skills).some((skillName) => skillName === folderName),
      )
      .map((a: AgentConfig) => ({
        id: a.id,
        name: a.name || 'Agent',
        avatarUrl: a.avatarUrl,
      }));

    return {
      name: folderName,
      description: fm.description || '',
      filename: `${folderName}/${SKILL_FILE}`,
      content,
      favorited: meta.favorites.includes(folderName),
      group: meta.groups[folderName] || '',
      boundAgents,
    };
  });
}

interface Frontmatter {
  name: string | null;
  description: string | null;
}

function parseFrontmatter(content: string): Frontmatter {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return { name: null, description: null };
  const lines = match[1].split(/\r?\n/);
  let name: string | null = null;
  let description: string | null = null;
  for (const line of lines) {
    if (/^\s*name\s*:/i.test(line)) {
      name = line.split(':', 2)[1].trim() || null;
    } else if (/^\s*description\s*:/i.test(line)) {
      description = line.split(':', 2)[1].trim() || null;
    }
  }
  return { name, description };
}

function sanitizeFolderName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'skill';
}

function writeSkillFolder(name: string, content: string): string {
  const skillsDir = getSkillsDir();
  const folderName = sanitizeFolderName(name);
  const folderPath = join(skillsDir, folderName);
  ensureDir(folderPath);
  writeFileSync(join(folderPath, SKILL_FILE), content, 'utf-8');
  return folderName;
}

export function importSkill(filename: string, content: string, group?: string): SkillInfo {
  const fm = parseFrontmatter(content);
  const rawName = fm.name || basename(filename, '.md');
  const folderName = writeSkillFolder(rawName, content);

  if (group) {
    const meta = readMeta();
    meta.groups[folderName] = group;
    writeMeta(meta);
  }

  return {
    name: folderName,
    description: fm.description || '',
    filename: `${folderName}/${SKILL_FILE}`,
    content,
    favorited: false,
    group: group || '',
    boundAgents: [],
  };
}

export function importSkillsBatch(items: Array<{ name: string; content: string; group?: string }>): SkillInfo[] {
  const meta = readMeta();
  const results: SkillInfo[] = [];

  for (const item of items) {
    const folderName = writeSkillFolder(item.name, item.content);
    if (item.group) {
      meta.groups[folderName] = item.group;
    }
    const fm = parseFrontmatter(item.content);
    results.push({
      name: folderName,
      description: fm.description || '',
      filename: `${folderName}/${SKILL_FILE}`,
      content: item.content,
      favorited: false,
      group: item.group || '',
      boundAgents: [],
    });
  }

  writeMeta(meta);
  return results;
}

export function importSkillFromStore(storePath: string, group: string): SkillInfo | null {
  // storePath is like "group-name/skill-name", relative to public/skills/
  const publicSkillsDir = join(getDataDir(), '..', 'public', 'skills');
  // Try relative to package first
  let srcDir: string | null = null;
  const candidates = [
    join(process.cwd(), 'public', 'skills', storePath),
    join(import.meta.dirname ?? '', '..', 'public', 'skills', storePath),
    join(process.cwd(), 'packages', 'agents', 'skills', storePath),
    join(import.meta.dirname ?? '', '..', '..', '..', 'agents', 'skills', storePath),
  ];
  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isDirectory()) { srcDir = c; break; }
  }
  if (!srcDir) return null;

  const skillName = basename(storePath);
  const skillsDir = getSkillsDir();
  const destDir = join(skillsDir, skillName);

  // Copy entire folder
  if (existsSync(destDir)) rmSync(destDir, { recursive: true, force: true });
  cpSync(srcDir, destDir, { recursive: true, force: true });

  // Set group in meta
  if (group) {
    const meta = readMeta();
    meta.groups[skillName] = group;
    writeMeta(meta);
  }

  // Read content for return
  const skillFile = join(destDir, SKILL_FILE);
  const content = existsSync(skillFile) ? readFileSync(skillFile, 'utf-8') : '';
  const fm = parseFrontmatter(content);

  return {
    name: skillName,
    description: fm.description || '',
    filename: `${skillName}/${SKILL_FILE}`,
    content,
    favorited: false,
    group,
    boundAgents: [],
  };
}

export function toggleFavorite(name: string): boolean {
  const meta = readMeta();
  const idx = meta.favorites.indexOf(name);
  if (idx >= 0) {
    meta.favorites.splice(idx, 1);
  } else {
    meta.favorites.push(name);
  }
  writeMeta(meta);
  return idx < 0;
}

export function updateSkillContent(name: string, content: string): boolean {
  const skillsDir = getSkillsDir();
  const filePath = join(skillsDir, name, SKILL_FILE);
  if (!existsSync(filePath)) return false;
  writeFileSync(filePath, content, 'utf-8');
  return true;
}

export function deleteSkill(name: string): boolean {
  const skillsDir = getSkillsDir();
  const folderPath = join(skillsDir, name);
  if (!existsSync(folderPath) || !statSync(folderPath).isDirectory()) return false;
  rmSync(folderPath, { recursive: true, force: true });

  // Clean meta
  const meta = readMeta();
  meta.favorites = meta.favorites.filter((n) => n !== name);
  delete meta.groups[name];
  writeMeta(meta);

  return true;
}

export interface SkillSyncItem {
  agentId: string;
  agentName: string;
  skillName: string;
  globalMtime: string;
  agentMtime: string;
}

export function checkSkillSync(): SkillSyncItem[] {
  migrateFlatFiles();

  const globalSkillsDir = getSkillsDir();
  const agents = listTemplates();
  const result: SkillSyncItem[] = [];

  for (const agent of agents) {
    const skillNames = normalizeSkillNames(agent.skills);
    if (skillNames.length === 0) continue;

    const agentSkillsDir = join(getDataDir(), 'agent-templates', agent.id, 'skills');

    for (const skillName of skillNames) {
      const globalFolder = join(globalSkillsDir, skillName);
      const globalSkillFile = join(globalFolder, SKILL_FILE);
      // Agent skill can be a folder or a flat .md
      const agentFolder = join(agentSkillsDir, skillName);
      const agentFile = join(agentSkillsDir, `${skillName}.md`);

      if (!existsSync(globalFolder) || !statSync(globalFolder).isDirectory()) continue;
      // Use SKILL.md file mtime — directory mtime is unreliable on Windows
      if (!existsSync(globalSkillFile)) continue;

      const globalStat = statSync(globalSkillFile);
      const agentExists = existsSync(agentFolder) || existsSync(agentFile);

      if (!agentExists) {
        // Agent skill missing — needs sync
        result.push({
          agentId: agent.id,
          agentName: agent.name || agent.id,
          skillName,
          globalMtime: globalStat.mtime.toISOString(),
          agentMtime: '',
        });
        continue;
      }

      // Find the actual agent SKILL.md path
      const agentSkillFile = existsSync(agentFolder)
        ? join(agentFolder, SKILL_FILE)
        : agentFile;
      if (!existsSync(agentSkillFile)) continue;

      const agentStat = statSync(agentSkillFile);

      if (globalStat.mtimeMs > agentStat.mtimeMs) {
        result.push({
          agentId: agent.id,
          agentName: agent.name || agent.id,
          skillName,
          globalMtime: globalStat.mtime.toISOString(),
          agentMtime: agentStat.mtime.toISOString(),
        });
      }
    }
  }

  return result;
}

export function syncSkills(items: Array<{ agentId: string; skillName: string }>): number {
  const globalSkillsDir = getSkillsDir();
  let synced = 0;

  for (const item of items) {
    const globalFolder = join(globalSkillsDir, item.skillName);
    if (!existsSync(globalFolder) || !statSync(globalFolder).isDirectory()) continue;

    const agentSkillsDir = join(getDataDir(), 'agent-templates', item.agentId, 'skills');
    ensureDir(agentSkillsDir);

    // Remove stale flat .md if it exists
    const flatFile = join(agentSkillsDir, `${item.skillName}.md`);
    if (existsSync(flatFile)) {
      rmSync(flatFile, { force: true });
    }

    // Copy entire skill folder
    const agentFolder = join(agentSkillsDir, item.skillName);
    if (existsSync(agentFolder)) {
      rmSync(agentFolder, { recursive: true, force: true });
    }
    cpSync(globalFolder, agentFolder, { recursive: true, force: true });
    synced++;
  }

  return synced;
}

export function listSkillFiles(name: string): Array<{ name: string; path: string; isDirectory: boolean }> {
  const skillsDir = getSkillsDir();
  const folderPath = join(skillsDir, name);
  if (!existsSync(folderPath) || !statSync(folderPath).isDirectory()) return [];

  function walk(dir: string, prefix: string): Array<{ name: string; path: string; isDirectory: boolean }> {
    const entries = readdirSync(dir, { withFileTypes: true });
    const result: Array<{ name: string; path: string; isDirectory: boolean }> = [];
    for (const entry of entries) {
      if (entry.name.startsWith('_') || entry.name === '.DS_Store') continue;
      const fullPath = join(dir, entry.name);
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        result.push({ name: entry.name, path: relativePath, isDirectory: true });
        result.push(...walk(fullPath, relativePath));
      } else {
        result.push({ name: entry.name, path: relativePath, isDirectory: false });
      }
    }
    return result;
  }

  return walk(folderPath, '');
}

export function readSkillFile(name: string, filePath: string): string | null {
  const skillsDir = getSkillsDir();
  const fullPath = join(skillsDir, name, filePath);
  // Prevent path traversal
  if (!fullPath.startsWith(join(skillsDir, name))) return null;
  if (!existsSync(fullPath) || !statSync(fullPath).isFile()) return null;
  return readFileSync(fullPath, 'utf-8');
}

export function writeSkillFile(name: string, filePath: string, content: string): boolean {
  const skillsDir = getSkillsDir();
  const fullPath = join(skillsDir, name, filePath);
  // Prevent path traversal
  if (!fullPath.startsWith(join(skillsDir, name))) return false;
  const dir = join(fullPath, '..');
  ensureDir(dir);
  writeFileSync(fullPath, content, 'utf-8');
  return true;
}

export function importSkillsFromGit(gitUrl: string): Array<{ name: string; content: string }> {
  const cloneDir = join(tmpdir(), `agent-spaces-git-${randomUUID()}`);

  try {
    execFileSync('git', ['clone', '--depth', '1', gitUrl, cloneDir], {
      timeout: 60_000,
      stdio: 'pipe',
    });

    const results: Array<{ name: string; content: string }> = [];

    function walk(dir: string): void {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.name === SKILL_FILE || entry.name.endsWith('.md')) {
          const folderName = basename(dir);
          if (folderName === basename(cloneDir)) continue; // skip repo root
          const existing = results.find((r) => r.name === folderName);
          // Prefer SKILL.md over generic .md
          if (!existing || (entry.name === SKILL_FILE && existing.content)) {
            const content = readFileSync(full, 'utf-8');
            if (!existing) {
              results.push({ name: folderName, content });
            } else {
              existing.content = content;
            }
          }
        }
      }
    }

    walk(cloneDir);
    return results;
  } finally {
    rmSync(cloneDir, { recursive: true, force: true });
  }
}
