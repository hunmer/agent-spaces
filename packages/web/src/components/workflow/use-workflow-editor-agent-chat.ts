'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Workflow } from '@agent-spaces/shared';
import type { AgentPreset } from '@/components/sidebar/agent-shared';
import { getAllNodeDefinitions } from '@/lib/workflow-nodes';
import { workflowChatApi } from '@/lib/workflow-api';
import { fetchWithAuth } from '@/lib/auth';
import type { WorkflowAgentChatMessage, ThinkingStreamState, WorkflowToolCall, WorkflowTimelineItem } from './workflow-editor-agent-utils';
import {
  hydrateWorkflowAgentChatMessage,
  serializeWorkflowAgentChatMessage,
  consumeThinkingStream,
  readSseStream,
  readWorkflowPatch,
  resolveWorkflowAgentPreset,
  resolveWorkflowAgentSettingsDraft,
  isSuccessfulToolResult,
  asRecord,
  findLastIndex,
} from './workflow-editor-agent-utils';

export function useWorkflowEditorAgentChat({
  workflow,
  setWorkflow,
  markDirty,
  pushUndo,
  selectedNodes,
  workspaceId,
}: {
  workflow: Workflow | null;
  setWorkflow: React.Dispatch<React.SetStateAction<Workflow | null>>;
  markDirty: () => void;
  pushUndo: (label: string) => void;
  selectedNodes: Workflow['nodes'];
  workspaceId: string | undefined;
}) {
  const [agentOpen, setAgentOpen] = useState(false);
  const [agentInput, setAgentInput] = useState('');
  const [agentSending, setAgentSending] = useState(false);
  const [agentMessages, setAgentMessages] = useState<WorkflowAgentChatMessage[]>([]);
  const [loadedAgentChatWorkflowId, setLoadedAgentChatWorkflowId] = useState<string | null>(null);
  const agentChatSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const agentAbortControllerRef = useRef<AbortController | null>(null);
  const [agentSettingsOpen, setAgentSettingsOpen] = useState(false);
  const [agentSettingsDraft, setAgentSettingsDraft] = useState<AgentPreset | null>(null);
  const [agentSettingsLoading, setAgentSettingsLoading] = useState(false);

  // ---- Load messages on workflow change ----
  useEffect(() => {
    const workflowId = workflow?.id;
    if (!workflowId) {
      setAgentMessages([]);
      setLoadedAgentChatWorkflowId(null);
      return;
    }

    let cancelled = false;
    setLoadedAgentChatWorkflowId(null);
    workflowChatApi.load(workflowId)
      .then((messages) => {
        if (cancelled) return;
        setAgentMessages(messages.map(hydrateWorkflowAgentChatMessage));
        setLoadedAgentChatWorkflowId(workflowId);
      })
      .catch(() => {
        if (cancelled) return;
        setAgentMessages([]);
        setLoadedAgentChatWorkflowId(workflowId);
      });

    return () => {
      cancelled = true;
    };
  }, [workflow?.id]);

  // ---- Auto-save messages ----
  useEffect(() => {
    const workflowId = workflow?.id;
    if (!workflowId || loadedAgentChatWorkflowId !== workflowId) return;

    if (agentChatSaveTimerRef.current) clearTimeout(agentChatSaveTimerRef.current);
    agentChatSaveTimerRef.current = setTimeout(() => {
      workflowChatApi.save(workflowId, agentMessages.map(serializeWorkflowAgentChatMessage)).catch(() => {});
    }, 250);

    return () => {
      if (agentChatSaveTimerRef.current) clearTimeout(agentChatSaveTimerRef.current);
    };
  }, [agentMessages, loadedAgentChatWorkflowId, workflow?.id]);

  // ---- Message manipulation ----

  const appendAssistantContent = useCallback((messageId: string, content: string) => {
    setAgentMessages((messages) => messages.map((message) => (
      message.id === messageId
        ? { ...message, content: message.content ? `${message.content}\n${content}` : content }
        : message
    )));
  }, []);

  const appendTimelineItem = useCallback((messageId: string, item: WorkflowTimelineItem) => {
    setAgentMessages((messages) => messages.map((message) => (
      message.id === messageId
        ? { ...message, timeline: [...(message.timeline ?? []), item] }
        : message
    )));
  }, []);

  const appendTimelineTextItem = useCallback((messageId: string, type: 'message' | 'thinking', content: string) => {
    const text = type === 'thinking' ? content : content;
    if (!text) return;
    setAgentMessages((messages) => messages.map((message) => {
      if (message.id !== messageId) return message;
      const timeline = [...(message.timeline ?? [])];
      if (type === 'thinking') {
        const existingIndex = timeline.findIndex((item) => item.type === 'thinking');
        if (existingIndex >= 0) {
          const existing = timeline[existingIndex] as Extract<WorkflowTimelineItem, { type: 'thinking' }>;
          timeline[existingIndex] = { ...existing, content: `${existing.content}${text}` };
        } else {
          timeline.unshift({
            id: `thinking-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type: 'thinking',
            content: text,
          });
        }
        return { ...message, timeline };
      }

      const latest = timeline.at(-1);
      if (latest?.type === type) {
        timeline[timeline.length - 1] = { ...latest, content: `${latest.content}${text}` };
      } else {
        timeline.push({
          id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type,
          content: text,
        });
      }
      return { ...message, timeline };
    }));
  }, []);

  const appendToolCall = useCallback((messageId: string, toolCall: WorkflowToolCall) => {
    appendTimelineItem(messageId, { ...toolCall, type: 'tool' });
  }, [appendTimelineItem]);

  const appendTimelineMessage = useCallback((messageId: string, content: string) => {
    appendTimelineTextItem(messageId, 'message', content);
  }, [appendTimelineTextItem]);

  const completeLatestToolCall = useCallback((messageId: string, toolUseId: string, result: unknown) => {
    setAgentMessages((messages) => messages.map((message) => {
      if (message.id !== messageId || !message.timeline?.length) return message;
      const timeline = [...message.timeline];
      const index = findLastIndex(timeline, (item) => item.type === 'tool' && item.id === toolUseId && item.status === 'running');
      if (index === -1) return message;
      timeline[index] = {
        ...timeline[index],
        result,
        status: isSuccessfulToolResult(result) ? 'success' : 'error',
      } as WorkflowTimelineItem;
      return { ...message, timeline };
    }));
  }, []);

  const applyWorkflowPatch = useCallback((result: unknown) => {
    const patch = readWorkflowPatch(result);
    if (!patch || patch.workflow_id !== workflow?.id) return;
    pushUndo('workflow agent edit');
    setWorkflow((w) => w ? {
      ...w,
      nodes: patch.nodes,
      edges: patch.edges,
      updatedAt: patch.updatedAt ?? Date.now(),
    } : w);
    markDirty();
  }, [workflow?.id, setWorkflow, markDirty, pushUndo]);

  // ---- Actions ----

  const clearWorkflowAgentMessages = useCallback(async () => {
    const workflowId = workflow?.id;
    setAgentMessages([]);
    if (workflowId) await workflowChatApi.clear(workflowId).catch(() => {});
  }, [workflow?.id]);

  const deleteAgentMessage = useCallback((messageId: string) => {
    setAgentMessages((messages) => messages.filter((message) => message.id !== messageId));
  }, []);

  const openAgentSettings = useCallback(async () => {
    setAgentSettingsOpen(true);
    setAgentSettingsLoading(true);
    try {
      setAgentSettingsDraft(await resolveWorkflowAgentSettingsDraft());
    } finally {
      setAgentSettingsLoading(false);
    }
  }, []);

  const sendWorkflowAgentMessage = useCallback(async () => {
    const prompt = agentInput.trim();
    if (!prompt || agentSending || !workflow) return;

    const userMessage: WorkflowAgentChatMessage = {
      id: `workflow-agent-user-${Date.now()}`,
      role: 'user',
      content: prompt,
      timestamp: new Date(),
    };
    const assistantId = `workflow-agent-assistant-${Date.now()}`;
    const assistantMessage: WorkflowAgentChatMessage = {
      id: assistantId,
      role: 'agent',
      content: '',
      timestamp: new Date(),
      timeline: [],
    };

    setAgentMessages((messages) => [...messages, userMessage, assistantMessage]);
    setAgentInput('');
    setAgentSending(true);

    try {
      const abortController = new AbortController();
      agentAbortControllerRef.current = abortController;
      const preset = await resolveWorkflowAgentPreset();
      if (!preset) {
        appendAssistantContent(assistantId, '请先点击右上角模型设置，保存工作流助手的模型提供商、模型和 API Key。');
        return;
      }
      if (!preset.apiKey || !preset.modelId || !preset.modelProvider) {
        appendAssistantContent(assistantId, '工作流助手的模型配置不完整。请先在右上角模型设置中补全提供商、模型和 API Key。');
        return;
      }
      if (abortController.signal.aborted) return;

      const response = await fetchWithAuth('/api/agent-sse/run', {
        method: 'POST',
        signal: abortController.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          agentId: preset.id,
          prompt,
          maxTurns: 40,
          messages: agentMessages
            .filter((message) => message.content.trim())
            .map((message) => ({
              senderId: message.role === 'user' ? 'user' : preset.id,
              senderRole: message.role === 'agent' ? preset.role : undefined,
              content: message.content,
              status: 'completed',
            })),
          workflowAgent: {
            workflow,
            nodeDefinitions: getAllNodeDefinitions(),
            selectedNodes,
          },
        }),
      });

      if (!response.ok || !response.body) {
        const text = await response.text().catch(() => '');
        appendAssistantContent(assistantId, text || `请求失败：${response.status}`);
        return;
      }

      const thinkingState: ThinkingStreamState = { inThinking: false, buffer: '' };
      await readSseStream(response, (event) => {
        if (event.event === 'output') {
          const line = asRecord(event.data).line;
          if (typeof line === 'string') {
            const parts = consumeThinkingStream(thinkingState, line);
            for (const part of parts) {
              if (part.type === 'thinking') {
                appendTimelineTextItem(assistantId, 'thinking', part.content);
              } else {
                appendTimelineMessage(assistantId, part.content);
              }
            }
          }
          return;
        }
        if (event.event === 'reasoning') {
          const data = asRecord(event.data);
          const text = data.text;
          if (typeof text === 'string' && text.trim()) {
            appendTimelineTextItem(assistantId, 'thinking', text);
          }
          return;
        }
        if (event.event === 'tool_use') {
          const data = asRecord(event.data);
          const name = String(data.name ?? 'tool');
          appendToolCall(assistantId, {
            id: typeof data.id === 'string' ? data.id : `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name,
            input: data.input,
            status: 'running',
          });
          return;
        }
        if (event.event === 'tool_result') {
          const data = asRecord(event.data);
          const toolUseId = String(data.toolUseId ?? 'tool');
          completeLatestToolCall(assistantId, toolUseId, data.result);
          applyWorkflowPatch(data.result);
          return;
        }
        if (event.event === 'done') {
          const data = asRecord(event.data);
          if (data.error) appendAssistantContent(assistantId, String(data.error));
          return;
        }
        if (event.event === 'error') {
          const data = asRecord(event.data);
          appendAssistantContent(assistantId, String(data.error ?? 'Agent 运行失败'));
        }
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      appendAssistantContent(assistantId, error instanceof Error ? error.message : String(error));
    } finally {
      if (agentAbortControllerRef.current?.signal.aborted || agentAbortControllerRef.current) {
        agentAbortControllerRef.current = null;
      }
      setAgentSending(false);
    }
  }, [
    agentInput,
    agentSending,
    workflow,
    setWorkflow,
    markDirty,
    pushUndo,
    selectedNodes,
    workspaceId,
    agentMessages,
    appendAssistantContent,
    appendTimelineTextItem,
    appendTimelineMessage,
    appendToolCall,
    completeLatestToolCall,
    applyWorkflowPatch,
  ]);

  const rerunWorkflowAgentTool = useCallback(async (
    messageId: string,
    item: Extract<WorkflowTimelineItem, { type: 'tool' }>,
  ) => {
    if (agentSending || !workflow) return;

    const toolUseId = `rerun-${item.name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    appendTimelineItem(messageId, {
      id: toolUseId,
      type: 'tool',
      name: item.name,
      input: item.input,
      status: 'running',
    });
    setAgentSending(true);

    try {
      const response = await fetchWithAuth('/api/agent-sse/workflow-tool/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toolName: item.name,
          input: item.input,
          workflowAgent: {
            workflow,
            nodeDefinitions: getAllNodeDefinitions(),
            selectedNodes,
          },
        }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        completeLatestToolCall(messageId, toolUseId, {
          success: false,
          error: text || `请求失败：${response.status}`,
        });
        return;
      }

      const data = await response.json().catch(() => null) as { result?: unknown } | null;
      const result = data?.result ?? { success: false, error: 'Tool did not return a result.' };
      completeLatestToolCall(messageId, toolUseId, result);
      applyWorkflowPatch(result);
    } catch (error) {
      completeLatestToolCall(messageId, toolUseId, {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setAgentSending(false);
    }
  }, [
    agentSending,
    workflow,
    selectedNodes,
    appendTimelineItem,
    completeLatestToolCall,
    applyWorkflowPatch,
  ]);

  const stopWorkflowAgentMessage = useCallback(() => {
    agentAbortControllerRef.current?.abort();
    agentAbortControllerRef.current = null;
    setAgentSending(false);
  }, []);

  return {
    agentOpen,
    setAgentOpen,
    agentMessages,
    agentInput,
    setAgentInput,
    agentSending,
    sendWorkflowAgentMessage,
    rerunWorkflowAgentTool,
    stopWorkflowAgentMessage,
    deleteAgentMessage,
    clearWorkflowAgentMessages,
    openAgentSettings,
    agentSettingsOpen,
    setAgentSettingsOpen,
    agentSettingsDraft,
    setAgentSettingsDraft,
    agentSettingsLoading,
  };
}
