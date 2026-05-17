import type { WebSocket } from 'ws';
import type { ClientEventName, TerminalCreatePayload, TerminalInputPayload, TerminalResizePayload } from '@agent-spaces/shared';
import * as ptyService from '../services/pty.js';
import { broadcastToWorkspace } from './connection-manager.js';

export function handleTerminalEvent(
  _ws: WebSocket,
  workspaceId: string,
  event: ClientEventName,
  data: unknown,
) {
  switch (event) {
    case 'terminal.create': {
      const payload = data as TerminalCreatePayload;
      const cwd = payload.cwd || process.env.HOME || process.env.USERPROFILE || (process.platform === 'win32' ? process.env.SYSTEMROOT || 'C:\\' : '/tmp');
      const sessionId = ptyService.createSession(
        workspaceId,
        cwd,
        (id, output) => {
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
      broadcastToWorkspace(workspaceId, 'terminal.created', { sessionId, cwd, shell: session?.shell ?? payload.shell });
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
      break;
    }
  }
}
