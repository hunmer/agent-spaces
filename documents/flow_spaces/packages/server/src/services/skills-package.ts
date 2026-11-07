import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, createWriteStream, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { v4 as uuid } from 'uuid';
import yauzl from 'yauzl';
import type { AgentConfig, BuiltInAgentToolName } from '@agent-spaces/shared';
import { BUILT_IN_AGENT_TOOLS } from '@agent-spaces/shared';
import { ensureDir, getDataDir } from '../storage/json-store.js';
import { listTemplates, resolveGlobalDefaultModel } from './agent.js';
import { deleteGlobalPreset } from './agent.js';

export interface InstalledSkillsPackage {
  agent: AgentConfig;
  skills: string[];
  created: boolean; // true = 新建，false = 更新已存在的
}

function getGlobalAgentTemplatesDir(): string {
  return join(getDataDir(), 'agent-templates');
}

const VALID_TOOL_NAMES = new Set<string>(BUILT_IN_AGENT_TOOLS.map((t) => t.name));
/** 过滤 manifest 声明的 tools，只保留合法的内置工具名 */
function normalizeTools(tools: unknown): NonNullable<AgentConfig['tools']> {
  if (!Array.isArray(tools)) return [];
  return tools.filter(
    (t): t is BuiltInAgentToolName => typeof t === 'string' && VALID_TOOL_NAMES.has(t),
  );
}

function getGlobalAgentTemplateDir(agentId: string): string {
  return join(getGlobalAgentTemplatesDir(), agentId);
}

/** 解压 zip 到目标目录（复用 mini-apps 的 yauzl 模式，路径安全校验） */
function extractZip(zipPath: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    mkdirSync(destDir, { recursive: true });
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err);
      if (!zipfile) return reject(new Error('Failed to open zip'));

      zipfile.readEntry();
      zipfile.on('entry', (entry: yauzl.Entry) => {
        const entryPath = entry.fileName;
        if (entryPath.includes('..') || entryPath.startsWith('/') || /^[a-zA-Z]:/.test(entryPath)) {
          zipfile.readEntry();
          return;
        }
        const fullPath = join(destDir, entryPath);

        if (/\/$/.test(entryPath)) {
          mkdirSync(fullPath, { recursive: true });
          zipfile.readEntry();
        } else {
          mkdirSync(dirname(fullPath), { recursive: true });
          zipfile.openReadStream(entry, (err2, readStream) => {
            if (err2) return reject(err2);
            const writeStream = createWriteStream(fullPath);
            writeStream.on('close', () => zipfile.readEntry());
            writeStream.on('error', reject);
            readStream.on('error', reject);
            readStream.pipe(writeStream);
          });
        }
      });

      zipfile.on('end', resolve);
      zipfile.on('error', reject);
    });
  });
}

interface PackageManifest {
  slug: string;
  displayName?: string;
  summary?: string;
  skillSlugs?: string[];
  /** 可选：覆盖默认模型配置 */
  modelProvider?: AgentConfig['modelProvider'];
  modelId?: string;
  /** 可选：图标资源（emoji 或图片 url） */
  icon?: string;
  avatarUrl?: string;
  /** 可选：要开启的内置工具名（默认空，保持最小权限） */
  tools?: string[];
}

function readManifest(extractDir: string): { manifest: PackageManifest; slugDir: string } | null {
  // zip 内结构是 {slug}/manifest.json，但也兼容 manifest.json 在根目录
  const directPath = join(extractDir, 'manifest.json');
  if (existsSync(directPath)) {
    try {
      const manifest = JSON.parse(readFileSync(directPath, 'utf-8')) as PackageManifest;
      return { manifest, slugDir: extractDir };
    } catch { /* fall through */ }
  }
  // 找一级子目录下的 manifest.json
  for (const entry of readdirSync(extractDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = join(extractDir, entry.name, 'manifest.json');
    if (existsSync(candidate)) {
      try {
        const manifest = JSON.parse(readFileSync(candidate, 'utf-8')) as PackageManifest;
        return { manifest, slugDir: join(extractDir, entry.name) };
      } catch { /* try next */ }
    }
  }
  return null;
}

/**
 * 安装技能包：
 * 1. 解压整包到临时目录
 * 2. 读 manifest + PROMPT.md
 * 3. 按 templateId=slug 去重：有则复用 agentId 更新，无则新建
 * 4. 解压包内 skills/*.zip 到 agent 模板的 skills 目录
 * 5. 手写 agent.json（绕开 writeAgentTemplate 的全局 skill 同步逻辑）
 */
export async function installSkillsPackage(zipBuffer: Buffer): Promise<InstalledSkillsPackage> {
  if (!zipBuffer || zipBuffer.length === 0) {
    throw new Error('Empty package: zip buffer is empty');
  }

  const extractDir = join(tmpdir(), `skills-pkg-${uuid()}`);
  const zipPath = join(extractDir, 'package.zip');
  mkdirSync(extractDir, { recursive: true });
  writeFileSync(zipPath, zipBuffer);

  try {
    try {
      await extractZip(zipPath, join(extractDir, 'content'));
    } catch (err) {
      throw new Error(`Failed to extract package zip: ${err instanceof Error ? err.message : String(err)}`);
    }
    const contentDir = join(extractDir, 'content');

    const parsed = readManifest(contentDir);
    if (!parsed) throw new Error('manifest.json not found in package root or first-level directory');
    const { manifest, slugDir } = parsed;
    const slug = manifest.slug || basename(slugDir);
    if (!slug) throw new Error('manifest.slug is required');

    const skillSlugs = Array.isArray(manifest.skillSlugs) ? manifest.skillSlugs : [];

    // 读 PROMPT.md 作为 systemPrompt
    const promptPath = join(slugDir, 'PROMPT.md');
    const systemPrompt = existsSync(promptPath) ? readFileSync(promptPath, 'utf-8') : '';

    // 去重：按 templateId === slug 查找已存在的 agent
    const existing = listTemplates().find((a) => a.templateId === slug);
    const created = !existing;
    const agentId = existing?.id ?? uuid();

    const agentDir = getGlobalAgentTemplateDir(agentId);
    ensureDir(agentDir);

    // 1) 先清理并重建 agent 私有 skills 目录
    const agentSkillsDir = join(agentDir, 'skills');
    if (existsSync(agentSkillsDir)) rmSync(agentSkillsDir, { recursive: true, force: true });
    ensureDir(agentSkillsDir);

    // 2) 解压包内每个 skills/*.zip 到 agentSkillsDir/{skillSlug}/
    const pkgSkillsDir = join(slugDir, 'skills');
    const installedSkills: string[] = [];
    if (existsSync(pkgSkillsDir) && statSync(pkgSkillsDir).isDirectory()) {
      for (const file of readdirSync(pkgSkillsDir)) {
        if (!file.toLowerCase().endsWith('.zip')) continue;
        const skillSlug = basename(file, '.zip');
        const skillZipPath = join(pkgSkillsDir, file);
        const targetDir = join(agentSkillsDir, skillSlug);
        try {
          await extractZip(skillZipPath, targetDir);
        } catch (err) {
          console.warn(`[skills-package] failed to extract skill ${skillSlug}:`, err);
          continue;
        }
        // 校验 SKILL.md 存在（zip 内 SKILL.md 在根目录，解压后即 targetDir/SKILL.md）
        if (existsSync(join(targetDir, 'SKILL.md'))) {
          installedSkills.push(skillSlug);
        } else {
          console.warn(`[skills-package] SKILL.md missing after extract: ${skillSlug}`);
        }
      }
    }

    // 实际开启的 skill 列表：取 manifest 声明 ∩ 实际安装成功 的交集
    const skills = skillSlugs.length > 0
      ? skillSlugs.filter((s) => installedSkills.includes(s))
      : installedSkills;

    // 3) 写 agent.json
    const defaultModel = resolveGlobalDefaultModel();
    const preset: AgentConfig = {
      id: agentId,
      name: manifest.displayName || slug,
      role: 'agent',
      description: manifest.summary || '',
      runtimeKind: 'claude-code',
      // 模型配置优先级：manifest > existing > 全局默认
      modelProvider: manifest.modelProvider ?? existing?.modelProvider ?? defaultModel?.modelProvider ?? 'anthropic-messages',
      providerId: existing?.providerId || defaultModel?.providerId,
      modelId: manifest.modelId ?? existing?.modelId ?? defaultModel?.modelId ?? 'claude-sonnet-4-6',
      workingDir: '',
      mcps: existing?.mcps ?? {},
      skills,
      // 默认不开启任何内置工具，保持最小权限；manifest 可显式声明
      tools: normalizeTools(manifest.tools) ?? existing?.tools ?? [],
      systemPrompt,
      temperature: existing?.temperature ?? 0.3,
      maxTokens: existing?.maxTokens ?? 4096,
      templateId: slug,
      enabled: true,
      avatarUrl: manifest.avatarUrl ?? existing?.avatarUrl ?? '',
      icon: manifest.icon ?? existing?.icon ?? '',
    };

    writeFileSync(join(agentDir, 'agent.json'), JSON.stringify(preset, null, 2), 'utf-8');
    // mcp.json 兜底（与其他模板结构一致）
    writeFileSync(join(agentDir, 'mcp.json'), JSON.stringify(preset.mcps ?? {}, null, 2), 'utf-8');

    console.info('[skills-package] installed', {
      slug, agentId, created, skillsCount: skills.length, skills, toolsCount: preset.tools?.length ?? 0,
    });

    return { agent: preset, skills, created };
  } finally {
    rmSync(extractDir, { recursive: true, force: true });
  }
}

/**
 * 卸载技能包：删除对应的 agent 模板（含其私有 skills 目录）。
 * 通过 templateId === slug 定位。返回是否删除成功。
 */
export function uninstallSkillsPackage(slug: string): boolean {
  const existing = listTemplates().find((a) => a.templateId === slug);
  if (!existing) return false;
  return deleteGlobalPreset(existing.id);
}

/**
 * 从商店 URL 下载 zip 并安装。
 * storeUrl 是前端解析好的完整 URL（已含 base 前缀）。
 */
export async function installSkillsPackageFromUrl(storeUrl: string): Promise<InstalledSkillsPackage> {
  let res: Response;
  try {
    res = await fetch(storeUrl);
  } catch (err) {
    throw new Error(`Download failed (network): ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!res.ok) {
    throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  }
  const zipBuffer = Buffer.from(await res.arrayBuffer());
  return installSkillsPackage(zipBuffer);
}
