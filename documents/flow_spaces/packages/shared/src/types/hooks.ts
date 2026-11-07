export interface HookConfig {
  name: string;
  description?: string;
  enabled: boolean;
  hooks: Partial<Record<ClaudeHookEventName, HookRule[]>>;
}

export interface HookRule {
  matcher: string;
  type: 'command' | 'webhook' | 'script';
  command?: string;
  url?: string;
  function?: string;
  timeout?: number;
}

export type ClaudeHookEventName =
  | 'SessionStart'
  | 'UserPromptSubmit'
  | 'UserPromptExpansion'
  | 'PreToolUse'
  | 'PermissionDenied'
  | 'PostToolUse'
  | 'PostToolUseFailure'
  | 'PostToolBatch'
  | 'Notification'
  | 'SubagentStart'
  | 'SubagentStop'
  | 'NodeExecutionCreated'
  | 'NodeExecutionCompleted'
  | 'Stop'
  | 'StopFailure'
  | 'TeammateIdle'
  | 'InstructionsLoaded'
  | 'CwdChanged'
  | 'WorktreeRemove'
  | 'PreCompact'
  | 'PostCompact'
  | 'Elicitation'
  | 'ElicitationResult'
  | 'SessionEnd';
