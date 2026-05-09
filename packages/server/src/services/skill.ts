import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { ensureDir, getDataDir } from '../storage/json-store.js';
import { listTemplates } from './agent.js';
import type { AgentConfig } from '@agent-spaces/shared';

export interface SkillInfo {
  name: string;
  description: string;
  filename: string;
  content: string;
  favorited: boolean;
  boundAgents: Array<{ id: string; name: string; avatarUrl?: string }>;
}

interface SkillMeta {
  favorites: string[];
}

function getSkillsDir(): string {
  return join(getDataDir(), 'skills');
}

function getSkillMetaPath(): string {
  return join(getSkillsDir(), '_meta.json');
}

function readMeta(): SkillMeta {
  const path = getSkillMetaPath();
  if (!existsSync(path)) return { favorites: [] };
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as SkillMeta;
  } catch {
    return { favorites: [] };
  }
}

function writeMeta(meta: SkillMeta): void {
  ensureDir(getSkillsDir());
  writeFileSync(getSkillMetaPath(), JSON.stringify(meta, null, 2), 'utf-8');
}

export function listSkills(): SkillInfo[] {
  const agents = listTemplates();
  const skillsDir = getSkillsDir();
  const meta = readMeta();
  ensureDir(skillsDir);

  const skillFiles = readdirSync(skillsDir)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'));

  return skillFiles.map((filename) => {
    const content = readFileSync(join(skillsDir, filename), 'utf-8');
    const name = basename(filename, '.md');
    const fm = parseFrontmatter(content);
    const boundAgents = agents
      .filter((a: AgentConfig) =>
        (a.skills || []).some((s: string) => {
          const skillName = s.replace(/\.md$/i, '');
          return skillName === name;
        }),
      )
      .map((a: AgentConfig) => ({
        id: a.id,
        name: a.name || 'Agent',
        avatarUrl: a.avatarUrl,
      }));

    return {
      name,
      description: fm.description || '',
      filename,
      content,
      favorited: meta.favorites.includes(name),
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

function sanitizeFilename(name: string): string {
  const safe = name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'skill';
  return safe.endsWith('.md') ? safe : `${safe}.md`;
}

export function importSkill(filename: string, content: string): SkillInfo {
  const fm = parseFrontmatter(content);
  const finalName = fm.name
    ? sanitizeFilename(fm.name)
    : sanitizeFilename(filename);
  const skillsDir = getSkillsDir();
  ensureDir(skillsDir);
  writeFileSync(join(skillsDir, finalName), content, 'utf-8');
  return {
    name: basename(finalName, '.md'),
    description: fm.description || '',
    filename: finalName,
    content,
    favorited: false,
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
  const filename = name.endsWith('.md') ? name : `${name}.md`;
  const filePath = join(skillsDir, filename);
  if (!existsSync(filePath)) return false;
  writeFileSync(filePath, content, 'utf-8');
  return true;
}

export function deleteSkill(name: string): boolean {
  const skillsDir = getSkillsDir();
  const filename = name.endsWith('.md') ? name : `${name}.md`;
  const filePath = join(skillsDir, filename);
  if (!existsSync(filePath)) return false;
  unlinkSync(filePath);
  return true;
}
