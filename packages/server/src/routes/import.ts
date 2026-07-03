import { Router } from 'express';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import * as llmStore from '../storage/llm-store.js';
import { importSkillsBatch } from '../services/skill.js';
import { importMcps } from '../services/mcp.js';

const router = Router();

const CC_SWITCH_DIR = join(homedir(), '.cc-switch');
const CONFIG_FILE = join(CC_SWITCH_DIR, 'config.json.migrated');
const SKILLS_DIR = join(CC_SWITCH_DIR, 'skills');

interface CcSwitchProvider {
  id: string;
  name: string;
  settingsConfig: {
    env?: Record<string, string>;
    auth?: Record<string, string>;
    config?: string;
    [key: string]: unknown;
  };
  websiteUrl?: string;
  category?: string;
}

interface CcSwitchMcpServer {
  id: string;
  name: string;
  server: {
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    type?: string;
  };
  apps?: Record<string, boolean>;
}

interface CcSwitchConfig {
  claude?: { providers?: Record<string, CcSwitchProvider>; current?: string };
  codex?: { providers?: Record<string, CcSwitchProvider>; current?: string };
  gemini?: { providers?: Record<string, CcSwitchProvider>; current?: string };
  mcp?: { servers?: Record<string, CcSwitchMcpServer> };
}

interface PreviewProvider {
  sourceId: string;
  name: string;
  apiBase: string;
  apiKey: string;
  source: string; // claude | codex | gemini
  websiteUrl?: string;
  category?: string;
  models: string[]; // deduplicated model IDs from env
}

interface PreviewSkill {
  name: string;
  path: string;
  description: string;
}

interface PreviewMcp {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
}

const MODEL_ENV_KEYS = [
  'ANTHROPIC_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
];

function extractModels(env: Record<string, string>): string[] {
  const seen = new Set<string>();
  for (const key of MODEL_ENV_KEYS) {
    const val = env[key];
    if (val && !seen.has(val)) seen.add(val);
  }
  return [...seen];
}

function parseProviders(config: CcSwitchConfig): PreviewProvider[] {
  const results: PreviewProvider[] = [];

  const sections = ['claude', 'codex', 'gemini'] as const;
  const envMappings: Record<string, { base: string; key: string }> = {
    claude: { base: 'ANTHROPIC_BASE_URL', key: 'ANTHROPIC_AUTH_TOKEN' },
    codex: { base: 'CODEX_BASE_URL', key: 'OPENAI_API_KEY' },
    gemini: { base: 'GOOGLE_GEMINI_BASE_URL', key: 'GEMINI_API_KEY' },
  };

  for (const section of sections) {
    const providers = config[section]?.providers;
    if (!providers) continue;
    const { base: baseKey, key: apiKeyKey } = envMappings[section];

    for (const [id, p] of Object.entries(providers)) {
      const env = p.settingsConfig?.env || {};
      let apiBase = env[baseKey] || '';
      let apiKey = env[apiKeyKey] || '';

      if (section === 'codex') {
        apiKey = apiKey || p.settingsConfig?.auth?.OPENAI_API_KEY || '';
        if (!apiBase) {
          const configStr = p.settingsConfig?.config || '';
          const match = configStr.match(/base_url\s*=\s*"([^"]+)"/);
          if (match) apiBase = match[1];
        }
      }

      if (section === 'claude') {
        apiKey = apiKey || env.ANTHROPIC_API_KEY || '';
      }

      if (!apiKey && !apiBase) continue;

      results.push({
        sourceId: id,
        name: p.name || id,
        apiBase,
        apiKey,
        source: section,
        websiteUrl: p.websiteUrl,
        category: p.category,
        models: extractModels(env),
      });
    }
  }

  return results;
}

function parseSkills(): PreviewSkill[] {
  if (!existsSync(SKILLS_DIR)) return [];

  const results: PreviewSkill[] = [];
  const folders = readdirSync(SKILLS_DIR).filter(f => {
    const p = join(SKILLS_DIR, f);
    return statSync(p).isDirectory() && !f.startsWith('_');
  });

  for (const folder of folders) {
    const skillFile = join(SKILLS_DIR, folder, 'SKILL.md');
    if (!existsSync(skillFile)) continue;

    const content = readFileSync(skillFile, 'utf-8');
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    let description = '';
    if (fmMatch) {
      const descMatch = fmMatch[1].match(/description:\s*["']?(.+?)["']?\s*$/m);
      if (descMatch) description = descMatch[1];
    }

    results.push({ name: folder, path: skillFile, description });
  }

  return results;
}

function parseMcps(config: CcSwitchConfig): PreviewMcp[] {
  const servers = config.mcp?.servers;
  if (!servers) return [];

  const results: PreviewMcp[] = [];
  for (const [, s] of Object.entries(servers)) {
    if (!s.server?.command) continue;
    results.push({
      name: s.name || s.id,
      command: s.server.command,
      args: s.server.args || [],
      env: s.server.env || {},
    });
  }
  return results;
}

// GET /api/import/cc-switch/preview
router.get('/cc-switch/preview', (_req, res) => {
  if (!existsSync(CONFIG_FILE)) {
    res.json({ providers: [], skills: [], mcps: [], error: 'cc-switch config not found' });
    return;
  }

  try {
    const raw = readFileSync(CONFIG_FILE, 'utf-8');
    const config: CcSwitchConfig = JSON.parse(raw);
    const providers = parseProviders(config);
    const skills = parseSkills();
    const mcps = parseMcps(config);

    res.json({ providers, skills, mcps });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// POST /api/import/cc-switch/execute
router.post('/cc-switch/execute', (req, res) => {
  const { providers: selectedProviders, skills: selectedSkills, mcps: selectedMcps } = req.body as {
    providers?: PreviewProvider[];
    skills?: PreviewSkill[];
    mcps?: PreviewMcp[];
  };

  const results = { providers: [] as string[], models: [] as string[], skills: [] as string[], mcps: [] as string[] };

  // Import providers + models
  if (selectedProviders?.length) {
    const existingProviders = llmStore.listProviders();
    const existingModels = llmStore.listModels();

    for (const p of selectedProviders) {
      if (!p.name) continue;

      // skip if provider with same name already exists
      let provider = existingProviders.find(ep => ep.name === p.name);
      if (!provider) {
        provider = llmStore.createProvider({
          name: p.name,
          apiBase: p.apiBase || '',
          apiKey: p.apiKey || '',
        });
        results.providers.push(p.name);
      } else {
        results.providers.push(`${p.name} (skipped: exists)`);
      }

      // import associated models (deduplicated)
      for (const modelId of p.models) {
        if (existingModels.some(m => m.modelId === modelId && m.provider === provider!.id)) continue;
        llmStore.createModel({
          modelId,
          name: modelId,
          provider: provider!.id,
          thinkingEnabled: true,
          thinkingEffort: 'medium',
          vision: false,
          reasoning: false,
          embedding: false,
          image: false,
        });
        results.models.push(modelId);
      }
    }
  }

  // Import skills
  if (selectedSkills?.length) {
    const items: Array<{ name: string; content: string }> = [];
    for (const s of selectedSkills) {
      const skillFile = join(SKILLS_DIR, s.name, 'SKILL.md');
      if (!existsSync(skillFile)) continue;
      items.push({ name: s.name, content: readFileSync(skillFile, 'utf-8') });
    }
    if (items.length) {
      const imported = importSkillsBatch(items);
      results.skills = imported.map(s => s.name);
    }
  }

  // Import MCP servers
  if (selectedMcps?.length) {
    const mcpServers: Record<string, { command: string; args: string[]; env: Record<string, string> }> = {};
    for (const m of selectedMcps) {
      mcpServers[m.name] = { command: m.command, args: m.args, env: m.env };
    }
    const imported = importMcps(JSON.stringify(mcpServers));
    results.mcps = imported.map(m => m.name);
  }

  res.json(results);
});

export default router;
