import { exec } from 'node:child_process';
import type { ClaudeHookEventName, HookConfig, HookRule } from '@agent-spaces/shared';
import type { AgentRuntimeEvent } from '../adapters/agent-runtime-types.js';
import { listHooks } from '../storage/hook-store.js';

type HookExecutionContext = {
  toolInput?: unknown;
  toolResult?: unknown;
  toolUseId?: string;
  eventName?: ClaudeHookEventName;
  eventPayload?: unknown;
  checkedRules?: number;
  matchedRules?: number;
};

function logDebug(message: string, details?: Record<string, unknown>): void {
  if (details) {
    console.debug(`[HookEngine] ${message}`, details);
    return;
  }
  console.debug(`[HookEngine] ${message}`);
}

function matchToolName(matcher: string, toolName: string): boolean {
  if (matcher === '*') return true;
  if (matcher.startsWith('/') && matcher.endsWith('/')) {
    try {
      const regex = new RegExp(matcher.slice(1, -1));
      return regex.test(toolName);
    } catch (error: any) {
      console.warn(`[HookEngine] invalid matcher regex, falling back to exact match`, {
        matcher,
        toolName,
        error: error.message,
      });
      return matcher === toolName;
    }
  }
  return matcher === toolName;
}

function executeCommand(
  command: string,
  env: Record<string, string>,
  timeout: number,
): Promise<void> {
  return new Promise((resolve) => {
    const cappedTimeout = Math.min(timeout, 30000);
    exec(command, { env: { ...process.env, ...env }, timeout: cappedTimeout }, (error) => {
      if (error) console.warn(`[HookEngine] command error: ${error.message}`);
      resolve();
    });
  });
}

async function executeWebhook(
  url: string,
  body: Record<string, unknown>,
  timeout: number,
): Promise<void> {
  try {
    const controller = new AbortController();
    const cappedTimeout = Math.min(timeout, 30000);
    const timer = setTimeout(() => controller.abort(), cappedTimeout);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!response.ok) {
      console.warn(`[HookEngine] webhook non-2xx response`, {
        url,
        status: response.status,
        statusText: response.statusText,
      });
    }
  } catch (error: any) {
    console.warn(`[HookEngine] webhook error: ${error.message}`);
  }
}

async function executeRule(
  rule: HookRule,
  phase: ClaudeHookEventName,
  matcherValue: string,
  workspaceId: string,
  context: HookExecutionContext,
  hookName?: string,
): Promise<void> {
  const timeout = rule.timeout ?? 10000;
  const startedAt = Date.now();

  logDebug('rule start', {
    workspaceId,
    phase,
    hookName,
    matcherValue,
    matcher: rule.matcher,
    type: rule.type,
    timeout,
  });

  if (rule.type === 'command' && rule.command) {
    await executeCommand(rule.command, {
      HOOK_NAME: hookName ?? '',
      HOOK_RULE_MATCHER: rule.matcher,
      HOOK_RULE_TYPE: rule.type,
      HOOK_RULE_TIMEOUT: String(timeout),
      HOOK_EVENT_NAME: context.eventName ?? phase,
      HOOK_EVENT_PAYLOAD: JSON.stringify(context.eventPayload ?? {}),
      HOOK_MATCHER_VALUE: matcherValue,
      HOOK_TOOL_NAME: matcherValue,
      HOOK_TOOL_USE_ID: context.toolUseId ?? '',
      HOOK_TOOL_INPUT: JSON.stringify(context.toolInput ?? {}),
      HOOK_TOOL_RESULT: JSON.stringify(context.toolResult ?? ''),
      HOOK_WORKSPACE_ID: workspaceId,
      HOOK_PHASE: phase,
      HOOK_TRIGGER_CHECKED_RULES: String(context.checkedRules ?? ''),
      HOOK_TRIGGER_MATCHED_RULES: String(context.matchedRules ?? ''),
      HOOK_TRIGGERED_AT: new Date().toISOString(),
    }, timeout);
  } else if (rule.type === 'webhook' && rule.url) {
    await executeWebhook(rule.url, {
      event: phase,
      toolName: matcherValue,
      matcherValue,
      toolInput: context.toolInput,
      toolResult: context.toolResult ?? undefined,
      payload: context.eventPayload,
      timestamp: new Date().toISOString(),
      workspaceId,
    }, timeout);
  } else if (rule.type === 'script') {
    console.warn(`[HookEngine] script type not implemented, skipping rule`, {
      workspaceId,
      phase,
      hookName,
      matcherValue,
      matcher: rule.matcher,
    });
  } else {
    console.warn(`[HookEngine] invalid rule configuration, skipping rule`, {
      workspaceId,
      phase,
      hookName,
      matcherValue,
      matcher: rule.matcher,
      type: rule.type,
      hasCommand: Boolean(rule.command),
      hasUrl: Boolean(rule.url),
    });
  }

  logDebug('rule finished', {
    workspaceId,
    phase,
    hookName,
    matcherValue,
    matcher: rule.matcher,
    type: rule.type,
    durationMs: Date.now() - startedAt,
  });
}

export class HookEngine {
  private hooks: HookConfig[] = [];
  private workspaceId: string;

  constructor(workspaceId: string) {
    this.workspaceId = workspaceId;
  }

  load(): void {
    this.hooks = listHooks(this.workspaceId);
    logDebug('loaded hooks', {
      workspaceId: this.workspaceId,
      totalHooks: this.hooks.length,
      enabledHooks: this.hooks.filter(h => h.enabled).length,
      hookNames: this.hooks.map(h => h.name),
    });
  }

  reload(): void {
    this.load();
  }

  getHooks(): HookConfig[] {
    return this.hooks;
  }

  async executeHooks(
    phase: ClaudeHookEventName,
    matcherValue: string,
    context: HookExecutionContext,
  ): Promise<void> {
    const enabledHooks = this.hooks.filter(h => h.enabled);
    const promises: Promise<void>[] = [];
    const matchedRuleEntries: Array<{ hookName: string; rule: HookRule }> = [];
    let checkedRules = 0;
    let matchedRules = 0;

    logDebug('trigger received', {
      workspaceId: this.workspaceId,
      phase,
      matcherValue,
      totalHooks: this.hooks.length,
      enabledHooks: enabledHooks.length,
      hasToolInput: context.toolInput !== undefined,
      hasToolResult: context.toolResult !== undefined,
    });

    for (const hook of enabledHooks) {
      const rules = hook.hooks[phase];
      if (!rules) continue;
      for (const rule of rules) {
        checkedRules += 1;
        if (matchToolName(rule.matcher, matcherValue)) {
          matchedRules += 1;
          logDebug('rule matched', {
            workspaceId: this.workspaceId,
            phase,
            hookName: hook.name,
            matcherValue,
            matcher: rule.matcher,
            type: rule.type,
          });
          matchedRuleEntries.push({ hookName: hook.name, rule });
        }
      }
    }

    for (const { hookName, rule } of matchedRuleEntries) {
      promises.push(executeRule(rule, phase, matcherValue, this.workspaceId, {
        ...context,
        checkedRules,
        matchedRules,
      }, hookName));
    }

    const results = await Promise.allSettled(promises);
    const rejectedRules = results.filter(result => result.status === 'rejected').length;
    logDebug('trigger finished', {
      workspaceId: this.workspaceId,
      phase,
      matcherValue,
      checkedRules,
      matchedRules,
      rejectedRules,
    });
  }
}

export function wrapOnEventWithHooks(
  onEvent: (event: AgentRuntimeEvent) => void,
  workspaceId: string,
  hooksEnabled: boolean | undefined,
): (event: AgentRuntimeEvent) => void {
  if (!hooksEnabled) {
    logDebug('hooks disabled for workspace', { workspaceId });
    return onEvent;
  }

  const engine = new HookEngine(workspaceId);
  engine.load();
  const toolNameById = new Map<string, string>();
  let lastToolUse: { id: string; name: string } | null = null;

  return (event: AgentRuntimeEvent) => {
    if (event.type !== 'hook_event') onEvent(event);
    if (event.type === 'tool_use') {
      toolNameById.set(event.id, event.name);
      lastToolUse = { id: event.id, name: event.name };
      logDebug('tool_use event mapped', {
        workspaceId,
        toolUseId: event.id,
        toolName: event.name,
      });
      engine.executeHooks('PreToolUse', event.name, { toolInput: event.input, toolUseId: event.id });
    }
    if (event.type === 'tool_result') {
      const resolvedToolUseId = event.toolUseId || lastToolUse?.id;
      const toolName = resolvedToolUseId ? (toolNameById.get(resolvedToolUseId) ?? '') : '';
      if (toolName) {
        logDebug('tool_result event resolved', {
          workspaceId,
          toolUseId: resolvedToolUseId,
          originalToolUseId: event.toolUseId,
          toolName,
        });
        engine.executeHooks('PostToolUse', toolName, { toolResult: event.result, toolUseId: resolvedToolUseId });
        if (isToolFailureResult(event.result)) {
          engine.executeHooks('PostToolUseFailure', toolName, { toolResult: event.result, toolUseId: resolvedToolUseId });
        }
      } else {
        logDebug('tool_result event skipped without matching tool_use', {
          workspaceId,
          toolUseId: event.toolUseId,
        });
      }
    }
    if (event.type === 'hook_event') {
      logDebug('hook_event received', {
        workspaceId,
        event: event.event,
        matcher: event.matcher ?? '*',
      });
      engine.executeHooks(event.event, event.matcher ?? '*', {
        eventName: event.event,
        eventPayload: event.payload,
      });
    }
  };
}

function isToolFailureResult(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false;
  const record = result as Record<string, unknown>;
  return record.error !== undefined || record.is_error === true || record.success === false;
}
