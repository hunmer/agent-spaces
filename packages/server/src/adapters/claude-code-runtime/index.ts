import { join } from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { Options, Query } from '@anthropic-ai/claude-agent-sdk';
import type { AgentRunOptions, AgentRunResult, AgentRuntime, AgentRuntimeConfig } from '../agent-runtime-types.js';
import { summarizeResult } from '../agent-runtime-types.js';
import { normalizeAdditionalDirectories, normalizePermissionMode, normalizeSkillNames, prepareConfigDir, resolveBundledClaudeExecutable, buildEnv, normalizeMcpServers } from './sdk-config.js';
import { startClaudeAdapterIfNeeded, getClaudeCodeModel } from './adapter-pool.js';
import { extractThinkingEvents, extractToolUseEvents, extractToolResultEvent, logToolDebug, formatMessage, isAskUserQuestionAutoResult, countUsageTokens, formatUsageLine, normalizeUsage } from './message-format.js';

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
    const claudeExecutable = resolveBundledClaudeExecutable();
    this.adapterRun = await startClaudeAdapterIfNeeded(this.config);
    const baseURL = this.adapterRun?.url ?? this.config.baseURL;
    const apiKey = this.adapterRun ? 'default' : this.config.apiKey;
    const model = getClaudeCodeModel(this.config);
    const additionalDirectories = normalizeAdditionalDirectories(cwd, options?.sandboxDirs);
    const sdkMcpServers = normalizeMcpServers(options?.mcpServers, options?.functionTools);
    const sdkMcpServerNames = Object.keys(sdkMcpServers ?? {});

    d(`starting | cwd=${cwd} model=${model ?? 'default'} targetModel=${this.config.model ?? 'default'} provider=${this.config.provider ?? 'default'} baseURL=${baseURL ?? 'default'} permissionMode=${permissionMode} maxTurns=${options?.maxTurns ?? '∞'} tools=claude_code mcpServers=${Object.keys(options?.mcpServers ?? {}).join(',') || '-'} skills=${skillNames.join(',') || '-'} configDir=${configDir ?? 'default'} sandboxDirs=${additionalDirectories.join(',') || '-'} claudeExecutable=${claudeExecutable ?? 'sdk-default'}`);
    d(`prompt: ${prompt.slice(0, 300)}${prompt.length > 300 ? '...' : ''}`);
    d(`sdk mcp servers | ${sdkMcpServerNames.join(',') || '-'}`);

    const stderrLines: string[] = [];

    try {
      const queryOptions: Options = {
        cwd,
        model,
        maxTurns: options?.maxTurns,
        pathToClaudeCodeExecutable: claudeExecutable,
        tools: { type: 'preset', preset: 'claude_code' },
        mcpServers: sdkMcpServers,
        skills: skillNames,
        managedSettings: {
          strictPluginOnlyCustomization: ['mcp'],
        },
        settingSources: ['user', 'project', 'local'],
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

      this.activeQuery = query({ prompt, options: queryOptions });
      let resultText = '';
      let turns = 0;
      let tokenCount = 0;
      let error: string | undefined;
      let usageLine: string | null = null;
      let usage: AgentRunResult['usage'];
      let costUsd: number | undefined;
      let sessionId = options?.resumeSessionId;
      let sawResult = false;
      const pendingAskUserQuestionToolIds = new Set<string>();
      let waitingForUserAnswer = false;

      for await (const message of this.activeQuery) {
        const nextSessionId = readSessionId(message);
        if (nextSessionId && nextSessionId !== sessionId) {
          sessionId = nextSessionId;
          options?.onEvent?.({ type: 'session', sessionId });
        }
        const toolUses = extractToolUseEvents(message);
        for (const toolUse of toolUses) {
          if (toolUse.name === 'AskUserQuestion') {
            pendingAskUserQuestionToolIds.add(toolUse.id);
          }
        }
        const toolResult = extractToolResultEvent(message);
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
          usageLine = formatUsageLine(message.usage);
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
      }

      const elapsed = Date.now() - startTime;
      if (!sawResult) {
        const runtimeError = extractRuntimeError([...stderrLines, ...output])
          || 'Claude Code execution stopped before reporting a final result';
        d(`failed ${elapsed}ms | turns=${turns} tokens=${tokenCount} | ${runtimeError}`);
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
        if (usageLine) output.push(usageLine);
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
        appendUnique(output, stderrLines);
        if (usageLine) output.push(usageLine);
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
      if (usageLine && !finalOutput.includes(usageLine)) finalOutput.push(usageLine);

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
      const message = err instanceof Error ? err.message : String(err);
      const runtimeError = extractRuntimeError([message, ...stderrLines, ...output]) || message;
      d(`failed ${elapsed}ms | ${runtimeError}`);
      if (err instanceof Error && err.stack) console.error(err.stack);

      appendUnique(output, stderrLines);
      appendUnique(output, [runtimeError]);
      return { success: false, summary: 'Claude Code execution failed', artifacts: [], error: runtimeError, output, sessionId: options?.resumeSessionId };
    } finally {
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
