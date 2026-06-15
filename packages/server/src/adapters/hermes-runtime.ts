import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, delimiter, extname, join } from 'node:path';
import type {
  AgentRunOptions,
  AgentRunResult,
  AgentRuntime,
  AgentRuntimeConfig,
} from './agent-runtime-types.js';
import { appendOutputStyleToPrompt, summarizeResult } from './agent-runtime-types.js';
import { startCodexFunctionToolBridge, type CodexFunctionToolBridge } from './codex-function-tool-bridge.js';

/**
 * Runtime backed by the external Hermes CLI.
 *
 * Hermes does not currently expose a structured JS SDK here, so this adapter
 * classifies CLI text output before forwarding it to the UI.
 */
export class HermesRuntime implements AgentRuntime {
  private child: ChildProcessWithoutNullStreams | null = null;

  constructor(private readonly config: AgentRuntimeConfig = {}) {}

  async execute(prompt: string, workingDir: string, options?: AgentRunOptions): Promise<AgentRunResult> {
    const output: string[] = [];
    const cwd = workingDir || process.cwd();
    const startTime = Date.now();
    const d = (message: string) => console.log(`[hermes] ${truncateConsoleMessage(message)}`);
    const agentDir = options?.configDir;
    const hermesHome = agentDir ? join(agentDir, '.hermes') : undefined;
    let functionToolBridge: CodexFunctionToolBridge | undefined;

    try {
      functionToolBridge = await startCodexFunctionToolBridge(options?.functionTools, d);
      const mcpServers = withFunctionToolBridge(options?.mcpServers, functionToolBridge);
      if (hermesHome) prepareHermesHome(hermesHome, this.config, agentDir, options?.skills, mcpServers, d);

      const args = buildHermesArgs(appendOutputStyleToPrompt(prompt, options?.outputStyle), this.config, options);
      const cliProvider = getHermesCliProvider(this.config.provider);
      d(`starting | cwd=${cwd} model=${this.config.model ?? 'profile-default'} provider=${cliProvider ?? 'profile-default'} requestedProvider=${this.config.provider ?? 'profile-default'} hermesHome=${hermesHome ?? 'default'} mcpServers=${Object.keys(mcpServers ?? {}).join(',') || '-'} functionToolBridge=${functionToolBridge?.url ?? '-'} skills=${options?.skills?.join(',') || '-'}`);

      return await new Promise<AgentRunResult>((resolve) => {
      let settled = false;
      let stdoutBuffer = '';
      let stderrBuffer = '';
      let sessionId = options?.resumeSessionId;
      let emittedSessionId = sessionId;
      const lineParser = createHermesLineParser(output, options);

      const finish = (result: AgentRunResult): void => {
        if (settled) return;
        settled = true;
        this.child = null;
        resolve(result);
      };

      try {
        this.child = spawn(resolveHermesCommand(), args, {
          cwd,
          env: buildEnv(this.config, hermesHome),
          windowsHide: true,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        d(`failed to start | ${message}`);
        finish({
          success: false,
          summary: 'Hermes execution failed',
          artifacts: [],
          error: message,
          output,
          sessionId,
        });
        return;
      }

      this.child.stdout.setEncoding('utf-8');
      this.child.stderr.setEncoding('utf-8');

      this.child.stdout.on('data', (chunk: string) => {
        stdoutBuffer = consumeLines(stdoutBuffer + chunk, (line) => {
          if (!line) return;
          d(`stdout | ${line}`);
          const parsedSessionId = extractSessionId(line);
          if (parsedSessionId && parsedSessionId !== emittedSessionId) {
            sessionId = parsedSessionId;
            emittedSessionId = parsedSessionId;
            options?.onEvent?.({ type: 'session', sessionId });
          }
          lineParser.handleLine(line, 'stdout');
        });
      });

      this.child.stderr.on('data', (chunk: string) => {
        stderrBuffer = consumeLines(stderrBuffer + chunk, (line) => {
          if (!line) return;
          d(`stderr | ${line}`);
          lineParser.handleLine(line, 'stderr');
        });
      });

      this.child.on('error', (err) => {
        const message = err.message.includes('ENOENT')
          ? 'Hermes CLI was not found. Install Hermes and ensure the `hermes` command is available on PATH.'
          : err.message;
        d(`failed ${Date.now() - startTime}ms | ${message}`);
        finish({
          success: false,
          summary: 'Hermes execution failed',
          artifacts: [],
          error: message,
          output,
          sessionId,
        });
      });

      this.child.on('close', (code, signal) => {
        stdoutBuffer = flushLine(stdoutBuffer, (line) => lineParser.handleLine(line, 'stdout'));
        stderrBuffer = flushLine(stderrBuffer, (line) => lineParser.handleLine(line, 'stderr'));
        const elapsed = Date.now() - startTime;
        if (code === 0) {
          const text = lastMeaningfulLine(output);
          d(`done ${elapsed}ms`);
          finish({
            success: true,
            summary: summarizeResult(text),
            artifacts: [],
            output,
            sessionId,
          });
          return;
        }

        const error = signal
          ? `Hermes execution stopped by signal ${signal}`
          : `Hermes execution failed with exit code ${code ?? 'unknown'}`;
        d(`failed ${elapsed}ms | ${error}`);
        finish({
          success: false,
          summary: 'Hermes execution failed',
          artifacts: [],
          error,
          output,
          sessionId,
        });
      });
    });
    } catch (err) {
      const elapsed = Date.now() - startTime;
      const message = err instanceof Error ? err.message : String(err);
      d(`failed ${elapsed}ms | ${message}`);
      if (err instanceof Error && err.stack) console.error(err.stack);

      return {
        success: false,
        summary: 'Hermes execution failed',
        artifacts: [],
        error: message,
        output,
        sessionId: options?.resumeSessionId,
      };
    } finally {
      try {
        await functionToolBridge?.close();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        d(`function tool bridge close failed | ${message}`);
      }
    }
  }

  stop(): void {
    this.child?.kill();
  }
}

function buildHermesArgs(prompt: string, config: AgentRuntimeConfig, options?: AgentRunOptions): string[] {
  const args = ['chat', '-q', prompt, '--verbose'];
  for (const skill of normalizeSkillNames(options?.skills)) args.push('-s', skill);
  if (config.model) args.push('--model', config.model);
  const provider = getHermesCliProvider(config.provider);
  if (provider) args.push('--provider', provider);
  return args;
}

function getHermesCliProvider(provider: AgentRuntimeConfig['provider']): string | undefined {
  if (!provider || isAgentSpacesProtocolProvider(provider)) return undefined;
  return String(provider);
}

function isAgentSpacesProtocolProvider(provider: AgentRuntimeConfig['provider']): boolean {
  return provider === 'anthropic-messages'
    || provider === 'openai-chat-completions'
    || provider === 'openai-responses'
    || provider === 'openai-responses-to-anthropic-messages'
    || provider === 'openai-chat-completions-to-anthropic-messages'
    || provider === 'gemini-generate-content';
}

function buildEnv(config: AgentRuntimeConfig, hermesHome?: string): NodeJS.ProcessEnv {
  const apiKey = config.apiKey || process.env.HERMES_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
  return {
    ...process.env,
    AGENT_SPACES_HERMES_API_KEY: apiKey,
    HERMES_HOME: hermesHome || process.env.HERMES_HOME,
    HERMES_API_KEY: apiKey,
    HERMES_BASE_URL: config.baseURL || process.env.HERMES_BASE_URL,
    OPENAI_API_KEY: config.apiKey || process.env.OPENAI_API_KEY,
    OPENAI_BASE_URL: config.baseURL || process.env.OPENAI_BASE_URL,
    ANTHROPIC_API_KEY: config.apiKey || process.env.ANTHROPIC_API_KEY,
    NO_COLOR: process.env.NO_COLOR || '1',
  };
}

function resolveHermesCommand(): string {
  const configured = process.env.HERMES_CLI_PATH?.trim();
  if (configured) return configured;
  if (process.platform !== 'win32') return 'hermes';

  const pathCommand = resolveWindowsPathCommand('hermes.exe');
  if (pathCommand) return pathCommand;

  const candidates = [
    process.env.LOCALAPPDATA
      ? join(process.env.LOCALAPPDATA, 'hermes', 'hermes-agent', 'venv', 'Scripts', 'hermes.exe')
      : undefined,
    process.env.USERPROFILE
      ? join(process.env.USERPROFILE, 'AppData', 'Local', 'hermes', 'hermes-agent', 'venv', 'Scripts', 'hermes.exe')
      : undefined,
  ].filter((candidate): candidate is string => Boolean(candidate));

  return candidates.find((candidate) => existsSync(candidate)) ?? 'hermes';
}

function resolveWindowsPathCommand(command: string): string | undefined {
  const pathValue = getPathEnvValue();
  if (!pathValue) return undefined;

  for (const dir of pathValue.split(delimiter)) {
    if (!dir.trim()) continue;
    const candidate = join(dir.trim(), command);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

function getPathEnvValue(): string | undefined {
  return Object.entries(process.env).find(([key]) => key.toLowerCase() === 'path')?.[1];
}

function prepareHermesHome(
  hermesHome: string,
  config: AgentRuntimeConfig,
  agentDir?: string,
  requestedSkills?: string[],
  mcpServers?: Record<string, unknown>,
  log?: (message: string) => void,
): void {
  mkdirSync(hermesHome, { recursive: true });
  writeManagedHermesConfig(hermesHome, config, mcpServers, log);
  const skillsDir = join(hermesHome, 'skills');
  rmSync(skillsDir, { recursive: true, force: true });
  mkdirSync(skillsDir, { recursive: true });
  if (!agentDir) return;

  const sourceSkillsDir = join(agentDir, 'skills');
  if (!existsSync(sourceSkillsDir)) return;
  for (const file of readdirSync(sourceSkillsDir)) {
    if (extname(file).toLowerCase() !== '.md') continue;
    const sourceFile = join(sourceSkillsDir, file);
    if (!statSync(sourceFile).isFile()) continue;
    copyFileSync(sourceFile, join(skillsDir, basename(file)));
  }

  for (const skill of normalizeSkillNames(requestedSkills)) {
    const sourceFile = join(sourceSkillsDir, `${skill}.md`);
    const targetFile = join(skillsDir, `${skill}.md`);
    if (existsSync(targetFile) || !existsSync(sourceFile) || !statSync(sourceFile).isFile()) continue;
    copyFileSync(sourceFile, targetFile);
  }
}

function writeManagedHermesConfig(
  hermesHome: string,
  config: AgentRuntimeConfig,
  mcpServers?: Record<string, unknown>,
  log?: (message: string) => void,
): void {
  const normalizedMcpServers = normalizeHermesMcpServers(mcpServers);
  const hasModelConfig = Boolean(config.baseURL && config.model && isAgentSpacesProtocolProvider(config.provider));
  if (!hasModelConfig && !normalizedMcpServers) return;

  const configPath = join(hermesHome, 'config.yaml');
  if (existsSync(configPath)) {
    const content = readFileSync(configPath, 'utf-8');
    if (!isWritableAgentSpacesHermesConfigContent(content)) {
      if (!normalizedMcpServers) return;
      const nextContent = mergeManagedHermesAgentSpacesConfig(content, normalizedMcpServers);
      if (nextContent !== content) {
        writeFileSync(configPath, nextContent, 'utf-8');
        log?.(`merged Hermes MCP config | path=${configPath} servers=${Object.keys(normalizedMcpServers ?? {}).join(',') || '-'}`);
      }
      return;
    }
  }

  const content = buildManagedHermesConfig(config, normalizedMcpServers);
  writeFileSync(configPath, content, 'utf-8');
  if (normalizedMcpServers) {
    log?.(`wrote Hermes MCP config | path=${configPath} servers=${Object.keys(normalizedMcpServers).join(',')}`);
  }
}

function buildManagedHermesConfig(
  config: AgentRuntimeConfig,
  normalizedMcpServers?: Record<string, unknown>,
): string {
  const hasModelConfig = Boolean(config.baseURL && config.model && isAgentSpacesProtocolProvider(config.provider));
  const lines = [
    '# Managed by Agent Spaces for this agent profile.',
  ];

  if (hasModelConfig) {
    const apiMode = getHermesApiMode(config.provider, config.baseURL);
    lines.push(
      'model:',
      `  default: ${yamlString(config.model!)}`,
      '  provider: custom',
      `  base_url: ${yamlString(config.baseURL!)}`,
      '  api_key: ${AGENT_SPACES_HERMES_API_KEY}',
    );
    if (apiMode) lines.push(`  api_mode: ${apiMode}`);
  }

  if (normalizedMcpServers) {
    if (lines.length > 1) lines.push('');
    lines.push('mcp_servers:');
    lines.push(...yamlMappingLines(normalizedMcpServers, 2));
  }

  return `${lines.join('\n')}\n`;
}

const AGENT_SPACES_MCP_START = '  # Agent Spaces managed MCP servers start';
const AGENT_SPACES_MCP_END = '  # Agent Spaces managed MCP servers end';

function mergeManagedHermesAgentSpacesConfig(
  content: string,
  normalizedMcpServers: Record<string, unknown>,
): string {
  return mergeManagedHermesMcpServers(content, normalizedMcpServers);
}

function mergeManagedHermesMcpServers(
  content: string,
  normalizedMcpServers?: Record<string, unknown>,
): string {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();

  const mcpStart = lines.findIndex((line) => /^mcp_servers\s*:\s*(?:#.*)?$/.test(line));
  const managedBlock = normalizedMcpServers
    ? [AGENT_SPACES_MCP_START, ...yamlMappingLines(normalizedMcpServers, 2), AGENT_SPACES_MCP_END]
    : [];

  if (mcpStart === -1) {
    if (!managedBlock.length) return content;
    const nextLines = [...lines];
    if (nextLines.length && nextLines.at(-1)?.trim()) nextLines.push('');
    nextLines.push('mcp_servers:', ...managedBlock);
    return `${nextLines.join('\n')}\n`;
  }

  const mcpEnd = findNextTopLevelYamlKey(lines, mcpStart + 1);
  const before = lines.slice(0, mcpStart + 1);
  const mcpBody = removeManagedHermesMcpEntries(
    lines.slice(mcpStart + 1, mcpEnd),
    Object.keys(normalizedMcpServers ?? {}),
  );
  const after = lines.slice(mcpEnd);
  const nextLines = [
    ...before,
    ...managedBlock,
    ...mcpBody,
    ...after,
  ];
  return `${nextLines.join('\n')}\n`;
}

function findNextTopLevelYamlKey(lines: string[], startIndex: number): number {
  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (/^\S[^:]*:\s*/.test(line)) return index;
  }
  return lines.length;
}

function removeManagedHermesMcpEntries(lines: string[], managedServerNames: string[]): string[] {
  const managedNameKeys = new Set(managedServerNames.flatMap((name) => [yamlKey(name), yamlString(name)]));
  const result: string[] = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (line === AGENT_SPACES_MCP_START) {
      index += 1;
      while (index < lines.length && lines[index] !== AGENT_SPACES_MCP_END) index += 1;
      if (index < lines.length) index += 1;
      continue;
    }

    const entryKey = readIndentedYamlKey(line, 2);
    if (entryKey && managedNameKeys.has(entryKey)) {
      index += 1;
      while (index < lines.length && !readIndentedYamlKey(lines[index], 2)) index += 1;
      continue;
    }

    result.push(line);
    index += 1;
  }
  return result;
}

function readIndentedYamlKey(line: string, indent: number): string | undefined {
  if (!line.startsWith(' '.repeat(indent)) || line.startsWith(' '.repeat(indent + 1))) return undefined;
  const match = line.slice(indent).match(/^((?:"(?:\\.|[^"])*")|[A-Za-z0-9_-]+)\s*:/);
  return match?.[1];
}

function withFunctionToolBridge(
  mcpServers: Record<string, unknown> | undefined,
  bridge: CodexFunctionToolBridge | undefined,
): Record<string, unknown> | undefined {
  if (!bridge) return mcpServers;
  return {
    ...(mcpServers ?? {}),
    [bridge.name]: { url: bridge.url },
  };
}

function normalizeHermesMcpServers(servers?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!servers || Object.keys(servers).length === 0) return undefined;
  const normalized = Object.fromEntries(
    Object.entries(servers).flatMap(([name, server]) => {
      const normalizedServer = normalizeHermesMcpServer(server);
      return normalizedServer ? [[name, normalizedServer]] : [];
    }),
  );
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function normalizeHermesMcpServer(server: unknown): Record<string, unknown> | null {
  if (!server || typeof server !== 'object' || Array.isArray(server)) return null;
  const record = server as Record<string, unknown>;

  if (typeof record.command === 'string') {
    return removeUndefined({
      command: record.command,
      args: Array.isArray(record.args) ? record.args.map(String) : undefined,
      env: isRecord(record.env) ? record.env : undefined,
      ssl_verify: isBooleanOrString(record.ssl_verify) ? record.ssl_verify : undefined,
      client_cert: isStringOrStringArray(record.client_cert) ? record.client_cert : undefined,
      client_key: typeof record.client_key === 'string' ? record.client_key : undefined,
      enabled: typeof record.enabled === 'boolean' ? record.enabled : true,
      timeout: typeof record.timeout === 'number' ? record.timeout : undefined,
      connect_timeout: typeof record.connect_timeout === 'number' ? record.connect_timeout : undefined,
      supports_parallel_tool_calls: typeof record.supports_parallel_tool_calls === 'boolean'
        ? record.supports_parallel_tool_calls
        : undefined,
      tools: isRecord(record.tools) ? record.tools : undefined,
      sampling: isRecord(record.sampling) ? record.sampling : undefined,
    });
  }

  if (typeof record.url === 'string') {
    return removeUndefined({
      url: record.url,
      headers: isRecord(record.headers) ? record.headers : undefined,
      ssl_verify: isBooleanOrString(record.ssl_verify) ? record.ssl_verify : undefined,
      client_cert: isStringOrStringArray(record.client_cert) ? record.client_cert : undefined,
      client_key: typeof record.client_key === 'string' ? record.client_key : undefined,
      enabled: typeof record.enabled === 'boolean' ? record.enabled : true,
      timeout: typeof record.timeout === 'number' ? record.timeout : undefined,
      connect_timeout: typeof record.connect_timeout === 'number' ? record.connect_timeout : undefined,
      supports_parallel_tool_calls: typeof record.supports_parallel_tool_calls === 'boolean'
        ? record.supports_parallel_tool_calls
        : undefined,
      tools: isRecord(record.tools) ? record.tools : undefined,
      auth: typeof record.auth === 'string' ? record.auth : undefined,
      sampling: isRecord(record.sampling) ? record.sampling : undefined,
    });
  }

  return null;
}

function yamlMappingLines(value: Record<string, unknown>, indent: number): string[] {
  return Object.entries(value).flatMap(([key, child]) => yamlEntryLines(key, child, indent));
}

function yamlEntryLines(key: string, value: unknown, indent: number): string[] {
  const prefix = ' '.repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${prefix}${yamlKey(key)}: []`];
    return [
      `${prefix}${yamlKey(key)}:`,
      ...value.map((item) => `${' '.repeat(indent + 2)}- ${yamlInlineValue(item)}`),
    ];
  }
  if (isRecord(value)) {
    const entries = yamlMappingLines(value, indent + 2);
    return entries.length ? [`${prefix}${yamlKey(key)}:`, ...entries] : [`${prefix}${yamlKey(key)}: {}`];
  }
  return [`${prefix}${yamlKey(key)}: ${yamlInlineValue(value)}`];
}

function yamlInlineValue(value: unknown): string {
  if (typeof value === 'string') return yamlString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null) return 'null';
  return yamlString(JSON.stringify(value));
}

function yamlKey(value: string): string {
  return /^[A-Za-z0-9_-]+$/.test(value) ? value : yamlString(value);
}

function removeUndefined(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isBooleanOrString(value: unknown): value is boolean | string {
  return typeof value === 'boolean' || typeof value === 'string';
}

function isStringOrStringArray(value: unknown): value is string | string[] {
  return typeof value === 'string' || (Array.isArray(value) && value.every((item) => typeof item === 'string'));
}

function isWritableAgentSpacesHermesConfigContent(content: string): boolean {
  return content.startsWith('# Managed by Agent Spaces for this agent profile.')
    || content.includes('api_key: ${AGENT_SPACES_HERMES_API_KEY}');
}

function getHermesApiMode(provider: AgentRuntimeConfig['provider'], baseURL?: string): string | undefined {
  switch (provider) {
    case 'anthropic-messages':
      return isAnthropicCompatibleBaseURL(baseURL) ? 'anthropic_messages' : 'chat_completions';
    case 'openai-chat-completions':
    case 'openai-chat-completions-to-anthropic-messages':
      return 'chat_completions';
    case 'openai-responses':
    case 'openai-responses-to-anthropic-messages':
      return 'codex_responses';
    default:
      return undefined;
  }
}

function isAnthropicCompatibleBaseURL(baseURL?: string): boolean {
  if (!baseURL) return false;
  try {
    const url = new URL(baseURL);
    return url.hostname.toLowerCase().endsWith('anthropic.com')
      || url.pathname.toLowerCase().split('/').includes('anthropic');
  } catch {
    return false;
  }
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function truncateConsoleMessage(message: string): string {
  const maxLength = 600;
  if (message.length <= maxLength) return message;
  return `${message.slice(0, maxLength)}... [truncated ${message.length - maxLength} chars]`;
}

function consumeLines(buffer: string, onLine: (line: string) => void): string {
  const lines = buffer.split(/\r?\n/);
  const remainder = lines.pop() ?? '';
  for (const line of lines) onLine(stripAnsi(line).trimEnd());
  return remainder;
}

function flushLine(buffer: string, onLine: (line: string) => void): string {
  const line = stripAnsi(buffer).trimEnd();
  if (line) onLine(line);
  return '';
}

function extractSessionId(line: string): string | undefined {
  const match = line.match(/\bsession(?:\s+id)?\s*[:=]\s*([a-zA-Z0-9._:-]+)/i);
  return match?.[1];
}

function normalizeSkillNames(skills?: string[]): string[] {
  if (!Array.isArray(skills)) return [];
  return skills
    .map((skill) => basename(skill).replace(/\.md$/i, '').trim())
    .filter(Boolean);
}

function lastMeaningfulLine(output: string[]): string {
  return [...output].reverse().find((line) => line.trim() && !isDiagnosticOutputLine(line)) ?? '';
}

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, '');
}

type HermesLineSource = 'stdout' | 'stderr';

interface HermesLineParser {
  handleLine(line: string, source: HermesLineSource): void;
}

function createHermesLineParser(output: string[], options?: AgentRunOptions): HermesLineParser {
  let inEchoedQuery = false;
  let inRuntimeConfig = false;
  let inUserMessageEcho = false;
  let inVerboseArgsBlock = false;
  let inVerboseResultBlock = false;
  let inVerboseThinkingBlock = false;
  let inCapturedReasoningBlock = false;
  let toolUseIndex = 0;

  const emitOutput = (line: string): void => {
    output.push(line);
    options?.onEvent?.({ type: 'output', line });
  };

  const emitReasoning = (text: string): void => {
    const normalized = text.trim();
    if (!normalized) return;
    options?.onEvent?.({ type: 'reasoning', text: normalized, status: 'completed' });
  };

  const emitToolUse = (tool: { name: string; input?: unknown; rawInput?: string }): void => {
    toolUseIndex += 1;
    const id = `hermes-tool-${toolUseIndex}`;
    const line = tool.rawInput ? `Tool: ${tool.name} ${tool.rawInput}` : `Tool: ${tool.name}`;
    options?.onEvent?.({
      type: 'tool_use',
      id,
      name: tool.name,
      input: tool.input,
      line,
    });
  };

  return {
    handleLine(line, source) {
      const normalized = line.trim();
      if (!normalized) return;

      if (inCapturedReasoningBlock) {
        if (source === 'stderr' && !isHermesLogLine(normalized)) {
          emitReasoning(normalized);
          return;
        }
        if (source === 'stderr') inCapturedReasoningBlock = false;
      }

      const capturedReasoning = parseCapturedReasoningStart(normalized);
      if (capturedReasoning !== undefined) {
        if (capturedReasoning) emitReasoning(capturedReasoning);
        inCapturedReasoningBlock = true;
        return;
      }

      const toolUse = parseHermesToolUse(normalized);
      if (toolUse) {
        emitToolUse(toolUse);
        return;
      }

      if (isHermesUsageLine(normalized)) return;

      const reasoning = parseHermesReasoningLine(normalized);
      if (reasoning) {
        emitReasoning(reasoning);
        return;
      }

      if (source === 'stderr') return;

      if (inVerboseThinkingBlock) {
        if (!isHermesThinkingContinuationLine(normalized)) {
          inVerboseThinkingBlock = false;
        } else {
          emitReasoning(normalized);
          return;
        }
      }

      if (inVerboseResultBlock) {
        if (isHermesVerboseBlockBoundaryLine(normalized)) inVerboseResultBlock = false;
        else {
          if (normalized.endsWith('}')) inVerboseResultBlock = false;
          return;
        }
      }

      if (inVerboseArgsBlock) {
        if (normalized === '}') inVerboseArgsBlock = false;
        return;
      }

      if (inUserMessageEcho) return;

      if (/^\[thinking\]/i.test(normalized)) {
        emitReasoning(normalized.replace(/^\[thinking\]\s*/i, ''));
        inVerboseThinkingBlock = true;
        return;
      }

      if (/^Args:\s*\{$/i.test(normalized)) {
        inVerboseArgsBlock = true;
        return;
      }

      if (/^Result:\s*/i.test(normalized)) {
        if (!normalized.endsWith('}')) inVerboseResultBlock = true;
        return;
      }

      if (/^Query:\s*/i.test(normalized)) {
        inEchoedQuery = true;
        return;
      }

      if (inEchoedQuery && isHermesRuntimeBoundaryLine(normalized)) {
        inEchoedQuery = false;
      }

      if (/^Agent runtime configuration:\s*$/i.test(normalized)) {
        inEchoedQuery = false;
        inRuntimeConfig = true;
        return;
      }

      if (inEchoedQuery) return;

      if (inRuntimeConfig) {
        if (/^User message:\s*$/i.test(normalized)) {
          inRuntimeConfig = false;
          inUserMessageEcho = true;
          return;
        }
        if (isHermesRuntimeConfigLine(normalized)) return;
        inRuntimeConfig = false;
      }

      if (isHermesNoiseLine(normalized)) return;
      emitOutput(normalized);
    },
  };
}

function parseHermesToolUse(line: string): { name: string; input?: unknown; rawInput?: string } | null {
  const match = line.match(/\bTool call:\s*([A-Za-z_][\w.-]*)\s+with args:\s*(.+)$/i);
  if (!match) return null;

  const name = match[1];
  const rawInput = match[2].replace(/\.\.\.$/, '').trim();
  return {
    name,
    rawInput,
    input: parseJsonObject(rawInput) ?? rawInput,
  };
}

function parseHermesReasoningLine(line: string): string | undefined {
  return line.match(/\b(?:Reasoning|Thinking):\s*(.+)$/i)?.[1]?.trim();
}

function parseCapturedReasoningStart(line: string): string | undefined {
  const match = line.match(/\bCaptured reasoning \(\d+ chars\):\s*(.*)$/i);
  if (!match) return undefined;
  return match[1].trim();
}

function isHermesLogLine(line: string): boolean {
  return /^\d{2}:\d{2}:\d{2}\s+-\s+/.test(line);
}

function isHermesUsageLine(line: string): boolean {
  const apiCallMatch = line.match(/\bAPI call #\d+:.*?\bin=([\d,]+)\s+out=([\d,]+)\s+total=([\d,]+)/i);
  if (apiCallMatch) return true;

  const tokenUsageMatch = line.match(/\bToken usage:\s*prompt=([\d,]+),\s*completion=([\d,]+),\s*total=([\d,]+)/i);
  return Boolean(tokenUsageMatch);
}

function parseJsonObject(value: string): unknown | undefined {
  if (!value.startsWith('{') && !value.startsWith('[')) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function isHermesNoiseLine(line: string): boolean {
  return /^\u{1f916}\s*AI Agent initialized\b/iu.test(line)
    || /^\u{1f517}\s*Using custom base URL:/iu.test(line)
    || /^\u{1f511}\s*Using API key:/iu.test(line)
    || /^\u{1f511}\s*Using token:/iu.test(line)
    || isHermesRuntimeBoundaryLine(line)
    || isHermesVerboseUiLine(line);
}

function isHermesRuntimeBoundaryLine(line: string): boolean {
  return /^Initializing agent\b/i.test(line)
    || /^\u{1f916}\s*AI Agent initialized\b/iu.test(line);
}

function isHermesRuntimeConfigLine(line: string): boolean {
  return /^-\s+/.test(line)
    || /^(skills|directory,|paths\.|tools you have,|are|built-in runtime tools|internals, previous sessions, or filesystem settings\.)$/i.test(line)
    || /^For Bash commands that create or modify files under the current working\b/i.test(line)
    || /^When asked what MCP servers, skills, runtime tools, or Agent Spaces channel\b/i.test(line)
    || /^Important distinction: MCP servers configured for this agent are only the names\b/i.test(line)
    || /^in "MCP servers configured for this agent"\./i.test(line)
    || /^Do not infer availability from provider-side function names, hidden runtime\b/i.test(line);
}

function isHermesVerboseUiLine(line: string): boolean {
  return /^[\u{2705}\u{1f6e0}\u{fe0f}\u{26a0}\u{1f512}\u{1f4be}\u{1f4ca}\u{1f4ac}\u{1f389}\u{1f4de}]/u.test(line)
    || /^[\u{2500}\u{256d}\u{2570}\u{2502}]/u.test(line)
    || /^\[thinking\]/i.test(line)
    || /^┊\s*/u.test(line)
    || /^(Tool \d+:|Args:|Result:|Resume this session with:|Session:|Duration:|Messages:)/i.test(line)
    || /^hermes\s+--resume\b/i.test(line)
    || /^\{".*"\}?$/.test(line);
}

function isHermesVerboseBlockBoundaryLine(line: string): boolean {
  return /^\[thinking\]/i.test(line)
    || /^[\u{2705}\u{1f389}\u{1f4de}]/u.test(line)
    || /^[\u{2500}\u{256d}\u{2570}\u{2502}]/u.test(line)
    || /^(Tool \d+:|Args:|Result:|Resume this session with:|Session:|Duration:|Messages:)/i.test(line)
    || /^hermes\s+--resume\b/i.test(line);
}

function isHermesThinkingContinuationLine(line: string): boolean {
  return !isHermesVerboseBlockBoundaryLine(line)
    && !/^\[Usage\]/i.test(line)
    && !/^Tool:\s*/i.test(line);
}

function isDiagnosticOutputLine(line: string): boolean {
  return line.startsWith('[stderr]')
    || /^\[Usage\]/i.test(line)
    || /^Tool:\s*/i.test(line)
    || isHermesNoiseLine(line);
}
