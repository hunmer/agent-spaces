import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import type { WebSocket } from 'ws';
import { createServerProcess, createWebSocketConnection, forward } from 'vscode-ws-jsonrpc/server';
import type { IWebSocket } from 'vscode-ws-jsonrpc';
import { getById as getWorkspaceById } from '../services/workspace.js';

const require = createRequire(import.meta.url);

function resolveTypeScriptRoot(rootDir: string): string {
  const candidates = [
    rootDir,
    join(rootDir, 'packages/web'),
  ];

  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'tsconfig.json')) || existsSync(join(candidate, 'jsconfig.json'))) {
      return candidate;
    }
  }

  return rootDir;
}

function closeWithReason(ws: WebSocket, code: number, reason: string): void {
  try {
    ws.close(code, reason);
  } catch {
    // The socket may already be closing.
  }
}

function toRpcSocket(ws: WebSocket): IWebSocket {
  return {
    send: (content) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(content);
      }
    },
    onMessage: (cb) => {
      ws.on('message', (data) => cb(data.toString()));
    },
    onError: (cb) => {
      ws.on('error', cb);
    },
    onClose: (cb) => {
      ws.on('close', (code, buffer) => cb(code, buffer.toString()));
    },
    dispose: () => {
      closeWithReason(ws, 1000, 'disposed');
    },
  };
}

export function handleTypeScriptLspConnection(ws: WebSocket, workspaceId: string): void {
  const workspace = getWorkspaceById(workspaceId);
  const rootDir = workspace?.boundDirs?.[0] ? resolve(workspace.boundDirs[0]) : null;

  if (!workspace || !rootDir) {
    closeWithReason(ws, 4004, 'Workspace not found');
    return;
  }

  const tsRootDir = resolveTypeScriptRoot(rootDir);
  console.info('[typescript-lsp] starting', {
    workspaceId,
    rootDir,
    tsRootDir,
  });

  const socketConnection = createWebSocketConnection(toRpcSocket(ws));
  const serverConnection = createServerProcess(
    'TypeScript',
    process.execPath,
    [
      require.resolve('typescript-language-server/lib/cli.mjs'),
      '--stdio',
    ],
    {
      cwd: tsRootDir,
      env: {
        ...process.env,
        TSS_LOG: process.env.TSS_LOG ?? '-level off',
      },
    },
  );

  if (!serverConnection) {
    closeWithReason(ws, 1011, 'Failed to start TypeScript language server');
    return;
  }

  forward(socketConnection, serverConnection);
}
