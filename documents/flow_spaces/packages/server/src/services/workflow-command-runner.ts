import { exec } from 'child_process';
import type { ExecException } from 'child_process';
import type { WorkflowNode } from '@agent-spaces/shared';
import { getWorkspace } from '../storage/workspace-store.js';

export interface CommandResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
}

export async function executeCommandNode(
  workspaceId: string,
  node: WorkflowNode,
): Promise<CommandResult> {
  const workspace = getWorkspace(workspaceId);
  const data = node.data as Record<string, unknown>;
  const cwd = (data.cwd as string) || workspace?.boundDirs?.[0] || process.cwd();

  return new Promise<CommandResult>((resolve) => {
    exec(data.script as string, {
      cwd,
      env: { ...process.env, ...(data.env as Record<string, string> | undefined) },
      shell: (data.shell as string) || undefined,
      timeout: 300_000,
      maxBuffer: 10 * 1024 * 1024,
    }, (error: ExecException | null, stdout: string, stderr: string) => {
      resolve({
        success: !error,
        exitCode: error ? (typeof error.code === 'number' ? error.code : 1) : 0,
        stdout: stdout || '',
        stderr: stderr || '',
      });
    });
  });
}
