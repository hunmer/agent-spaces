import type { MiniAppChatMessage } from '@agent-spaces/sdk';
import type { FileNode, WorkflowAgentTimelineItem } from '@agent-spaces/shared';
import type { ChatMessage, ChatPanelMentionFile } from '@/components/ui/chat-panel';

/** 从 fetch SSE Response 解析 event:/data: 帧，逐帧回调。 */
export async function consumeSse(response: Response, onEvent: (event: string, data: unknown) => void) {
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      let event = 'message';
      const dataLines: string[] = [];
      for (const line of frame.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
      }
      if (dataLines.length) {
        try { onEvent(event, JSON.parse(dataLines.join('\n'))); }
        catch { onEvent(event, dataLines.join('\n')); }
      }
    }
  }
}

export function miniAppToolCallsToTimeline(toolCalls?: Array<{ name: string; input: unknown; result: unknown }>): WorkflowAgentTimelineItem[] {
  return toolCalls?.map((toolCall, index) => ({
    id: `${toolCall.name}-${index}`,
    type: 'tool' as const,
    name: toolCall.name,
    input: toolCall.input,
    result: toolCall.result,
    status: toolCall.result === undefined || isMiniAppErrorToolResult(toolCall.result) ? 'error' as const : 'success' as const,
  })) ?? [];
}

export function isMiniAppErrorToolResult(result: unknown): boolean {
  return Boolean(
    result
    && typeof result === 'object'
    && 'success' in result
    && (result as { success?: unknown }).success === false
  );
}

export function appendMiniAppTimelineText(
  timeline: WorkflowAgentTimelineItem[] | undefined,
  type: 'message' | 'thinking',
  content: string,
): WorkflowAgentTimelineItem[] {
  const next = [...(timeline ?? [])];
  const latest = next.at(-1);
  if (latest?.type === type) {
    next[next.length - 1] = { ...latest, content: latest.content + content };
  } else {
    next.push({ id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, type, content });
  }
  return next;
}

export function miniAppMessageToChatMessage(message: MiniAppChatMessage, sessionId: string): ChatMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    timestamp: new Date(message.timestamp),
    timeline: message.timeline?.length ? message.timeline : miniAppToolCallsToTimeline(message.toolCalls),
    metadata: { agentSessionId: sessionId, agentId: message.agentId },
  };
}

export function markAskUserQuestionAnswered(
  timeline: WorkflowAgentTimelineItem[] | undefined,
  questionId: string,
  answer: string,
): WorkflowAgentTimelineItem[] | undefined {
  if (!timeline?.length) return timeline;
  return timeline.map((item) => {
    if (item.type !== 'tool' || item.id !== questionId || item.name !== 'askUserQuestions') return item;
    return { ...item, result: { answer, input: item.input }, status: 'success' as const };
  });
}

export function flattenAgentFiles(nodes: FileNode[]): ChatPanelMentionFile[] {
  const files: ChatPanelMentionFile[] = [];
  const walk = (items: FileNode[]) => {
    for (const item of items) {
      if (item.type === 'file') files.push({ path: item.path, name: item.name });
      if (item.children) walk(item.children);
    }
  };
  walk(nodes);
  return files;
}
