import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { extname, isAbsolute, resolve } from 'node:path';
import { join } from 'node:path';
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import type { McpServerConfig, PermissionMode } from '@anthropic-ai/claude-agent-sdk';
import type { AgentFunctionTool, AgentRuntimeConfig } from '../agent-runtime-types.js';
import { isAnthropicBridgeProvider } from './types.js';

const require = createRequire(import.meta.url);

export function buildEnv(
  config: AgentRuntimeConfig,
  configDir?: string,
  override?: { baseURL?: string; apiKey?: string },
): Record<string, string | undefined> {
  const usesAnthropicBridge = isAnthropicBridgeProvider(config.provider);
  return {
    ...process.env,
    CLAUDE_CONFIG_DIR: configDir || process.env.CLAUDE_CONFIG_DIR,
    ANTHROPIC_API_KEY: override?.apiKey || config.apiKey || process.env.ANTHROPIC_API_KEY,
    ANTHROPIC_AUTH_TOKEN: override?.apiKey || config.apiKey || process.env.ANTHROPIC_AUTH_TOKEN,
    ANTHROPIC_BASE_URL: override?.baseURL || config.baseURL || process.env.ANTHROPIC_BASE_URL,
    ANTHROPIC_DEFAULT_OPUS_MODEL: usesAnthropicBridge ? undefined : config.model || process.env.ANTHROPIC_DEFAULT_OPUS_MODEL,
    ANTHROPIC_DEFAULT_SONNET_MODEL: usesAnthropicBridge ? undefined : config.model || process.env.ANTHROPIC_DEFAULT_SONNET_MODEL,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: usesAnthropicBridge ? undefined : config.model || process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL,
    CLAUDE_AGENT_SDK_CLIENT_APP: process.env.CLAUDE_AGENT_SDK_CLIENT_APP || 'agent-spaces/server',
    IS_SANDBOX: '1',
  };
}

export function normalizeMcpServers(
  servers?: Record<string, unknown>,
  functionTools?: AgentFunctionTool[],
): Record<string, McpServerConfig> | undefined {
  if ((!servers || Object.keys(servers).length === 0) && !functionTools?.length) return undefined;
  const normalized = { ...(servers ?? {}) } as Record<string, McpServerConfig>;
  if (functionTools?.length) {
    normalized['agent-spaces'] = createSdkMcpServer({
      name: 'agent-spaces',
      version: '0.1.0',
      alwaysLoad: true,
      tools: functionTools.map(createSdkTool),
    });
  }
  return normalized;
}

function createSdkTool(functionTool: AgentFunctionTool) {
  return tool(
    functionTool.name,
    functionTool.description,
    jsonSchemaToZodRawShape(functionTool.inputSchema),
    async (args) => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(await functionTool.execute(args), null, 2),
        },
      ],
    }),
    { annotations: toSdkToolAnnotations(functionTool), alwaysLoad: true },
  );
}

function toSdkToolAnnotations(functionTool: AgentFunctionTool) {
  if (!functionTool.annotations) return undefined;
  return {
    readOnlyHint: functionTool.annotations.readOnly,
    destructiveHint: functionTool.annotations.destructive,
    openWorldHint: functionTool.annotations.openWorld,
  };
}

function jsonSchemaToZodRawShape(schema: Record<string, unknown>): Record<string, any> {
  const properties = schema.properties && typeof schema.properties === 'object'
    ? schema.properties as Record<string, Record<string, unknown>>
    : {};
  const required = new Set(Array.isArray(schema.required) ? schema.required.map(String) : []);
  const shape: Record<string, any> = {};
  for (const [name, property] of Object.entries(properties)) {
    const field = jsonSchemaPropertyToZod(property);
    shape[name] = required.has(name) ? field : field.optional();
  }
  return shape;
}

function jsonSchemaPropertyToZod(property: Record<string, unknown>): any {
  const zod = require('zod');
  switch (property.type) {
    case 'number':
      return zod.number();
    case 'integer':
      return zod.number().int();
    case 'boolean':
      return zod.boolean();
    case 'array':
      return zod.array(zod.unknown());
    case 'object':
      return zod.record(zod.string(), zod.unknown());
    case 'string':
    default:
      return zod.string();
  }
}

export function resolveBundledClaudeExecutable(): string | undefined {
  const packageName = getBundledClaudePackageName();
  if (!packageName) return undefined;

  try {
    return require.resolve(`${packageName}/claude`);
  } catch {
    return undefined;
  }
}

function getBundledClaudePackageName(): string | undefined {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === 'darwin') {
    if (arch === 'arm64') return '@anthropic-ai/claude-agent-sdk-darwin-arm64';
    if (arch === 'x64') return '@anthropic-ai/claude-agent-sdk-darwin-x64';
  }

  if (platform === 'linux') {
    if (arch === 'arm64') return isMuslRuntime() ? '@anthropic-ai/claude-agent-sdk-linux-arm64-musl' : '@anthropic-ai/claude-agent-sdk-linux-arm64';
    if (arch === 'x64') return isMuslRuntime() ? '@anthropic-ai/claude-agent-sdk-linux-x64-musl' : '@anthropic-ai/claude-agent-sdk-linux-x64';
  }

  if (platform === 'win32') {
    if (arch === 'arm64') return '@anthropic-ai/claude-agent-sdk-win32-arm64';
    if (arch === 'x64') return '@anthropic-ai/claude-agent-sdk-win32-x64';
  }

  return undefined;
}

function isMuslRuntime(): boolean {
  const report = process.report?.getReport() as { header?: { glibcVersionRuntime?: string } } | undefined;
  return !report?.header?.glibcVersionRuntime;
}

export function normalizeSkillNames(skills?: string[], configDir?: string): string[] {
  if (!Array.isArray(skills)) return [];
  return skills
    .map((skill) => skill.trim().replace(/\.md$/i, ''))
    .filter((skill) => Boolean(skill) && hasSkillContent(skill, configDir));
}

export function prepareConfigDir(configDir: string, agentDir?: string): void {
  mkdirSync(configDir, { recursive: true });
  if (!agentDir) return;

  const sourceSkillsDir = join(agentDir, 'skills');
  const targetSkillsDir = join(configDir, 'skills');
  rmSync(targetSkillsDir, { recursive: true, force: true });
  mkdirSync(targetSkillsDir, { recursive: true });

  if (!existsSync(sourceSkillsDir)) return;
  for (const file of readdirSync(sourceSkillsDir)) {
    if (extname(file).toLowerCase() !== '.md') continue;
    copyFileSync(join(sourceSkillsDir, file), join(targetSkillsDir, file));
  }
}

function hasSkillContent(skill: string, configDir?: string): boolean {
  if (!configDir) return true;
  const skillFile = join(configDir, 'skills', `${skill}.md`);
  if (!existsSync(skillFile)) return false;
  return statSync(skillFile).size > 0;
}

export function normalizePermissionMode(permissionMode?: AgentRuntimeConfig['permissionMode']): PermissionMode {
  if (
    permissionMode === 'default' ||
    permissionMode === 'acceptEdits' ||
    permissionMode === 'bypassPermissions' ||
    permissionMode === 'plan' ||
    permissionMode === 'dontAsk'
  ) {
    return permissionMode;
  }
  return 'bypassPermissions';
}

export function normalizeAdditionalDirectories(cwd: string, sandboxDirs?: string[]): string[] {
  const seen = new Set<string>();
  const dirs = [cwd, ...(sandboxDirs ?? [])]
    .map((dir) => dir.trim())
    .filter(Boolean)
    .map((dir) => isAbsolute(dir) ? resolve(dir) : resolve(cwd, dir));

  return dirs.filter((dir) => {
    if (seen.has(dir)) return false;
    seen.add(dir);
    return true;
  });
}
