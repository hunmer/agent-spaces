import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { Options, Query, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type { Base64ImageSource, Base64PDFSource, DocumentBlockParam, ImageBlockParam, TextBlockParam } from '@anthropic-ai/sdk/resources/messages/messages';
import type { ClaudeHookEventName, Message } from '@agent-spaces/shared';
import type { AgentRunOptions, AgentRunResult, AgentRuntime, AgentRuntimeConfig } from '../agent-runtime-types.js';
import { summarizeResult } from '../agent-runtime-types.js';
import { prepareClaudeOutputStyleFile } from '../../services/output-style.js';
import { normalizeAdditionalDirectories, normalizePermissionMode, normalizeSkillNames, prepareConfigDir, resolveBundledClaudeExecutable, buildEnv, normalizeMcpServers } from './sdk-config.js';
import { startClaudeAdapterIfNeeded, getClaudeCodeModel } from './adapter-pool.js';
import { extractClaudeHookEvents, extractThinkingEvents, extractToolUseEvents, extractToolResultEvent, logToolDebug, formatMessage, isAskUserQuestionAutoResult, countUsageTokens, normalizeUsage } from './message-format.js';
import { getDataDir } from '../../storage/json-store.js';

type ClaudeQueryOptions = Options & {
  outputStyle?: string;
};

const isSourceRuntime = /[\\/]src[\\/]adapters[\\/]claude-code-runtime$/.test(import.meta.dirname);
const isDev = process.env.NODE_ENV === 'development' || (!process.env.NODE_ENV && isSourceRuntime);
const SERVER_PUBLIC_DIR = join(fileURLToPath(new URL('../../../public/', import.meta.url)));

export class ClaudeCodeRuntime implements AgentRuntime {
  private abortController: AbortController | null = null;
  private activeQuery: Query | null = null;
  private adapterRun: import('./types.js').ClaudeAdapterRun | null = null;

  constructor(private readonly config: AgentRuntimeConfig = {}) {}

  async execute(prompt: string, workingDir: string, options?: AgentRunOptions): Promise<AgentRunResult> {
    this.abortController = new AbortController();
    const output: string[] = [];
    const cwd = workingDir || process.cwd();
    const startTime = Date.now();
    const MAX_LOG = 500;
    const d = (msg: string) => console.log(`[claude-code] ${msg.length > MAX_LOG ? msg.slice(0, MAX_LOG) + '...' : msg}`);
    const permissionMode = normalizePermissionMode(this.config.permissionMode);
    const agentDir = options?.configDir;
    const configDir = agentDir ? join(agentDir, '.claude') : undefined;
    if (configDir) prepareConfigDir(configDir, agentDir);
    const skillNames = normalizeSkillNames(options?.skills, configDir);
    const allowedToolNames = normalizeAllowedToolNames(options?.tools, options?.functionTools);
    const outputStyleFile = configDir ? prepareClaudeOutputStyleFile(configDir, options?.outputStyle) : undefined;
    const claudeExecutable = resolveBundledClaudeExecutable();
    this.adapterRun = await startClaudeAdapterIfNeeded(this.config);
    const baseURL = this.adapterRun?.url ?? this.config.baseURL;
    const apiKey = this.adapterRun ? 'default' : this.config.apiKey;
    const model = getClaudeCodeModel(this.config);
    const additionalDirectories = normalizeAdditionalDirectories(cwd, options?.sandboxDirs);
    const sdkMcpServers = normalizeMcpServers(options?.mcpServers, options?.functionTools);
    const sdkMcpServerNames = Object.keys(sdkMcpServers ?? {});
    const startupTimeoutMs = readPositiveIntegerEnv('AGENT_SPACES_CLAUDE_STARTUP_TIMEOUT_MS') ?? 60_000;

    d(`starting | cwd=${cwd} model=${model ?? 'default'} targetModel=${this.config.model ?? 'default'} provider=${this.config.provider ?? 'default'} baseURL=${baseURL ?? 'default'} permissionMode=${permissionMode} maxTurns=${options?.maxTurns ?? '∞'} allowedTools=${allowedToolNames.join(',') || '-'} mcpServers=${Object.keys(options?.mcpServers ?? {}).join(',') || '-'} skills=${skillNames.join(',') || '-'} configDir=${configDir ?? 'default'} sandboxDirs=${additionalDirectories.join(',') || '-'} claudeExecutable=${claudeExecutable ?? 'sdk-default'}`);
    d(`apikey: ${apiKey}`)
    d(`prompt: ${prompt.slice(0, 300)}${prompt.length > 300 ? '...' : ''}`);
    d(`sdk mcp servers | ${sdkMcpServerNames.join(',') || '-'}`);

    const stderrLines: string[] = [];
    let startupTimeoutError: string | undefined;
    let startupWatchdog: ReturnType<typeof setTimeout> | undefined;
    let sawFirstSdkMessage = false;
    let sessionId = options?.resumeSessionId;
    const emitHook = (event: ClaudeHookEventName, matcher = '*', payload?: unknown) => {
      options?.onEvent?.({ type: 'hook_event', event, matcher, payload });
    };

    try {
      emitHook('SessionStart', '*', {
        cwd,
        model,
        provider: this.config.provider,
        baseURL,
        permissionMode,
        configDir,
        sandboxDirs: additionalDirectories,
        resumeSessionId: options?.resumeSessionId,
      });
      const hookUserPrompt = options?.userPrompt ?? prompt;
      emitHook('UserPromptSubmit', '*', {
        prompt: hookUserPrompt,
        message: hookUserPrompt,
        userMessage: hookUserPrompt,
        fullPrompt: prompt,
        cwd,
        configDir,
      });
      if (/CLAUDE\.md|AGENTS\.md|\.claude\/rules\//.test(prompt)) {
        emitHook('InstructionsLoaded', '*', { source: 'prompt', promptPreview: prompt.slice(0, 1000) });
      }

      const queryOptions: Options & { outputStyle?: string } = {
        cwd,
        model,
        maxTurns: options?.maxTurns,
        pathToClaudeCodeExecutable: claudeExecutable,
        tools: { type: 'preset', preset: 'claude_code' },
        allowedTools: allowedToolNames,
        mcpServers: sdkMcpServers,
        skills: skillNames,
        outputStyle: outputStyleFile,
        managedSettings: {
          strictPluginOnlyCustomization: ['mcp'],
        },
        settingSources: isDev ? ['user', 'local'] : ['user', 'project', 'local'],
        strictMcpConfig: true,
        additionalDirectories,
        permissionMode,
        allowDangerouslySkipPermissions: permissionMode === 'bypassPermissions' ? true : undefined,
        resume: options?.resumeSessionId,
        abortController: this.abortController,
        env: buildEnv(this.config, configDir, { baseURL, apiKey }),
        stderr: (data) => {
          const line = data.trim();
          if (line) {
            stderrLines.push(line);
            d(`stderr: ${line}`);
          }
        },
      };

      const attachmentContext = buildClaudeAttachmentContext(options?.userAttachments);
      if (options?.userAttachments?.length) {
        d(`attachments | total=${options.userAttachments.length} supported=${attachmentContext.supportedCount} ignored=${attachmentContext.ignoredCount} kinds=${attachmentContext.summary || '-'}`);
        for (const line of attachmentContext.debugLines) d(`attachments | ${line}`);
        const attachmentDebugText = buildAttachmentDebugReasoning(attachmentContext, options.userAttachments.length);
        if (attachmentDebugText) {
          options?.onEvent?.({ type: 'reasoning', text: attachmentDebugText, status: 'completed' });
        }
      }
      this.activeQuery = query({ prompt: buildClaudePrompt(prompt, attachmentContext), options: queryOptions });
      d(`sdk query created | startupTimeoutMs=${startupTimeoutMs}`);
      startupWatchdog = setTimeout(() => {
        if (sawFirstSdkMessage) return;
        startupTimeoutError = `Claude Code startup timed out after ${startupTimeoutMs}ms while waiting for the first SDK message. mcpServers=${sdkMcpServerNames.join(',') || '-'}`;
        d(startupTimeoutError);
        this.abortController?.abort();
        this.activeQuery?.close();
      }, startupTimeoutMs);

      let resultText = '';
      let turns = 0;
      let tokenCount = 0;
      let error: string | undefined;
      let usage: AgentRunResult['usage'];
      let costUsd: number | undefined;
      let sawResult = false;
      const pendingAskUserQuestionToolIds = new Set<string>();
      const pendingPauseToolIds = new Set<string>();
      const pauseAfterTools = new Set(options?.pauseAfterTools ?? []);
      let waitingForUserAnswer = false;
      let waitingForExternalInput = false;

      for await (const message of this.activeQuery) {
        if (!sawFirstSdkMessage) {
          sawFirstSdkMessage = true;
          if (startupWatchdog) {
            clearTimeout(startupWatchdog);
            startupWatchdog = undefined;
          }
          d(`first sdk message ${Date.now() - startTime}ms | type=${message.type}`);
        }

        for (const hookEvent of extractClaudeHookEvents(message)) {
          emitHook(hookEvent.event, hookEvent.matcher, hookEvent.payload);
        }

        const nextSessionId = readSessionId(message);
        if (nextSessionId && nextSessionId !== sessionId) {
          sessionId = nextSessionId;
          options?.onEvent?.({ type: 'session', sessionId });
        }
        const toolUses = extractToolUseEvents(message);
        let sawAskUserQuestion = false;
        for (const toolUse of toolUses) {
          if (toolUse.name === 'AskUserQuestion') {
            pendingAskUserQuestionToolIds.add(toolUse.id);
            waitingForUserAnswer = true;
            sawAskUserQuestion = true;
          }
          if (pauseAfterTools.has(toolUse.name)) pendingPauseToolIds.add(toolUse.id);
        }
        const toolResult = extractToolResultEvent(message);
        const pauseForExternalInput = Boolean(toolResult?.toolUseId && pendingPauseToolIds.has(toolResult.toolUseId));
        if (pauseForExternalInput) waitingForExternalInput = true;
        const suppressAskUserQuestionResult = Boolean(
          toolResult
          && isAskUserQuestionAutoResult(toolResult.result)
          && (pendingAskUserQuestionToolIds.size > 0
            || (toolResult.toolUseId ? pendingAskUserQuestionToolIds.has(toolResult.toolUseId) : false)),
        );
        if (suppressAskUserQuestionResult) {
          waitingForUserAnswer = true;
        }

        logToolDebug(message, d, { suppressAskUserQuestionResult });
        for (const text of extractThinkingEvents(message)) {
          d(`thinking | ${text}`);
          options?.onEvent?.({ type: 'reasoning', text, status: 'completed' });
        }
        for (const toolUse of toolUses) {
          options?.onEvent?.({ type: 'tool_use', ...toolUse });
        }
        if (toolResult && !suppressAskUserQuestionResult) {
          options?.onEvent?.({ type: 'tool_result', ...toolResult });
        }
        const line = formatMessage(message);
        if (line && !isAskUserQuestionAutoResult(line)) {
          if (message.type === 'assistant') {
            d(`assistant | ${line}`);
          }
          output.push(line);
          options?.onEvent?.({ type: 'output', line });
        }

        if (message.type === 'result') {
          sawResult = true;
          turns = message.num_turns;
          tokenCount = countUsageTokens(message.usage);
          usage = normalizeUsage(message.usage);
          costUsd = readTotalCostUsd(message);
          sessionId = readSessionId(message) ?? sessionId;
          if (message.subtype === 'success') {
            if (!isAskUserQuestionAutoResult(message.result)) {
              resultText = message.result;
            }
          } else {
            error = message.errors.join('\n') || message.subtype;
          }
        }

        if (sawAskUserQuestion || pauseForExternalInput) break;
      }

      const elapsed = Date.now() - startTime;
      if (waitingForUserAnswer || waitingForExternalInput) {
        const summary = waitingForUserAnswer ? 'Waiting for user answer' : 'Waiting for external input';
        const status = waitingForUserAnswer ? 'waiting_for_user_answer' : 'waiting_for_external_input';
        d(`${summary.toLowerCase()} ${elapsed}ms | turns=${turns} tokens=${tokenCount}`);
        const message = resultText || output.at(-1) || summary;
        emitHook('Stop', '*', {
          status,
          message,
          finalMessage: message,
          output,
          elapsedMs: elapsed,
          turns,
          tokenCount,
          sessionId,
        });
        return {
          success: true,
          summary,
          artifacts: [],
          output,
          usage,
          costUsd,
          sessionId,
        };
      }

      if (!sawResult) {
        const runtimeError = extractRuntimeError([...stderrLines, ...output])
          || 'Claude Code execution stopped before reporting a final result';
        d(`failed ${elapsed}ms | turns=${turns} tokens=${tokenCount} | ${runtimeError}`);
        emitHook('StopFailure', '*', { error: runtimeError, elapsedMs: elapsed, turns, tokenCount, sessionId, stderr: stderrLines });
        appendUnique(output, stderrLines);
        appendUnique(output, [runtimeError]);
        return {
          success: false,
          summary: 'Claude Code execution failed',
          artifacts: [],
          error: runtimeError,
          output,
          usage,
          costUsd,
          sessionId,
        };
      }

      if (waitingForUserAnswer && (!error || isAskUserQuestionAutoResult(error))) {
        d(`waiting for user answer ${elapsed}ms | turns=${turns} tokens=${tokenCount}`);
        const message = resultText || output.at(-1) || 'Waiting for user answer';
        emitHook('Stop', '*', {
          status: 'waiting_for_user_answer',
          message,
          finalMessage: message,
          output,
          elapsedMs: elapsed,
          turns,
          tokenCount,
          sessionId,
        });
        return {
          success: true,
          summary: 'Waiting for user answer',
          artifacts: [],
          output,
          usage,
          costUsd,
          sessionId,
        };
      }

      if (error) {
        const runtimeError = extractRuntimeError([error, ...stderrLines, ...output]) || error;
        d(`failed ${elapsed}ms | turns=${turns} tokens=${tokenCount} | ${runtimeError}`);
        emitHook('StopFailure', '*', { error: runtimeError, elapsedMs: elapsed, turns, tokenCount, sessionId, stderr: stderrLines });
        appendUnique(output, stderrLines);
        return {
          success: false,
          summary: 'Claude Code execution failed',
          artifacts: [],
          error: runtimeError,
          output,
          usage,
          costUsd,
          sessionId,
        };
      }

      const text = resultText || output.at(-1) || '';
      if (text.trim()) {
        d(`final message | ${text.trim()}`);
      }
      d(`done ${elapsed}ms | turns=${turns} tokens=${tokenCount}`);

      const finalOutput = resultText && !output.includes(resultText) ? [...output, resultText] : output;
      emitHook('Stop', '*', {
        status: 'success',
        message: text,
        finalMessage: text,
        output: finalOutput,
        elapsedMs: elapsed,
        turns,
        tokenCount,
        sessionId,
        usage,
        costUsd,
      });

      return {
        success: true,
        summary: summarizeResult(text),
        artifacts: [],
        output: finalOutput,
        usage,
        costUsd,
        sessionId,
      };
    } catch (err) {
      const elapsed = Date.now() - startTime;
      const message = startupTimeoutError ?? (err instanceof Error ? err.message : String(err));
      const runtimeError = extractRuntimeError([message, ...stderrLines, ...output]) || message;
      d(`failed ${elapsed}ms | ${runtimeError}`);
      if (err instanceof Error && err.stack) console.error(err.stack);
      emitHook('StopFailure', '*', { error: runtimeError, elapsedMs: elapsed, stderr: stderrLines, stack: err instanceof Error ? err.stack : undefined });

      appendUnique(output, stderrLines);
      appendUnique(output, [runtimeError]);
      return { success: false, summary: 'Claude Code execution failed', artifacts: [], error: runtimeError, output, sessionId: options?.resumeSessionId };
    } finally {
      if (startupWatchdog) clearTimeout(startupWatchdog);
      emitHook('SessionEnd', '*', { cwd, sessionId });
      this.activeQuery?.close();
      this.activeQuery = null;
      await this.adapterRun?.release();
      this.adapterRun = null;
      this.abortController = null;
    }
  }

  stop(): void {
    this.abortController?.abort();
    void this.activeQuery?.interrupt().catch(() => {
      this.activeQuery?.close();
    });
  }
}

function readPositiveIntegerEnv(name: string): number | undefined {
  const value = process.env[name]?.trim();
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function normalizeAllowedToolNames(tools: string[] | undefined, functionTools: AgentRunOptions['functionTools']): string[] {
  const names = new Set(Array.isArray(tools) ? tools : []);
  for (const tool of functionTools ?? []) {
    names.add(`mcp__agent-spaces__${tool.name}`);
  }
  return [...names];
}

function readSessionId(message: unknown): string | undefined {
  if (!message || typeof message !== 'object') return undefined;
  const value = (message as { session_id?: unknown }).session_id;
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function readTotalCostUsd(message: unknown): number | undefined {
  if (!message || typeof message !== 'object') return undefined;
  const value = (message as { total_cost_usd?: unknown }).total_cost_usd;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function extractRuntimeError(lines: string[]): string | undefined {
  const text = lines
    .filter((line) => typeof line === 'string' && line.trim().length > 0)
    .join('\n');
  if (!text) return undefined;

  const match = text.match(/(?:API Error|Request rejected|Too Many Requests|rate limit|overloaded|429)[^\n]*/i);
  return match?.[0]?.trim();
}

function appendUnique(target: string[], lines: string[]): void {
  for (const line of lines) {
    if (!line || target.includes(line)) continue;
    target.push(line);
  }
}

type ClaudePromptInput = string | AsyncIterable<SDKUserMessage>;

type ClaudeAttachmentContext = {
  parts: ClaudeAttachmentPart[];
  supportedCount: number;
  ignoredCount: number;
  summary: string;
  debugLines: string[];
};

type ClaudeUserContent = string | Array<TextBlockParam | ClaudeAttachmentPart>;

type ClaudeAttachmentPart = ImageBlockParam | DocumentBlockParam;

type ClaudeImageMimeType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

function buildClaudePrompt(
  prompt: string,
  attachmentContext: ClaudeAttachmentContext,
): ClaudePromptInput {
  const content = buildClaudeUserMessageContent(prompt, attachmentContext);
  if (typeof content === 'string') return content;
  return singleUserMessage(content);
}

function buildClaudeUserMessageContent(
  prompt: string,
  attachmentContext: ClaudeAttachmentContext,
): ClaudeUserContent {
  if (attachmentContext.parts.length === 0) return prompt;

  return [
    { type: 'text', text: prompt },
    ...attachmentContext.parts,
  ];
}

function buildClaudeAttachmentContext(
  attachments: Message['attachments'] | undefined,
): ClaudeAttachmentContext {
  if (!attachments?.length) {
    return { parts: [], supportedCount: 0, ignoredCount: 0, summary: '', debugLines: [] };
  }

  const parts: ClaudeAttachmentPart[] = [];
  const debugLines: string[] = [];
  let ignoredCount = 0;

  for (const attachment of attachments) {
    const resolved = resolveAttachmentFile(attachment);
    if (!resolved) {
      ignoredCount += 1;
      debugLines.push(`ignored name=${attachment.name} type=${attachment.type || '-'} reason=file-not-found path=${attachment.path} url=${attachment.url ?? '-'}`);
      continue;
    }

    const part = toClaudeAttachmentPart(attachment, resolved.filePath, resolved.buffer);
    if (!part) {
      ignoredCount += 1;
      debugLines.push(`ignored name=${attachment.name} type=${attachment.type || '-'} reason=unsupported-mime file=${resolved.filePath}`);
      continue;
    }

    parts.push(part);
    debugLines.push(`accepted name=${attachment.name} type=${attachment.type || '-'} part=${part.type} file=${resolved.filePath}`);
  }

  const kinds = new Set(parts.map((part) => part.type));
  return {
    parts,
    supportedCount: parts.length,
    ignoredCount,
    summary: Array.from(kinds).join(','),
    debugLines,
  };
}

function toClaudeAttachmentPart(
  attachment: NonNullable<Message['attachments']>[number],
  filePath: string,
  buffer: Buffer,
): ClaudeAttachmentPart | undefined {
  const mimeType = attachment.type || inferAttachmentMimeType(filePath);
  const imageMimeType = normalizeClaudeImageMimeType(mimeType);
  if (imageMimeType) {
    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: imageMimeType,
        data: buffer.toString('base64'),
      } satisfies Base64ImageSource,
    };
  }

  if (mimeType === 'application/pdf') {
    return {
      type: 'document',
      title: attachment.name,
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: buffer.toString('base64'),
      } satisfies Base64PDFSource,
    };
  }

  if (mimeType === 'text/plain') {
    return {
      type: 'document',
      title: attachment.name,
      source: {
        type: 'text',
        media_type: 'text/plain',
        data: buffer.toString('utf-8'),
      },
    };
  }

  if (isSupportedTextAttachmentMimeType(mimeType)) {
    return {
      type: 'document',
      title: attachment.name,
      source: {
        type: 'text',
        media_type: 'text/plain',
        data: buffer.toString('utf-8'),
      },
    };
  }

  const officeText = extractOfficeDocumentText(buffer, mimeType);
  if (officeText) {
    return {
      type: 'document',
      title: attachment.name,
      source: {
        type: 'text',
        media_type: 'text/plain',
        data: officeText,
      },
    };
  }

  return undefined;
}

function resolveAttachmentFile(
  attachment: NonNullable<Message['attachments']>[number],
): { filePath: string; buffer: Buffer } | undefined {
  // 已是 data URL（如 agent_run 传入的 base64 图片）：解析 mime + base64，不读文件
  if (attachment.url?.startsWith('data:')) {
    const m = attachment.url.match(/^data:([\w./+-]+);base64,(.*)$/i);
    if (m) {
      const ext = m[1].split('/')[1]?.split('+')[0] || 'bin';
      return { filePath: `inline.${ext}`, buffer: Buffer.from(m[2], 'base64') };
    }
    return undefined;
  }
  const candidatePaths = [
    attachment.path,
    attachment.url?.startsWith('/static/')
      ? join(getDataDir(), 'public', ...attachment.url.replace(/^\/static\/+/, '').split('/'))
      : undefined,
    attachment.url?.startsWith('/static/')
      ? join(SERVER_PUBLIC_DIR, ...attachment.url.replace(/^\/static\/+/, '').split('/'))
      : undefined,
  ].filter((value): value is string => Boolean(value));

  for (const filePath of candidatePaths) {
    if (!existsSync(filePath) || !statSync(filePath).isFile()) continue;
    return { filePath, buffer: readFileSync(filePath) };
  }

  return undefined;
}

function normalizeClaudeImageMimeType(mimeType: string | undefined): ClaudeImageMimeType | undefined {
  if (mimeType === 'image/png' || mimeType === 'image/jpeg' || mimeType === 'image/gif' || mimeType === 'image/webp') {
    return mimeType;
  }
  if (mimeType === 'image/jpg') return 'image/jpeg';
  return undefined;
}

function inferAttachmentMimeType(filePath: string): string | undefined {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (lower.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (lower.endsWith('.txt') || lower.endsWith('.md') || lower.endsWith('.log')) return 'text/plain';
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.csv')) return 'text/csv';
  if (lower.endsWith('.xml')) return 'application/xml';
  if (lower.endsWith('.yml') || lower.endsWith('.yaml')) return 'application/yaml';
  if (lower.endsWith('.js')) return 'application/javascript';
  if (lower.endsWith('.ts')) return 'application/typescript';
  return undefined;
}

function isSupportedTextAttachmentMimeType(mimeType: string | undefined): boolean {
  if (!mimeType) return false;
  return [
    'text/markdown',
    'text/csv',
    'text/xml',
    'application/json',
    'application/ld+json',
    'application/xml',
    'application/yaml',
    'text/yaml',
    'application/javascript',
    'text/javascript',
    'application/typescript',
    'text/typescript',
  ].includes(mimeType);
}

function extractOfficeDocumentText(buffer: Buffer, mimeType: string | undefined): string | undefined {
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return extractDocxText(buffer);
  }
  if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    return extractXlsxText(buffer);
  }
  return undefined;
}

function extractDocxText(buffer: Buffer): string | undefined {
  try {
    const zip = new AdmZip(buffer);
    const documentXml = zip.getEntry('word/document.xml')?.getData().toString('utf-8');
    if (!documentXml) return undefined;
    const paragraphs = [...documentXml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)]
      .map((match) => decodeXmlText(extractXmlText(match[0], 'w:t')))
      .map((text) => text.trim())
      .filter(Boolean);
    if (paragraphs.length) return paragraphs.join('\n\n');

    const fallback = decodeXmlText(extractXmlText(documentXml, 'w:t')).trim();
    return fallback || undefined;
  } catch {
    return undefined;
  }
}

function extractXlsxText(buffer: Buffer): string | undefined {
  try {
    const zip = new AdmZip(buffer);
    const sharedStringsXml = zip.getEntry('xl/sharedStrings.xml')?.getData().toString('utf-8') ?? '';
    const sharedStrings = [...sharedStringsXml.matchAll(/<si\b[\s\S]*?<\/si>/g)]
      .map((match) => decodeXmlText(extractXmlText(match[0], 't')).trim());
    const worksheetEntries = zip.getEntries()
      .filter((entry) => /^xl\/worksheets\/sheet\d+\.xml$/.test(entry.entryName))
      .sort((a, b) => a.entryName.localeCompare(b.entryName));

    const sheetTexts = worksheetEntries
      .map((entry, index) => extractWorksheetText(entry.getData().toString('utf-8'), sharedStrings, index + 1))
      .filter(Boolean);

    return sheetTexts.length ? sheetTexts.join('\n\n') : undefined;
  } catch {
    return undefined;
  }
}

function extractWorksheetText(xml: string, sharedStrings: string[], sheetIndex: number): string | undefined {
  const rowTexts = [...xml.matchAll(/<row\b[\s\S]*?<\/row>/g)]
    .map((match) => extractWorksheetRowText(match[0], sharedStrings))
    .filter(Boolean);
  if (!rowTexts.length) return undefined;
  return [`Sheet ${sheetIndex}:`, ...rowTexts].join('\n');
}

function extractWorksheetRowText(rowXml: string, sharedStrings: string[]): string {
  const values = [...rowXml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)]
    .map((match) => {
      const attrs = match[1] ?? '';
      const cellXml = match[2] ?? '';
      const typeMatch = attrs.match(/\bt="([^"]+)"/);
      const cellType = typeMatch?.[1];
      if (cellType === 's') {
        const sharedIndex = Number(extractXmlText(cellXml, 'v').trim());
        return sharedStrings[sharedIndex] ?? '';
      }
      if (cellType === 'inlineStr') {
        return decodeXmlText(extractXmlText(cellXml, 't')).trim();
      }
      return decodeXmlText(extractXmlText(cellXml, 'v')).trim();
    })
    .filter(Boolean);
  return values.join(' | ');
}

function extractXmlText(xml: string, localName: string): string {
  const matcher = new RegExp(`<(?:(?:\\w+:)?${localName})\\b[^>]*>([\\s\\S]*?)<\\/(?:(?:\\w+:)?${localName})>`, 'g');
  return [...xml.matchAll(matcher)]
    .map((match) => match[1] ?? '')
    .join('');
}

function decodeXmlText(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#10;/g, '\n')
    .replace(/&#13;/g, '\r')
    .replace(/&#9;/g, '\t');
}

function buildAttachmentDebugReasoning(
  attachmentContext: ClaudeAttachmentContext,
  totalAttachments: number,
): string | undefined {
  const debugEnabled = /^(1|true|yes|on)$/i.test(process.env.AGENT_SPACES_DEBUG_ATTACHMENTS ?? '');
  if (!debugEnabled && attachmentContext.ignoredCount === 0) return undefined;
  const summary = [
    `[AttachmentContext] total=${totalAttachments}`,
    `supported=${attachmentContext.supportedCount}`,
    `ignored=${attachmentContext.ignoredCount}`,
    `kinds=${attachmentContext.summary || '-'}`,
  ].join(' ');
  const details = attachmentContext.debugLines.length ? `\n${attachmentContext.debugLines.join('\n')}` : '';
  return `${summary}${details}`;
}

async function* singleUserMessage(content: Exclude<ClaudeUserContent, string>): AsyncIterable<SDKUserMessage> {
  yield {
    type: 'user',
    message: {
      role: 'user',
      content,
    },
    parent_tool_use_id: null,
  };
}

export const __testables = {
  buildClaudePrompt,
  buildClaudeUserMessageContent,
  buildClaudeAttachmentContext,
  toClaudeAttachmentPart,
  resolveAttachmentFile,
  buildAttachmentDebugReasoning,
  inferAttachmentMimeType,
  isSupportedTextAttachmentMimeType,
  extractOfficeDocumentText,
  extractDocxText,
  extractXlsxText,
  normalizeAllowedToolNames,
};
