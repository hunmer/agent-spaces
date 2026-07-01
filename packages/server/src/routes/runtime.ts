import { Router, type Request, type Response } from 'express';
import { spawn } from 'node:child_process';
import type { AgentConfig } from '@agent-spaces/shared';

const router = Router();

type SupportedRuntimeKind = Extract<NonNullable<AgentConfig['runtimeKind']>, 'claude-code' | 'codex'>;

interface RuntimeCliDescriptor {
  id: 'claude-code' | 'codex' | 'gemini-cli';
  label: string;
  commands: string[];
  runtimeKind?: SupportedRuntimeKind;
}

const CLI_DESCRIPTORS: RuntimeCliDescriptor[] = [
  { id: 'claude-code', label: 'Claude Code CLI', commands: ['claude'], runtimeKind: 'claude-code' },
  { id: 'codex', label: 'Codex CLI', commands: ['codex'], runtimeKind: 'codex' },
  { id: 'gemini-cli', label: 'Gemini CLI', commands: ['gemini'] },
];

router.post('/discover-cli', async (_req: Request, res: Response) => {
  const items = await Promise.all(CLI_DESCRIPTORS.map(discoverCli));
  res.json({ items });
});

async function discoverCli(descriptor: RuntimeCliDescriptor) {
  for (const command of descriptor.commands) {
    const path = await locateCommand(command);
    if (!path) continue;
    return {
      id: descriptor.id,
      label: descriptor.label,
      command,
      found: true,
      path,
      runtimeKind: descriptor.runtimeKind ?? null,
      supportedRuntime: Boolean(descriptor.runtimeKind),
    };
  }

  return {
    id: descriptor.id,
    label: descriptor.label,
    command: descriptor.commands[0],
    found: false,
    path: null,
    runtimeKind: descriptor.runtimeKind ?? null,
    supportedRuntime: Boolean(descriptor.runtimeKind),
  };
}

function locateCommand(command: string): Promise<string | null> {
  return new Promise((resolve) => {
    const isWin = process.platform === 'win32';
    const child = spawn(isWin ? 'where.exe' : 'which', [command], {
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });

    let stdout = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.on('error', () => resolve(null));
    child.on('close', (code) => {
      if (code !== 0) {
        resolve(null);
        return;
      }
      const firstLine = stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
      resolve(firstLine ?? null);
    });
  });
}

export default router;
