# Quick Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a VS Code task-runner-style command management panel to the terminal, with backend process lifecycle management and Agent tools.

**Architecture:** Backend stores commands per-workspace in `commands.json`. A `CommandProcessManager` service maps commands to PTY sessions in memory, handles run/stop/autoRestart. Frontend gets a left sidebar in `terminal-panel.tsx` with CRUD dialog, run/stop controls. 3 new Agent function-call tools for command automation.

**Tech Stack:** Express 5, node-pty, Zustand, shadcn/ui, next-intl, WebSocket (ws)

**Spec:** `docs/superpowers/specs/2026-05-08-quick-command-design.md`

---

## Batch 1: Shared Types + Backend CRUD

### Task 1: Shared type definitions

**Files:**
- Create: `packages/shared/src/types/command.ts`
- Modify: `packages/shared/src/types/index.ts` (add export)

- [ ] **Step 1: Create `command.ts` type file**

```typescript
// packages/shared/src/types/command.ts

export interface QuickCommand {
  id: string;
  name: string;
  command: string;
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
```

- [ ] **Step 2: Add export to `index.ts`**

Add after the `workflow.js` line:
```typescript
export * from './command.js';
```

- [ ] **Step 3: Build shared package and verify**

Run: `pnpm --filter @agent-spaces/shared build`
Expected: no errors

- [ ] **Step 4: Commit**

```
feat(shared): add QuickCommand and CommandProcess types
```

---

### Task 2: Backend command storage + CRUD service

**Files:**
- Create: `packages/server/src/storage/command-store.ts`
- Create: `packages/server/src/services/command.ts`

- [ ] **Step 1: Create `command-store.ts`**

Follow the same pattern as `workflow-store.ts` — synchronous JSON read/write. Storage path: `{dataDir}/workspaces/{workspaceId}/commands.json`.

```typescript
// packages/server/src/storage/command-store.ts
import type { QuickCommand } from '@agent-spaces/shared';
import { ensureDir, readJsonFile, writeJsonFile } from './json-store.js';
import path from 'node:path';
import { getDataDir } from './json-store.js';

function commandsFile(workspaceId: string) {
  return path.join(getDataDir(), 'workspaces', workspaceId, 'commands.json');
}

export function listCommands(workspaceId: string): QuickCommand[] {
  return readJsonFile<QuickCommand[]>(commandsFile(workspaceId)) ?? [];
}

export function getCommand(workspaceId: string, commandId: string): QuickCommand | null {
  return listCommands(workspaceId).find(c => c.id === commandId) ?? null;
}

export function saveCommands(workspaceId: string, commands: QuickCommand[]): void {
  ensureDir(path.dirname(commandsFile(workspaceId)));
  writeJsonFile(commandsFile(workspaceId), commands);
}
```

- [ ] **Step 2: Create `services/command.ts`**

CRUD service wrapping the store. Follow `services/workflow.ts` pattern — synchronous, throws on not-found.

```typescript
// packages/server/src/services/command.ts
import { v4 as uuid } from 'uuid';
import type { QuickCommand } from '@agent-spaces/shared';
import * as commandStore from '../storage/command-store.js';

export function listCommands(workspaceId: string): QuickCommand[] {
  return commandStore.listCommands(workspaceId);
}

export function getCommand(workspaceId: string, commandId: string): QuickCommand | null {
  return commandStore.getCommand(workspaceId, commandId);
}

export interface CreateCommandInput {
  name: string;
  command: string;
  cwd?: string;
  shell?: string;
  env?: Record<string, string>;
  autoRestart?: boolean;
}

export function createCommand(workspaceId: string, input: CreateCommandInput): QuickCommand {
  const now = new Date().toISOString();
  const cmd: QuickCommand = {
    id: uuid(),
    name: input.name.trim(),
    command: input.command,
    cwd: input.cwd,
    shell: input.shell,
    env: input.env,
    autoRestart: input.autoRestart,
    createdAt: now,
    updatedAt: now,
  };
  const commands = commandStore.listCommands(workspaceId);
  commands.push(cmd);
  commandStore.saveCommands(workspaceId, commands);
  return cmd;
}

export function updateCommand(
  workspaceId: string,
  commandId: string,
  updates: Partial<Omit<QuickCommand, 'id' | 'createdAt'>>,
): QuickCommand {
  const commands = commandStore.listCommands(workspaceId);
  const idx = commands.findIndex(c => c.id === commandId);
  if (idx === -1) throw new Error('Command not found');
  commands[idx] = {
    ...commands[idx],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  commandStore.saveCommands(workspaceId, commands);
  return commands[idx];
}

export function deleteCommand(workspaceId: string, commandId: string): void {
  const commands = commandStore.listCommands(workspaceId);
  const filtered = commands.filter(c => c.id !== commandId);
  if (filtered.length === commands.length) throw new Error('Command not found');
  commandStore.saveCommands(workspaceId, filtered);
}
```

- [ ] **Step 3: Commit**

```
feat(server): add command storage and CRUD service
```

---

## Batch 2: Backend Process Manager + Routes + PTY

### Task 3: Extend PTY service with `env` parameter

**Files:**
- Modify: `packages/server/src/services/pty.ts`

- [ ] **Step 1: Add optional `env` param to `createSession`**

Current signature: `createSession(workspaceId, cwd, onOutput, onExit, shell?)`
New signature: `createSession(workspaceId, cwd, onOutput, onExit, shell?, env?)`

Change the `env` line from:
```typescript
env: { ...process.env as Record<string, string> },
```
To:
```typescript
env: { ...(process.env as Record<string, string>), ...env },
```

Full updated `createSession`:

```typescript
export function createSession(
  workspaceId: string,
  cwd: string,
  onOutput: (sessionId: string, data: string) => void,
  onExit: (sessionId: string, exitCode: number) => void,
  shell?: string,
  env?: Record<string, string>,
): string {
  const id = uuid();
  const resolvedShell = shell || process.env.SHELL || '/bin/zsh';
  const ptyProcess = pty.spawn(resolvedShell, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd,
    env: { ...(process.env as Record<string, string>), ...env },
  });

  ptyProcess.onData((data) => onOutput(id, data));
  ptyProcess.onExit(({ exitCode }) => onExit(id, exitCode ?? 0));

  sessions.set(id, { id, pty: ptyProcess, workspaceId, cwd });
  return id;
}
```

- [ ] **Step 2: Commit**

```
feat(server): add env parameter to pty createSession
```

---

### Task 4: Command process manager

**Files:**
- Create: `packages/server/src/services/command-process-manager.ts`

- [ ] **Step 1: Create the process manager**

This is the core service. Manages commandId -> PTY session mapping, autoRestart, and cleanup.

```typescript
// packages/server/src/services/command-process-manager.ts
import type { CommandProcess, QuickCommand } from '@agent-spaces/shared';
import * as ptyService from './pty.js';
import * as commandService from './command.js';
import { getWorkspace } from '../storage/workspace-store.js';
import { broadcastToWorkspace } from '../ws/connection-manager.js';

const processes = new Map<string, CommandProcess>();        // commandId -> process
const sessionIndex = new Map<string, string>();              // sessionId -> commandId
const restartTimers = new Map<string, NodeJS.Timeout>();     // commandId -> timer

export function runCommand(workspaceId: string, commandId: string): string {
  // Already running -> reuse
  const existing = processes.get(commandId);
  if (existing) return existing.sessionId;

  const command = commandService.getCommand(workspaceId, commandId);
  if (!command) throw new Error('Command not found');

  const workspace = getWorkspace(workspaceId);
  const cwd = command.cwd || workspace?.boundDirs[0] || process.env.HOME || '/tmp';
  const shell = command.shell;
  const env = command.env;

  const sessionId = ptyService.createSession(
    workspaceId,
    cwd,
    (id, output) => {
      broadcastToWorkspace(workspaceId, 'terminal.output', { sessionId: id, data: output });
    },
    (id, exitCode) => {
      handlePtyExit(id, exitCode);
    },
    shell,
    env,
  );

  const now = new Date().toISOString();
  const process: CommandProcess = {
    commandId,
    workspaceId,
    sessionId,
    status: 'running',
    startedAt: now,
    restartCount: 0,
  };

  processes.set(commandId, process);
  sessionIndex.set(sessionId, commandId);

  // Execute the command
  ptyService.write(sessionId, command.command + '\n');

  broadcastToWorkspace(workspaceId, 'command.started', {
    commandId,
    sessionId,
    workspaceId,
  });

  return sessionId;
}

export function stopCommand(workspaceId: string, commandId: string): void {
  const process = processes.get(commandId);
  if (!process) throw new Error('Command not running');

  // Cancel any pending restart
  const timer = restartTimers.get(commandId);
  if (timer) {
    clearTimeout(timer);
    restartTimers.delete(commandId);
  }

  ptyService.write(process.sessionId, '\x03');
  process.status = 'stopping';
  // Don't broadcast here — wait for PTY onExit
}

function handlePtyExit(sessionId: string, exitCode: number): void {
  const commandId = sessionIndex.get(sessionId);
  if (!commandId) return;

  const process = processes.get(commandId);
  if (!process) return;

  // Clean up
  processes.delete(commandId);
  sessionIndex.delete(sessionId);
  const timer = restartTimers.get(commandId);
  if (timer) {
    clearTimeout(timer);
    restartTimers.delete(commandId);
  }

  const { workspaceId } = process;

  // Auto-restart check
  const command = commandService.getCommand(workspaceId, commandId);
  if (
    command?.autoRestart === true &&
    process.status !== 'stopping' &&
    command
  ) {
    const restartCount = process.restartCount + 1;
    broadcastToWorkspace(workspaceId, 'command.restarted', {
      commandId,
      sessionId: '', // will be filled on next run
      restartCount,
      workspaceId,
    });
    const timer = setTimeout(() => {
      restartTimers.delete(commandId);
      try {
        runCommand(workspaceId, commandId);
      } catch {
        // Command may have been deleted during delay
      }
    }, 1000);
    restartTimers.set(commandId, timer);
  } else {
    broadcastToWorkspace(workspaceId, 'command.stopped', {
      commandId,
      exitCode,
      workspaceId,
    });
  }
}

export function getCommandProcess(commandId: string): CommandProcess | undefined {
  return processes.get(commandId);
}

export function getCommandProcesses(workspaceId: string): CommandProcess[] {
  const result: CommandProcess[] = [];
  for (const process of processes.values()) {
    if (process.workspaceId === workspaceId) result.push(process);
  }
  return result;
}

export function cleanup(workspaceId: string): void {
  for (const [commandId, process] of processes) {
    if (process.workspaceId === workspaceId) {
      const timer = restartTimers.get(commandId);
      if (timer) clearTimeout(timer);
      restartTimers.delete(commandId);
      sessionIndex.delete(process.sessionId);
      processes.delete(commandId);
    }
  }
}
```

- [ ] **Step 2: Commit**

```
feat(server): add command process manager with autoRestart
```

---

### Task 5: REST API routes

**Files:**
- Create: `packages/server/src/routes/command.ts`
- Modify: `packages/server/src/app.ts` (register route)

- [ ] **Step 1: Create `routes/command.ts`**

```typescript
// packages/server/src/routes/command.ts
import { Router } from 'express';
import type { Request, Response } from 'express';
import * as commandService from '../services/command.js';
import * as processManager from '../services/command-process-manager.js';

const router = Router({ mergeParams: true });

// GET /api/workspaces/:id/commands
router.get('/', (_req: Request, res: Response) => {
  const workspaceId = _req.params?.id;
  if (!workspaceId) { res.status(400).json({ error: 'workspaceId required' }); return; }
  try {
    res.json(commandService.listCommands(workspaceId));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/workspaces/:id/commands/processes
router.get('/processes', (_req: Request, res: Response) => {
  const workspaceId = _req.params?.id;
  if (!workspaceId) { res.status(400).json({ error: 'workspaceId required' }); return; }
  res.json(processManager.getCommandProcesses(workspaceId));
});

// POST /api/workspaces/:id/commands
router.post('/', (req: Request, res: Response) => {
  const workspaceId = req.params?.id;
  if (!workspaceId) { res.status(400).json({ error: 'workspaceId required' }); return; }
  try {
    const cmd = commandService.createCommand(workspaceId, req.body);
    res.status(201).json(cmd);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// PUT /api/workspaces/:id/commands/:commandId
router.put('/:commandId', (req: Request, res: Response) => {
  const { id: workspaceId, commandId } = req.params;
  if (!workspaceId || !commandId) { res.status(400).json({ error: 'workspaceId and commandId required' }); return; }
  try {
    const cmd = commandService.updateCommand(workspaceId, commandId, req.body);
    res.json(cmd);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE /api/workspaces/:id/commands/:commandId
router.delete('/:commandId', (req: Request, res: Response) => {
  const { id: workspaceId, commandId } = req.params;
  if (!workspaceId || !commandId) { res.status(400).json({ error: 'workspaceId and commandId required' }); return; }
  try {
    // Stop running process if any
    const process = processManager.getCommandProcess(commandId);
    if (process) {
      try { processManager.stopCommand(workspaceId, commandId); } catch {}
    }
    commandService.deleteCommand(workspaceId, commandId);
    res.status(204).send();
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// POST /api/workspaces/:id/commands/:commandId/run
router.post('/:commandId/run', (req: Request, res: Response) => {
  const { id: workspaceId, commandId } = req.params;
  if (!workspaceId || !commandId) { res.status(400).json({ error: 'workspaceId and commandId required' }); return; }
  try {
    const sessionId = processManager.runCommand(workspaceId, commandId);
    res.json({ sessionId });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// POST /api/workspaces/:id/commands/:commandId/stop
router.post('/:commandId/stop', (req: Request, res: Response) => {
  const { id: workspaceId, commandId } = req.params;
  if (!workspaceId || !commandId) { res.status(400).json({ error: 'workspaceId and commandId required' }); return; }
  try {
    processManager.stopCommand(workspaceId, commandId);
    res.json({ ok: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
```

- [ ] **Step 2: Register route in `app.ts`**

Add import:
```typescript
import commandRouter from './routes/command.js';
```

Add route registration after the workflow line (`app.use('/api/workflows', workflowRouter);`):
```typescript
app.use('/api/workspaces/:id/commands', commandRouter);
```

- [ ] **Step 3: Commit**

```
feat(server): add command REST API routes
```

---

### Task 6: WebSocket events + builtin tools

**Files:**
- Modify: `packages/shared/src/types/events.ts` (3 new server events)
- Modify: `packages/shared/src/types/tool.ts` (3 new tool names)
- Modify: `packages/server/src/services/builtin-tools.ts` (3 new tools)

- [ ] **Step 1: Add command events to `events.ts`**

Add import at top:
```typescript
import type { CommandProcessEvent } from './command.js';
```

Add to `ServerEventMap`:
```typescript
'command.started': CommandProcessEvent;
'command.stopped': CommandProcessEvent;
'command.restarted': CommandProcessEvent;
```

- [ ] **Step 2: Add tool names to `tool.ts`**

Add to `BUILT_IN_AGENT_TOOLS` array:
```typescript
{
  name: 'ListQuickCommands',
  label: 'List Quick Commands',
  description: 'List all quick commands for a workspace with their running status.',
},
{
  name: 'RunQuickCommand',
  label: 'Run Quick Command',
  description: 'Start a quick command by its ID. Returns the terminal session ID.',
},
{
  name: 'StopQuickCommand',
  label: 'Stop Quick Command',
  description: 'Stop a running quick command by its ID.',
},
```

- [ ] **Step 3: Add tools to `builtin-tools.ts`**

Create a new exported function `createCommandFunctionTools(workspaceId: string)` that returns 3 `AgentFunctionTool[]`:

```typescript
export function createCommandFunctionTools(workspaceId: string): AgentFunctionTool[] {
  return [
    {
      name: 'ListQuickCommands',
      description: 'List all quick commands for the workspace with running status.',
      inputSchema: {
        type: 'object',
        properties: {
          workspaceId: { type: 'string', description: 'The workspace ID' },
        },
        required: ['workspaceId'],
        additionalProperties: false,
      },
      annotations: { readOnly: true, openWorld: false },
      execute: async (input) => {
        const data = input as { workspaceId: string };
        if (data.workspaceId !== workspaceId) throw new Error('workspaceId mismatch');
        const commands = commandService.listCommands(workspaceId);
        const processes = commandProcessManager.getCommandProcesses(workspaceId);
        const processMap = new Map(processes.map(p => [p.commandId, p]));
        return commands.map(cmd => ({
          ...cmd,
          running: processMap.has(cmd.id) ? processMap.get(cmd.id)!.status : false,
        }));
      },
    },
    {
      name: 'RunQuickCommand',
      description: 'Run a quick command by ID. Returns sessionId.',
      inputSchema: {
        type: 'object',
        properties: {
          workspaceId: { type: 'string' },
          commandId: { type: 'string' },
        },
        required: ['workspaceId', 'commandId'],
        additionalProperties: false,
      },
      annotations: { destructive: false, openWorld: false },
      execute: async (input) => {
        const data = input as { workspaceId: string; commandId: string };
        if (data.workspaceId !== workspaceId) throw new Error('workspaceId mismatch');
        return { sessionId: commandProcessManager.runCommand(workspaceId, data.commandId) };
      },
    },
    {
      name: 'StopQuickCommand',
      description: 'Stop a running quick command by ID.',
      inputSchema: {
        type: 'object',
        properties: {
          workspaceId: { type: 'string' },
          commandId: { type: 'string' },
        },
        required: ['workspaceId', 'commandId'],
        additionalProperties: false,
      },
      annotations: { destructive: false, openWorld: false },
      execute: async (input) => {
        const data = input as { workspaceId: string; commandId: string };
        if (data.workspaceId !== workspaceId) throw new Error('workspaceId mismatch');
        commandProcessManager.stopCommand(workspaceId, data.commandId);
        return { stopped: true };
      },
    },
  ];
}
```

Add imports at top of `builtin-tools.ts`:
```typescript
import * as commandService from './command.js';
import * as commandProcessManager from './command-process-manager.js';
```

- [ ] **Step 4: Build and verify**

Run: `pnpm --filter @agent-spaces/shared build`
Expected: no errors

- [ ] **Step 5: Commit**

```
feat(server): add command WebSocket events and Agent tools
```

---

## Batch 3: Frontend Store + UI

### Task 7: Command store

**Files:**
- Create: `packages/web/src/stores/command.ts`

- [ ] **Step 1: Create the store**

```typescript
// packages/web/src/stores/command.ts
import { create } from 'zustand';
import type { QuickCommand, CommandProcess } from '@agent-spaces/shared';
import { fetchWithAuth } from '@/lib/auth';
import { getWS } from '@/lib/ws';

interface RunningState {
  sessionId: string;
  status: CommandProcess['status'];
}

interface CommandStore {
  commands: QuickCommand[];
  runningMap: Record<string, RunningState>;
  loaded: boolean;
  wsAttached: boolean;

  load: (workspaceId: string) => Promise<void>;
  create: (workspaceId: string, input: { name: string; command: string; cwd?: string; shell?: string; env?: Record<string, string>; autoRestart?: boolean }) => Promise<void>;
  update: (workspaceId: string, id: string, updates: Partial<QuickCommand>) => Promise<void>;
  remove: (workspaceId: string, id: string) => Promise<void>;
  run: (workspaceId: string, commandId: string) => Promise<void>;
  stop: (workspaceId: string, commandId: string) => Promise<void>;
  attachWS: (workspaceId: string) => void;
  isRunning: (commandId: string) => boolean;
}

export const useCommandStore = create<CommandStore>((set, get) => ({
  commands: [],
  runningMap: {},
  loaded: false,
  wsAttached: false,

  load: async (workspaceId: string) => {
    const [commandsRes, processesRes] = await Promise.all([
      fetchWithAuth(`/api/workspaces/${workspaceId}/commands`),
      fetchWithAuth(`/api/workspaces/${workspaceId}/commands/processes`),
    ]);
    const commands = await commandsRes.json();
    const processes: CommandProcess[] = await processesRes.json();
    const runningMap: Record<string, RunningState> = {};
    for (const p of processes) {
      runningMap[p.commandId] = { sessionId: p.sessionId, status: p.status };
    }
    set({ commands, runningMap, loaded: true });
    get().attachWS(workspaceId);
  },

  create: async (workspaceId, input) => {
    const res = await fetchWithAuth(`/api/workspaces/${workspaceId}/commands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const cmd = await res.json();
    set(s => ({ commands: [...s.commands, cmd] }));
  },

  update: async (workspaceId, id, updates) => {
    const res = await fetchWithAuth(`/api/workspaces/${workspaceId}/commands/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    const updated = await res.json();
    set(s => ({
      commands: s.commands.map(c => c.id === id ? updated : c),
    }));
  },

  remove: async (workspaceId, id) => {
    await fetchWithAuth(`/api/workspaces/${workspaceId}/commands/${id}`, { method: 'DELETE' });
    set(s => ({
      commands: s.commands.filter(c => c.id !== id),
      runningMap: Object.fromEntries(Object.entries(s.runningMap).filter(([k]) => k !== id)),
    }));
  },

  run: async (workspaceId, commandId) => {
    await fetchWithAuth(`/api/workspaces/${workspaceId}/commands/${commandId}/run`, { method: 'POST' });
    // running state will be updated via WS event 'command.started'
  },

  stop: async (workspaceId, commandId) => {
    await fetchWithAuth(`/api/workspaces/${workspaceId}/commands/${commandId}/stop`, { method: 'POST' });
    // running state will be updated via WS event 'command.stopped'
  },

  attachWS: (workspaceId: string) => {
    if (get().wsAttached) return;
    const ws = getWS(workspaceId);

    ws.on('command.started', (data) => {
      const { commandId, sessionId } = data as { commandId: string; sessionId: string };
      set(s => ({
        runningMap: { ...s.runningMap, [commandId]: { sessionId, status: 'running' } },
      }));
    });

    ws.on('command.stopped', (data) => {
      const { commandId } = data as { commandId: string };
      set(s => {
        const { [commandId]: _, ...rest } = s.runningMap;
        return { runningMap: rest };
      });
    });

    ws.on('command.restarted', (data) => {
      const { commandId, sessionId } = data as { commandId: string; sessionId: string };
      set(s => ({
        runningMap: { ...s.runningMap, [commandId]: { sessionId, status: 'running' } },
      }));
    });

    set({ wsAttached: true });
  },

  isRunning: (commandId: string) => {
    return !!get().runningMap[commandId];
  },
}));
```

- [ ] **Step 2: Commit**

```
feat(web): add command Zustand store
```

---

### Task 8: Command dialog component

**Files:**
- Create: `packages/web/src/components/terminal/command-dialog.tsx`

- [ ] **Step 1: Create the dialog**

shadcn Dialog with form fields: name, command, cwd, shell, env (dynamic key-value), autoRestart (switch).

```tsx
'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Plus, X } from 'lucide-react';
import type { QuickCommand } from '@agent-spaces/shared';
import { useTranslations } from 'next-intl';

interface CommandDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  command?: QuickCommand;
  defaultCwd?: string;
  onSubmit: (data: {
    name: string;
    command: string;
    cwd?: string;
    shell?: string;
    env?: Record<string, string>;
    autoRestart?: boolean;
  }) => Promise<void>;
}

export function CommandDialog({ open, onOpenChange, command, defaultCwd, onSubmit }: CommandDialogProps) {
  const t = useTranslations('commands');
  const [name, setName] = useState(command?.name ?? '');
  const [cmd, setCmd] = useState(command?.command ?? '');
  const [cwd, setCwd] = useState(command?.cwd ?? defaultCwd ?? '');
  const [shell, setShell] = useState(command?.shell ?? '');
  const [envPairs, setEnvPairs] = useState<{ key: string; value: string }[]>(
    command?.env ? Object.entries(command.env).map(([key, value]) => ({ key, value })) : []
  );
  const [autoRestart, setAutoRestart] = useState(command?.autoRestart ?? false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim() || !cmd.trim()) return;
    setSubmitting(true);
    try {
      const env: Record<string, string> = {};
      for (const p of envPairs) {
        if (p.key.trim()) env[p.key.trim()] = p.value;
      }
      await onSubmit({
        name: name.trim(),
        command: cmd,
        cwd: cwd || undefined,
        shell: shell || undefined,
        env: Object.keys(env).length > 0 ? env : undefined,
        autoRestart: autoRestart || undefined,
      });
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{command ? t('editCommand') : t('addCommand')}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <div>
            <Label className="text-xs">{t('name')}</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="dev" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">{t('command')}</Label>
            <Input
              value={cmd}
              onChange={e => setCmd(e.target.value)}
              placeholder="pnpm dev"
              className="mt-1 font-mono text-sm"
            />
          </div>
          <div>
            <Label className="text-xs">{t('workingDirectory')}</Label>
            <Input value={cwd} onChange={e => setCwd(e.target.value)} placeholder={defaultCwd} className="mt-1 font-mono text-xs" />
          </div>
          <div>
            <Label className="text-xs">{t('shell')}</Label>
            <Input value={shell} onChange={e => setShell(e.target.value)} placeholder="Default" className="mt-1" />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">{t('environmentVariables')}</Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 px-1 text-xs"
                onClick={() => setEnvPairs(p => [...p, { key: '', value: '' }])}
              >
                <Plus size={12} />
              </Button>
            </div>
            <div className="flex flex-col gap-1 mt-1">
              {envPairs.map((pair, i) => (
                <div key={i} className="flex items-center gap-1">
                  <Input
                    value={pair.key}
                    onChange={e => setEnvPairs(p => p.map((pp, j) => j === i ? { ...pp, key: e.target.value } : pp))}
                    placeholder="KEY"
                    className="h-7 text-xs font-mono flex-1"
                  />
                  <Input
                    value={pair.value}
                    onChange={e => setEnvPairs(p => p.map((pp, j) => j === i ? { ...pp, value: e.target.value } : pp))}
                    placeholder="value"
                    className="h-7 text-xs font-mono flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 shrink-0"
                    onClick={() => setEnvPairs(p => p.filter((_, j) => j !== i))}
                  >
                    <X size={12} />
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={autoRestart} onCheckedChange={setAutoRestart} />
            <Label className="text-xs">{t('autoRestart')}</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('cancel')}</Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || !cmd.trim() || submitting}>
            {command ? t('save') : t('addCommand')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```
feat(web): add CommandDialog component
```

---

### Task 9: Terminal panel with command sidebar

**Files:**
- Modify: `packages/web/src/stores/terminal.ts` (add commandId to TerminalSession)
- Modify: `packages/web/src/components/terminal/terminal-panel.tsx` (left sidebar layout)

- [ ] **Step 1: Add `commandId` to `TerminalSession`**

In `stores/terminal.ts`, update the interface:
```typescript
export interface TerminalSession {
  id: string;
  cwd: string;
  shell?: string;
  commandId?: string;  // NEW
}
```

- [ ] **Step 2: Rewrite `terminal-panel.tsx`**

The full rewrite adds:
- Left command sidebar (200px, resizable)
- `[+]` button in header
- Command list with run/stop/edit/delete
- Integrates `useCommandStore` and `CommandDialog`

Key structural changes:
- Outer container stays `flex flex-col h-full`
- Below tab bar: `flex flex-row flex-1 overflow-hidden`
- Left: command list panel
- Right: existing terminal content

Import additions:
```typescript
import { useCommandStore } from '@/stores/command';
import { CommandDialog } from './command-dialog';
import { Play, Square, Pencil, Trash2, GripVertical } from 'lucide-react';
import type { QuickCommand } from '@agent-spaces/shared';
```

New state:
```typescript
const { commands, runningMap, load: loadCommands, run, stop, remove, update, create, isRunning } = useCommandStore();
const [dialogOpen, setDialogOpen] = useState(false);
const [editingCommand, setEditingCommand] = useState<QuickCommand | undefined>();
const [sidebarWidth, setSidebarWidth] = useState(200);
```

Add `useEffect` to load commands:
```typescript
useEffect(() => {
  if (workspaceId) loadCommands(workspaceId);
}, [workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps
```

Left sidebar render (simplified):
```tsx
<div style={{ width: sidebarWidth }} className="flex flex-col border-r border-border shrink-0 overflow-hidden">
  <div className="flex-1 overflow-y-auto py-1">
    {commands.length === 0 ? (
      <div className="text-xs text-muted-foreground text-center py-4">{t('noCommands')}</div>
    ) : (
      commands.map(cmd => (
        <CommandListItem
          key={cmd.id}
          command={cmd}
          running={isRunning(cmd.id)}
          onRun={() => run(workspaceId, cmd.id)}
          onStop={() => stop(workspaceId, cmd.id)}
          onEdit={() => { setEditingCommand(cmd); setDialogOpen(true); }}
          onDelete={() => remove(workspaceId, cmd.id)}
        />
      ))
    )}
  </div>
</div>
```

`CommandListItem` sub-component:
```tsx
function CommandListItem({ command, running, onRun, onStop, onEdit, onDelete }: {
  command: QuickCommand; running: boolean;
  onRun: () => void; onStop: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className="flex items-center gap-1 px-2 py-1 text-xs hover:bg-accent group cursor-default"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        onClick={running ? onStop : onRun}
        className={`shrink-0 p-0.5 rounded ${running ? 'text-green-500 hover:text-green-600' : 'text-muted-foreground hover:text-foreground'}`}
      >
        {running ? <Square size={12} /> : <Play size={12} />}
      </button>
      <span className="truncate flex-1 font-mono">{command.name}</span>
      {running && <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shrink-0" />}
      {hovered && (
        <>
          <button onClick={onEdit} className="shrink-0 p-0.5 text-muted-foreground hover:text-foreground"><Pencil size={11} /></button>
          <button onClick={onDelete} className="shrink-0 p-0.5 text-muted-foreground hover:text-destructive"><Trash2 size={11} /></button>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify no TypeScript errors**

Run: `cd packages/web && npx tsc --noEmit`
Expected: no new errors from changed files

- [ ] **Step 4: Commit**

```
feat(web): add command sidebar to terminal panel
```

---

## Batch 4: i18n + Integration

### Task 10: i18n translations

**Files:**
- Modify: `packages/web/src/locales/zh.json`
- Modify: `packages/web/src/locales/en.json`

- [ ] **Step 1: Add `commands` keys to `zh.json`**

```json
"commands": {
  "title": "命令",
  "addCommand": "添加命令",
  "editCommand": "编辑命令",
  "name": "名称",
  "command": "命令",
  "workingDirectory": "工作目录",
  "shell": "Shell",
  "environmentVariables": "环境变量",
  "autoRestart": "自动重启",
  "run": "运行",
  "stop": "停止",
  "save": "保存",
  "cancel": "取消",
  "delete": "删除",
  "noCommands": "暂无命令"
}
```

- [ ] **Step 2: Add `commands` keys to `en.json`**

```json
"commands": {
  "title": "Commands",
  "addCommand": "Add Command",
  "editCommand": "Edit Command",
  "name": "Name",
  "command": "Command",
  "workingDirectory": "Working Directory",
  "shell": "Shell",
  "environmentVariables": "Environment Variables",
  "autoRestart": "Auto Restart",
  "run": "Run",
  "stop": "Stop",
  "save": "Save",
  "cancel": "Cancel",
  "delete": "Delete",
  "noCommands": "No commands"
}
```

- [ ] **Step 3: Commit**

```
feat(web): add command i18n translations
```

---

### Task 11: Wire builtin tools into agent runtime

**Files:**
- Modify: `packages/server/src/ws/handler.ts` or wherever `createIssueFunctionTools` is called

- [ ] **Step 1: Add `createCommandFunctionTools` to agent tool registration**

Find where `createIssueFunctionTools` is called (likely in `ws/handler.ts` or `agents/` directory). Add `createCommandFunctionTools(workspaceId)` to the tools array for all agent runs.

- [ ] **Step 2: Verify full stack**

Run: `pnpm dev`
Test in browser:
1. Open a workspace
2. Open terminal panel
3. Click `[+]` to add command
4. Fill form, save
5. Click play to run — new terminal tab appears with command output
6. Click stop — Ctrl+C sent, tab preserved
7. Edit/delete commands

- [ ] **Step 3: Final commit**

```
feat: wire command tools into agent runtime
```
