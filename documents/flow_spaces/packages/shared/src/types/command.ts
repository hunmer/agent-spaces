// packages/shared/src/types/command.ts

export interface QuickCommand {
  id: string;
  name: string;
  command: string;
  folder?: string;
  cwd?: string;
  shell?: string;
  env?: Record<string, string>;
  autoRestart?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CommandProcess {
  commandId: string;
  workspaceId: string;
  sessionId: string;
  status: 'running' | 'stopping';
  startedAt: string;
  restartCount: number;
}

export interface CommandProcessEvent {
  commandId: string;
  sessionId?: string;
  workspaceId: string;
  exitCode?: number;
  restartCount?: number;
}
