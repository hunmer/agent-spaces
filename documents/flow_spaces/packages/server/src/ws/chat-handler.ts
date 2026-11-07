import type { WebSocket } from 'ws';
import { broadcastToWorkspace } from './connection-manager.js';
import { registerHandler } from './handler.js';
import * as chatService from '../services/chat.js';
import { LangChainRuntime } from '../adapters/langchain-runtime.js';
import type { AgentRuntimeConfig, AgentRuntimeEvent } from '../adapters/agent-runtime-types.js';

const activeRuns = new Map<string, LangChainRuntime>();

export function registerChatHandlers(): void {
  // chat.message: { agentId, content }
  registerHandler('chat.message', (_ws: WebSocket, workspaceId: string, data: unknown) => {
    const { agentId, content } = data as { agentId: string; content: string };
    if (!agentId || !content) return;

    const agent = chatService.findAgent(agentId);
    if (!agent) {
      broadcastToWorkspace(workspaceId, 'chat.agent.error', { agentId, error: 'Agent not found' });
      return;
    }

    // Save user message
    const userMsg = chatService.saveMessage({ agentId, role: 'user', content });
    broadcastToWorkspace(workspaceId, 'chat.message.saved', userMsg);

    // Build runtime config (fixed langchain)
    const config: AgentRuntimeConfig = {
      kind: 'langchain',
      provider: agent.provider,
      model: agent.model,
      apiKey: agent.apiKey,
      baseURL: agent.baseURL,
    };

    const runtime = new LangChainRuntime(config);
    activeRuns.set(agentId, runtime);

    // Build conversation history from recent messages
    const recent = chatService.getRecentMessages(agentId, 20);
    const historyPrompt = recent
      .slice(0, -1) // exclude the just-saved user message (already in recent)
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n');
    const prompt = historyPrompt ? `${historyPrompt}\n\nUser: ${content}\nAssistant:` : content;

    // Execute with streaming events
    runtime.execute(prompt, process.cwd(), {
      systemPrompt: agent.systemPrompt,
      onEvent: (event: AgentRuntimeEvent) => {
        switch (event.type) {
          case 'output':
            broadcastToWorkspace(workspaceId, 'chat.agent.output', { agentId, chunk: event.line });
            break;
          case 'reasoning':
            broadcastToWorkspace(workspaceId, 'chat.agent.thinking', { agentId, chunk: event.text });
            break;
          case 'tool_use':
            broadcastToWorkspace(workspaceId, 'chat.agent.tool_use', { agentId, id: event.id, name: event.name, input: event.input });
            break;
          case 'tool_result':
            broadcastToWorkspace(workspaceId, 'chat.agent.tool_result', { agentId, toolUseId: event.toolUseId, result: event.result });
            break;
        }
      },
    })
      .then((result) => {
        const agentContent = result.output.filter((line) => !line.startsWith('Tool:')).join('\n') || result.summary;
        const agentMsg = chatService.saveMessage({
          agentId,
          role: 'agent',
          content: agentContent,
          usage: result.usage,
        });
        broadcastToWorkspace(workspaceId, 'chat.agent.completed', { agentId, message: agentMsg });
      })
      .catch((err: unknown) => {
        broadcastToWorkspace(workspaceId, 'chat.agent.error', {
          agentId,
          error: err instanceof Error ? err.message : String(err),
        });
      })
      .finally(() => {
        activeRuns.delete(agentId);
      });
  });

  // chat.stop: { agentId }
  registerHandler('chat.stop', (_ws: WebSocket, _workspaceId: string, data: unknown) => {
    const { agentId } = data as { agentId: string };
    if (!agentId) return;
    const runtime = activeRuns.get(agentId);
    if (runtime) {
      runtime.stop();
      activeRuns.delete(agentId);
    }
  });
}
