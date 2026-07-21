import type { WebSocket } from 'ws';
import type { ClientEventName, TerminalCreatePayload, TerminalInputPayload, TerminalResizePayload } from '@agent-spaces/shared';
import * as ptyService from '../services/pty.js';
import { broadcastToWorkspace } from './connection-manager.js';

const DEBUG_TERMINAL_DUP = '[DEBUG-terminal-dup]';

export function sendTerminalSessions(ws: WebSocket, workspaceId: string) {
  const existingSessions = ptyService.getSessionsByWorkspace(workspaceId);
  console.log(DEBUG_TERMINAL_DUP, 'server sendTerminalSessions', {
    workspaceId,
    sessions: existingSessions.map(s => ({
      sessionId: s.id,
      bufferLength: s.buffer.join('').length,
    })),
  });
  ws.send(JSON.stringify({
    event: 'terminal.sessions',
    workspaceId,
    timestamp: new Date().toISOString(),
    data: {
      sessions: existingSessions.map(s => ({ sessionId: s.id, cwd: s.cwd, shell: s.shell, buffer: s.buffer.join('') })),
    },
  }));
}

export function handleTerminalEvent(
  ws: WebSocket,
  workspaceId: string,
  event: ClientEventName | 'terminal.list',
  data: unknown,
) {
  if (event === 'terminal.list') {
    sendTerminalSessions(ws, workspaceId);
    return;
  }

  switch (event) {
    case 'terminal.create': {
      const payload = data as TerminalCreatePayload;
      const cwd = payload.cwd || process.env.HOME || process.env.USERPROFILE || (process.platform === 'win32' ? process.env.SYSTEMROOT || 'C:\\' : '/tmp');
      console.log(DEBUG_TERMINAL_DUP, 'server terminal.create received', {
        workspaceId,
        sessionId: payload.sessionId,
        shell: payload.shell,
        cwd,
      });
      try {
        const sessionId = ptyService.createSession(
          workspaceId,
          cwd,
          (id, output) => {
            console.log(DEBUG_TERMINAL_DUP, 'server terminal.output broadcast', {
              workspaceId,
              sessionId: id,
              outputLength: output.length,
              preview: output.slice(0, 80),
            });
            broadcastToWorkspace(workspaceId, 'terminal.output', { sessionId: id, data: output });
          },
          (id, exitCode) => {
            broadcastToWorkspace(workspaceId, 'terminal.closed', { sessionId: id, exitCode });
          },
          payload.shell,
          undefined,
          payload.sessionId,
        );
        const session = ptyService.getSession(sessionId);
        console.log(DEBUG_TERMINAL_DUP, 'server terminal.created broadcast', {
          workspaceId,
          sessionId,
          cwd,
          shell: session?.shell ?? payload.shell,
        });
        broadcastToWorkspace(workspaceId, 'terminal.created', { sessionId, cwd, shell: session?.shell ?? payload.shell });
      } catch (err: any) {
        broadcastToWorkspace(workspaceId, 'terminal.error', { sessionId: payload.sessionId, error: err.message || String(err) });
      }
      break;
    }
    case 'terminal.input': {
      const payload = data as TerminalInputPayload;
      ptyService.write(payload.sessionId, payload.data);
      break;
    }
    case 'terminal.resize': {
      const payload = data as TerminalResizePayload;
      ptyService.resize(payload.sessionId, payload.cols, payload.rows);
      break;
    }
    case 'terminal.close': {
      const payload = data as { sessionId: string };
      ptyService.kill(payload.sessionId);
      // 主动广播关闭事件：Windows 下 pty.kill() 的 onExit 回调不可靠，
      // 不主动广播会导致前端 runningMap / sessions 不清理（绿色 badge 残留）
      broadcastToWorkspace(workspaceId, 'terminal.closed', { sessionId: payload.sessionId });
      break;
    }
  }
}
