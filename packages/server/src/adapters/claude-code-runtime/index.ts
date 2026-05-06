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

    d(`starting | cwd=${cwd} model=${model ?? 'default'} targetModel=${this.config.model ?? 'default'} provider=${this.config.provider ?? 'default'} baseURL=${baseURL ?? 'default'} permissionMode=${permissionMode} maxTurns=${options?.maxTurns ?? '∞'} tools=claude_code mcpServers=${Object.keys(options?.mcpServers ?? {}).join(',') || '-'} skills=${skillNames.join(',') || '-'} configDir=${configDir ?? 'default'} sandboxDirs=${additionalDirectories.join(',') || '-'} claudeExecutable=${claudeExecutable ?? 'sdk-default'}`);
    d(`prompt: ${prompt.slice(0, 300)}${prompt.length > 300 ? '...' : ''}`);

    try {
      const queryOptions: Options = {
        cwd,
        model,
        maxTurns: options?.maxTurns,
        pathToClaudeCodeExecutable: claudeExecutable,
        tools: { type: 'preset', preset: 'claude_code' },
        mcpServers: normalizeMcpServers(options?.mcpServers, options?.functionTools),
        skills: skillNames,
        managedSettings: {
          strictPluginOnlyCustomization: ['mcp'],
        },
        settingSources: [],
        strictMcpConfig: true,
        additionalDirectories,
        permissionMode,
        allowDangerouslySkipPermissions: permissionMode === 'bypassPermissions' ? true : undefined,
        abortController: this.abortController,
        env: buildEnv(this.config, configDir, { baseURL, apiKey }),
        stderr: (data) => {
          const line = data.trim();
          if (line) d(`stderr: ${line}`);
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
      const pendingAskUserQuestionToolIds = new Set<string>();
      let waitingForUserAnswer = false;

      for await (const message of this.activeQuery) {
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
          turns = message.num_turns;
          tokenCount = countUsageTokens(message.usage);
          usageLine = formatUsageLine(message.usage);
          usage = normalizeUsage(message.usage);
          costUsd = readTotalCostUsd(message);
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
        };
      }

      if (error) {
        d(`failed ${elapsed}ms | turns=${turns} tokens=${tokenCount} | ${error}`);
        if (usageLine) output.push(usageLine);
        return {
          success: false,
          summary: 'Claude Code execution failed',
          artifacts: [],
          error,
          output,
          usage,
          costUsd,
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
      };
    } catch (err) {
      const elapsed = Date.now() - startTime;
      const message = err instanceof Error ? err.message : String(err);
      d(`failed ${elapsed}ms | ${message}`);
      if (err instanceof Error && err.stack) console.error(err.stack);

      return { success: false, summary: 'Claude Code execution failed', artifacts: [], error: message, output };
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

function readTotalCostUsd(message: unknown): number | undefined {
  if (!message || typeof message !== 'object') return undefined;
  const value = (message as { total_cost_usd?: unknown }).total_cost_usd;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
