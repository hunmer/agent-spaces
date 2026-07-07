"use client";
import { create } from 'zustand';
import type { StoreApi } from 'zustand';
import { sdk } from '@/lib/sdk';
import type { ChatAgent, ChatMessage, ChatWorkspace, ChatSession } from '@agent-spaces/sdk';
import type { WorkflowAgentTimelineItem } from '@agent-spaces/shared';

export interface ChatFileTab {
  path: string;
  name: string;
  content: string;
  agentId: string;
}

export interface ChatEditorDirectoryTab {
  id: string;
  path: string;
}

export type ChatSessionWithEditorDirectories = ChatSession & {
  editorDirectoryTabs?: ChatEditorDirectoryTab[];
  activeEditorDirectoryTabId?: string;
};

export type ChatTab =
  | { type: 'session'; id: string; label: string; agentId: string }
  | { type: 'file'; id: string; path: string; name: string };

const activeChatRequests = new Map<string, AbortController>();
type ChatSet = StoreApi<ChatStore>['setState'];

let stateSaveTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedSaveState() {
  if (stateSaveTimer) clearTimeout(stateSaveTimer);
  stateSaveTimer = setTimeout(() => {
    stateSaveTimer = null;
    useChatStore.getState().saveWorkspaceState();
  }, 500);
}

interface ChatStore {
  agents: ChatAgent[];
  activeAgentId: string | null;
  messages: Record<string, ChatMessage[]>;
  sending: Record<string, boolean>;
  errors: Record<string, string>;
  streamingContent: Record<string, string>;
  streamingThinking: Record<string, string>;
  streamingTimeline: Record<string, WorkflowAgentTimelineItem[]>;

  workspaces: ChatWorkspace[];
  activeWorkspaceId: string | null;
  sessions: ChatSessionWithEditorDirectories[];
  activeSessionId: string | null;

  loadAgents: () => Promise<void>;
  createAgent: (data: Omit<ChatAgent, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateAgent: (id: string, data: Partial<ChatAgent>) => Promise<void>;
  deleteAgent: (id: string) => Promise<void>;
  selectAgent: (id: string) => void;
  loadMessages: (agentId: string) => Promise<void>;
  sendMessage: (agentId: string, content: string) => void;
  regenerateMessage: (agentId: string, messageId: string) => void;
  stopAgent: (agentId: string) => void;
  clearMessages: (agentId: string) => void;

  // WS event handlers
  onMessageSaved: (msg: ChatMessage) => void;
  onAgentCompleted: (agentId: string, message: ChatMessage) => void;
  onAgentError: (agentId: string, error: string) => void;

  // Workspace
  loadWorkspaces: () => Promise<void>;
  createWorkspace: (name: string, agentIds?: string[]) => Promise<void>;
  updateWorkspace: (id: string, data: { name?: string; agentIds?: string[] }) => Promise<void>;
  deleteWorkspace: (id: string) => Promise<void>;
  selectWorkspace: (id: string) => void;

  // Session
  loadSessions: (workspaceId: string) => Promise<void>;
  createSession: (agentId: string) => Promise<string | null>;
  deleteSession: (sessionId: string) => Promise<void>;
  archiveSession: (sessionId: string) => Promise<void>;
  unarchiveSession: (sessionId: string) => Promise<void>;
  selectSession: (id: string) => void;
  updateSessionEditorDirectories: (
    sessionId: string,
    data: {
      editorDirectoryTabs?: ChatEditorDirectoryTab[];
      activeEditorDirectoryTabId?: string;
    },
  ) => Promise<void>;

  // Session messages
  loadSessionMessages: (workspaceId: string, sessionId: string) => Promise<void>;
  sendSessionMessage: (content: string) => void;
  regenerateSessionMessage: (messageId: string) => void;
  stopSession: () => void;
  clearSessionMessages: () => void;
  clearAllSessionMessages: () => Promise<void>;

  // File tabs (grouped by sessionId)
  sessionFileTabs: Record<string, ChatFileTab[]>;
  activeFileTabPath: string | null;
  openChatFile: (agentId: string, path: string) => Promise<void>;
  closeChatFile: (path: string) => void;
  setActiveFileTab: (path: string | null) => void;

  // Workspace state persistence
  openSessionTabIds: string[];
  loadWorkspaceState: (workspaceId: string) => Promise<void>;
  saveWorkspaceState: () => void;
  setOpenSessionTabIds: (ids: string[]) => void;
  selectSessionTab: (sessionId: string) => void;
  removeSessionTab: (sessionId: string) => void;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  agents: [],
  activeAgentId: null,
  messages: {},
  sending: {},
  errors: {},
  streamingContent: {},
  streamingThinking: {},
  streamingTimeline: {},
  workspaces: [],
  activeWorkspaceId: null,
  sessions: [],
  activeSessionId: null,

  sessionFileTabs: {},
  activeFileTabPath: null,
  openSessionTabIds: [],

  loadAgents: async () => {
    try {
      const agents = await sdk.chat.listAgents();
      set({ agents });
    } catch { /* ignore */ }
  },

  createAgent: async (data) => {
    const agent = await sdk.chat.createAgent(data);
    set((s) => ({ agents: [...s.agents, agent] }));
  },

  updateAgent: async (id, data) => {
    const updated = await sdk.chat.updateAgent(id, data);
    set((s) => ({
      agents: s.agents.map((a) => (a.id === id ? updated : a)),
    }));
  },

  deleteAgent: async (id) => {
    await sdk.chat.deleteAgent(id);
    activeChatRequests.get(id)?.abort();
    activeChatRequests.delete(id);
    set((s) => {
      const { [id]: _removed, ...restMessages } = s.messages;
      const { [id]: _sending, ...restSending } = s.sending;
      const { [id]: _error, ...restErrors } = s.errors;
      const { [id]: _streamingContent, ...restStreamingContent } = s.streamingContent;
      const { [id]: _streamingThinking, ...restStreamingThinking } = s.streamingThinking;
      const { [id]: _streamingTimeline, ...restStreamingTimeline } = s.streamingTimeline;
      return {
        agents: s.agents.filter((a) => a.id !== id),
        messages: restMessages,
        sending: restSending,
        errors: restErrors,
        streamingContent: restStreamingContent,
        streamingThinking: restStreamingThinking,
        streamingTimeline: restStreamingTimeline,
        activeAgentId: s.activeAgentId === id ? null : s.activeAgentId,
      };
    });
  },

  selectAgent: (id) => {
    set({ activeAgentId: id });
    const { messages } = get();
    if (!messages[id]) {
      get().loadMessages(id);
    }
  },

  loadMessages: async (agentId) => {
    try {
      const msgs = await sdk.chat.listMessages(agentId);
      set((s) => ({ messages: { ...s.messages, [agentId]: msgs } }));
    } catch { /* ignore */ }
  },

  sendMessage: async (agentId, content) => {
    if (get().sending[agentId]) return;

    await runChatAgent(agentId, { content }, get, set);
  },

  regenerateMessage: async (agentId, messageId) => {
    if (get().sending[agentId]) return;

    await runChatAgent(agentId, { regenerateFromMessageId: messageId }, get, set);
  },

  stopAgent: (agentId) => {
    activeChatRequests.get(agentId)?.abort();
    activeChatRequests.delete(agentId);
    set((s) => ({
      sending: { ...s.sending, [agentId]: false },
      errors: { ...s.errors, [agentId]: '' },
      streamingContent: { ...s.streamingContent, [agentId]: '' },
      streamingThinking: { ...s.streamingThinking, [agentId]: '' },
      streamingTimeline: { ...s.streamingTimeline, [agentId]: [] },
    }));
  },

  clearMessages: async (agentId) => {
    await sdk.chat.clearMessages(agentId);
    set((s) => ({
      messages: { ...s.messages, [agentId]: [] },
    }));
  },

  // --- Workspace ---
  loadWorkspaces: async () => {
    try {
      const workspaces = await sdk.chat.listWorkspaces();
      set({ workspaces });
      if (workspaces.length > 0 && !get().activeWorkspaceId) {
        get().selectWorkspace(workspaces[0].id);
      }
    } catch { /* ignore */ }
  },

  createWorkspace: async (name, agentIds) => {
    const ws = await sdk.chat.createWorkspace({ name, agentIds });
    set((s) => ({ workspaces: [...s.workspaces, ws] }));
  },

  updateWorkspace: async (id, data) => {
    const updated = await sdk.chat.updateWorkspace(id, data);
    set((s) => ({
      workspaces: s.workspaces.map(ws => ws.id === id ? updated : ws),
    }));
  },

  deleteWorkspace: async (id) => {
    await sdk.chat.deleteWorkspace(id);
    set((s) => {
      const workspaces = s.workspaces.filter(ws => ws.id !== id);
      const activeWorkspaceId = s.activeWorkspaceId === id
        ? (workspaces[0]?.id ?? null)
        : s.activeWorkspaceId;
      return { workspaces, activeWorkspaceId, sessions: [], activeSessionId: null };
    });
  },

  selectWorkspace: (id) => {
    set({ activeWorkspaceId: id, sessions: [], activeSessionId: null, sessionFileTabs: {}, activeFileTabPath: null, openSessionTabIds: [] });
    get().loadSessions(id);
    get().loadWorkspaceState(id);
  },

  // --- Session ---
  loadSessions: async (workspaceId) => {
    try {
      const sessions = await sdk.chat.listSessions(workspaceId);
      set({ sessions });
    } catch { /* ignore */ }
  },

  createSession: async (agentId) => {
    const wsId = get().activeWorkspaceId;
    if (!wsId) return null;
    const session = await sdk.chat.createSession(wsId, agentId);
    if (!session) return null;
    set((s) => ({
      sessions: [session, ...s.sessions],
    }));
    return session.id;
  },

  deleteSession: async (sessionId) => {
    const wsId = get().activeWorkspaceId;
    if (!wsId) return;
    await sdk.chat.deleteSession(wsId, sessionId);
    set((s) => {
      const sessions = s.sessions.filter(ses => ses.id !== sessionId);
      const activeSessionId = s.activeSessionId === sessionId
        ? (sessions[0]?.id ?? null)
        : s.activeSessionId;
      const hadFileTabs = Boolean(s.sessionFileTabs[sessionId]?.length);
      const { [sessionId]: _removedTabs, ...restFileTabs } = s.sessionFileTabs;
      const activeFileTabPath = hadFileTabs ? null : s.activeFileTabPath;
      return {
        sessions,
        activeSessionId,
        sessionFileTabs: restFileTabs,
        openSessionTabIds: s.openSessionTabIds.filter((id) => id !== sessionId),
        activeFileTabPath,
      };
    });
    debouncedSaveState();
  },

  archiveSession: async (sessionId) => {
    const wsId = get().activeWorkspaceId;
    if (!wsId) return;
    const updated = await sdk.chat.updateSession(wsId, sessionId, { archived: true });
    set((s) => ({
      sessions: s.sessions.map(ses => ses.id === sessionId ? updated : ses),
      activeSessionId: s.activeSessionId === sessionId ? null : s.activeSessionId,
    }));
  },

  unarchiveSession: async (sessionId) => {
    const wsId = get().activeWorkspaceId;
    if (!wsId) return;
    const updated = await sdk.chat.updateSession(wsId, sessionId, { archived: false });
    set((s) => ({
      sessions: s.sessions.map(ses => ses.id === sessionId ? updated : ses),
    }));
  },

  selectSession: (id) => {
    set({ activeSessionId: id });
    const wsId = get().activeWorkspaceId;
    if (wsId) get().loadSessionMessages(wsId, id);
  },

  updateSessionEditorDirectories: async (sessionId, data) => {
    const wsId = get().activeWorkspaceId;
    if (!wsId) return;
    const updated = await sdk.http.patch<ChatSessionWithEditorDirectories>(
      `/api/chat/workspaces/${wsId}/sessions/${sessionId}`,
      data,
    );
    set((s) => ({
      sessions: s.sessions.map((session) => session.id === sessionId ? updated : session),
    }));
  },

  // --- Session Messages ---
  loadSessionMessages: async (workspaceId, sessionId) => {
    try {
      const msgs = await sdk.chat.listSessionMessages(workspaceId, sessionId);
      set((s) => ({ messages: { ...s.messages, [sessionId]: msgs } }));
    } catch { /* ignore */ }
  },

  sendSessionMessage: async (content) => {
    const { activeWorkspaceId: wsId, activeSessionId: sessionId, sessions } = get();
    if (!wsId || !sessionId) return;
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;
    if (get().sending[sessionId]) return;
    await runSessionChat(wsId, sessionId, session.agentId, { content }, get, set);
  },

  regenerateSessionMessage: async (messageId) => {
    const { activeWorkspaceId: wsId, activeSessionId: sessionId, sessions } = get();
    if (!wsId || !sessionId) return;
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;
    if (get().sending[sessionId]) return;
    await runSessionChat(wsId, sessionId, session.agentId, { regenerateFromMessageId: messageId }, get, set);
  },

  stopSession: () => {
    const { activeSessionId: sessionId } = get();
    if (!sessionId) return;
    activeChatRequests.get(sessionId)?.abort();
    activeChatRequests.delete(sessionId);
    set((s) => ({
      sending: { ...s.sending, [sessionId]: false },
      errors: { ...s.errors, [sessionId]: '' },
      streamingContent: { ...s.streamingContent, [sessionId]: '' },
      streamingThinking: { ...s.streamingThinking, [sessionId]: '' },
      streamingTimeline: { ...s.streamingTimeline, [sessionId]: [] },
    }));
  },

  clearSessionMessages: async () => {
    const { activeWorkspaceId: wsId, activeSessionId: sessionId } = get();
    if (!wsId || !sessionId) return;
    await sdk.chat.clearSessionMessages(wsId, sessionId);
    set((s) => ({
      messages: { ...s.messages, [sessionId]: [] },
    }));
  },

  clearAllSessionMessages: async () => {
    const { activeWorkspaceId: wsId, sessions } = get();
    if (!wsId) return;
    await Promise.all(
      sessions.map((s) => sdk.chat.clearSessionMessages(wsId, s.id).catch(() => {}))
    );
    const cleared: Record<string, never[]> = {};
    sessions.forEach((s) => { cleared[s.id] = []; });
    set((s) => ({ messages: { ...s.messages, ...cleared } }));
  },

  onMessageSaved: (msg) => {
    set((s) => ({
      messages: {
        ...s.messages,
        [msg.agentId]: [...(s.messages[msg.agentId] ?? []), msg],
      },
    }));
  },

  onAgentCompleted: (agentId, message) => {
    set((s) => ({
      messages: {
        ...s.messages,
        [agentId]: [...(s.messages[agentId] ?? []), message],
      },
      sending: { ...s.sending, [agentId]: false },
      errors: { ...s.errors, [agentId]: '' },
      streamingContent: { ...s.streamingContent, [agentId]: '' },
      streamingThinking: { ...s.streamingThinking, [agentId]: '' },
      streamingTimeline: { ...s.streamingTimeline, [agentId]: [] },
    }));
  },

  onAgentError: (agentId, error) => {
    set((s) => ({
      sending: { ...s.sending, [agentId]: false },
      errors: { ...s.errors, [agentId]: error },
      streamingContent: { ...s.streamingContent, [agentId]: '' },
      streamingThinking: { ...s.streamingThinking, [agentId]: '' },
      streamingTimeline: { ...s.streamingTimeline, [agentId]: [] },
    }));
  },

  // --- File Tabs (grouped by sessionId) ---
  openChatFile: async (agentId, path) => {
    const sessionId = get().activeSessionId;
    if (!sessionId) return; // file tabs belong to a session
    const existing = (get().sessionFileTabs[sessionId] ?? []).find((f) => f.path === path);
    if (existing) {
      set({ activeFileTabPath: path });
      return;
    }
    try {
      const result = await sdk.chat.workspaceFileContent(agentId, path);
      const name = path.split('/').pop() || path;
      set((s) => ({
        sessionFileTabs: {
          ...s.sessionFileTabs,
          [sessionId]: [...(s.sessionFileTabs[sessionId] ?? []), { path, name, content: result.content, agentId }],
        },
        activeFileTabPath: path,
      }));
      debouncedSaveState();
    } catch { /* ignore */ }
  },

  closeChatFile: (path) => {
    const sessionId = get().activeSessionId;
    if (!sessionId) return;
    set((s) => {
      const tabs = (s.sessionFileTabs[sessionId] ?? []).filter((f) => f.path !== path);
      const { [sessionId]: _kept, ...rest } = s.sessionFileTabs;
      const sessionFileTabs = tabs.length > 0 ? { ...rest, [sessionId]: tabs } : rest;
      const activeFileTabPath = s.activeFileTabPath === path
        ? (tabs[tabs.length - 1]?.path ?? null)
        : s.activeFileTabPath;
      return { sessionFileTabs, activeFileTabPath };
    });
    debouncedSaveState();
  },

  setActiveFileTab: (path) => {
    set({ activeFileTabPath: path });
    debouncedSaveState();
  },

  // --- Workspace State Persistence ---
  loadWorkspaceState: async (workspaceId) => {
    try {
      const state = await sdk.chat.getWorkspaceState(workspaceId) as {
        openSessionTabIds?: string[];
        sessionFileTabs?: Record<string, Array<{ path: string; agentId: string }>>;
        activeTab?: { type: string; id: string } | null;
      };
      const restoredSessionId = state.activeTab?.type === 'session' ? state.activeTab.id : null;
      set({
        openSessionTabIds: state.openSessionTabIds ?? [],
        sessionFileTabs: {}, // file content loaded on demand
        activeFileTabPath: state.activeTab?.type === 'file' ? state.activeTab.id : null,
        activeSessionId: restoredSessionId,
      });
      // 恢复上次激活会话的消息，确保 UI 真正"激活"而不仅是高亮
      if (restoredSessionId) {
        get().loadSessionMessages(workspaceId, restoredSessionId);
      }
      // Pre-load file tab contents (per session); legacy flat openFileTabs is dropped
      const persisted = state.sessionFileTabs ?? {};
      for (const [sid, tabs] of Object.entries(persisted)) {
        for (const ft of tabs) {
          try {
            const result = await sdk.chat.workspaceFileContent(ft.agentId, ft.path);
            const name = ft.path.split('/').pop() || ft.path;
            set((s) => ({
              sessionFileTabs: {
                ...s.sessionFileTabs,
                [sid]: [...(s.sessionFileTabs[sid] ?? []), { path: ft.path, name, content: result.content, agentId: ft.agentId }],
              },
            }));
          } catch { /* skip files that can't be loaded */ }
        }
      }
    } catch { /* ignore */ }
  },

  saveWorkspaceState: () => {
    const { activeWorkspaceId, openSessionTabIds, sessionFileTabs, activeSessionId, activeFileTabPath } = get();
    if (!activeWorkspaceId) return;
    const activeTab = activeSessionId
      ? { type: 'session' as const, id: activeSessionId }
      : activeFileTabPath
        ? { type: 'file' as const, id: activeFileTabPath }
        : null;
    const persistedFileTabs: Record<string, Array<{ path: string; agentId: string }>> = {};
    for (const [sid, tabs] of Object.entries(sessionFileTabs)) {
      persistedFileTabs[sid] = tabs.map((f) => ({ path: f.path, agentId: f.agentId }));
    }
    const state = {
      openSessionTabIds,
      sessionFileTabs: persistedFileTabs,
      activeTab,
    };
    sdk.chat.saveWorkspaceState(activeWorkspaceId, state).catch(() => {});
  },

  setOpenSessionTabIds: (ids) => {
    set({ openSessionTabIds: ids });
  },

  selectSessionTab: (sessionId) => {
    const { openSessionTabIds } = get();
    if (!openSessionTabIds.includes(sessionId)) {
      set({ openSessionTabIds: [...openSessionTabIds, sessionId] });
    }
    get().selectSession(sessionId);
    debouncedSaveState();
  },

  removeSessionTab: (sessionId) => {
    set((s) => ({
      openSessionTabIds: s.openSessionTabIds.filter((id) => id !== sessionId),
    }));
    debouncedSaveState();
  },
}));

async function runChatAgent(
  agentId: string,
  body: { content?: string; regenerateFromMessageId?: string },
  get: () => ChatStore,
  set: ChatSet,
): Promise<void> {
  const controller = new AbortController();
  activeChatRequests.set(agentId, controller);
  set((s) => ({
    sending: { ...s.sending, [agentId]: true },
    errors: { ...s.errors, [agentId]: '' },
    streamingContent: { ...s.streamingContent, [agentId]: '' },
    streamingThinking: { ...s.streamingThinking, [agentId]: '' },
    streamingTimeline: { ...s.streamingTimeline, [agentId]: [] },
  }));

  try {
    const response = await sdk.http.raw(`/api/chat/agents/${agentId}/run`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok || !response.body) {
      get().onAgentError(agentId, await response.text().catch(() => response.statusText));
      return;
    }

    await readChatRunStream(agentId, response.body, get, set);
  } catch (err) {
    if (!(err instanceof DOMException && err.name === 'AbortError')) {
      get().onAgentError(agentId, err instanceof Error ? err.message : String(err));
    }
  } finally {
    if (activeChatRequests.get(agentId) === controller) {
      activeChatRequests.delete(agentId);
    }
    set((s) => ({
      sending: { ...s.sending, [agentId]: false },
    }));
  }
}

async function readChatRunStream(
  agentId: string,
  body: ReadableStream<Uint8Array>,
  get: () => ChatStore,
  set: ChatSet,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() ?? '';

    for (const block of blocks) {
      handleChatRunEvent(agentId, parseSseBlock(block), get, set);
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    handleChatRunEvent(agentId, parseSseBlock(buffer), get, set);
  }
}

function parseSseBlock(block: string): { event: string; data: unknown } | null {
  let event = '';
  const dataLines: string[] = [];

  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (!event || dataLines.length === 0) return null;
  try {
    return { event, data: JSON.parse(dataLines.join('\n')) };
  } catch {
    return null;
  }
}

function handleChatRunEvent(
  agentId: string,
  payload: { event: string; data: unknown } | null,
  get: () => ChatStore,
  set: ChatSet,
): void {
  if (!payload) return;

  switch (payload.event) {
    case 'message_saved': {
      const msg = payload.data as ChatMessage;
      set((s) => ({
        messages: {
          ...s.messages,
          [agentId]: [...(s.messages[agentId] ?? []), msg],
        },
      }));
      break;
    }
    case 'session_updated': {
      const session = payload.data as ChatSessionWithEditorDirectories;
      set((s) => ({
        sessions: s.sessions.map((item) => item.id === session.id ? session : item),
      }));
      break;
    }
    case 'output': {
      const data = payload.data as { chunk?: string };
      appendStreamingText(set, 'streamingContent', agentId, data.chunk);
      appendStreamingTimelineMessage(set, agentId, data.chunk);
      break;
    }
    case 'thinking': {
      const data = payload.data as { chunk?: string };
      appendStreamingText(set, 'streamingThinking', agentId, data.chunk);
      break;
    }
    case 'completed': {
      const data = payload.data as { message?: ChatMessage };
      if (data.message) {
        set((s) => ({
          messages: {
            ...s.messages,
            [agentId]: [...(s.messages[agentId] ?? []), withStreamingTimeline(data.message!, s.streamingTimeline[agentId])],
          },
          sending: { ...s.sending, [agentId]: false },
          errors: { ...s.errors, [agentId]: '' },
          streamingContent: { ...s.streamingContent, [agentId]: '' },
          streamingThinking: { ...s.streamingThinking, [agentId]: '' },
          streamingTimeline: { ...s.streamingTimeline, [agentId]: [] },
        }));
      }
      break;
    }
    case 'tool_use': {
      const data = payload.data as { id?: string; name?: string; input?: unknown };
      appendStreamingToolUse(set, agentId, data);
      break;
    }
    case 'tool_result': {
      const data = payload.data as { toolUseId?: string; name?: string; result?: unknown };
      completeStreamingToolCall(set, agentId, data);
      break;
    }
    case 'error': {
      const data = payload.data as { error?: string };
      set((s) => ({
        sending: { ...s.sending, [agentId]: false },
        errors: { ...s.errors, [agentId]: data.error ?? 'Chat run failed' },
        streamingContent: { ...s.streamingContent, [agentId]: '' },
        streamingThinking: { ...s.streamingThinking, [agentId]: '' },
        streamingTimeline: { ...s.streamingTimeline, [agentId]: [] },
      }));
      break;
    }
  }
}

function appendStreamingText(
  set: ChatSet,
  key: 'streamingContent' | 'streamingThinking',
  agentId: string,
  chunk?: string,
): void {
  if (!chunk) return;
  set((s) => ({
    [key]: {
      ...s[key],
      [agentId]: (s[key][agentId] ?? '') + chunk,
    },
  }));
}

function appendStreamingTimelineMessage(
  set: ChatSet,
  agentId: string,
  chunk?: string,
): void {
  if (!chunk) return;
  set((s) => {
    const timeline = [...(s.streamingTimeline[agentId] ?? [])];
    const latest = timeline.at(-1);
    if (latest?.type === 'message') {
      timeline[timeline.length - 1] = { ...latest, content: `${latest.content}${chunk}` };
    } else {
      timeline.push({
        id: `message-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: 'message',
        content: chunk,
      });
    }
    return {
      streamingTimeline: {
        ...s.streamingTimeline,
        [agentId]: timeline,
      },
    };
  });
}

function withStreamingTimeline(message: ChatMessage, streamingTimeline?: WorkflowAgentTimelineItem[]): ChatMessage {
  if (message.timeline?.length || !streamingTimeline?.length) return message;
  const timeline = streamingTimeline.filter((item) => item.type !== 'message');
  return timeline.length ? { ...message, timeline } : message;
}

function appendStreamingToolUse(
  set: ChatSet,
  agentId: string,
  data: { id?: string; name?: string; input?: unknown },
): void {
  const name = data.name || 'tool';
  set((s) => ({
    streamingTimeline: {
      ...s.streamingTimeline,
      [agentId]: [
        ...(s.streamingTimeline[agentId] ?? []),
        {
          id: data.id || `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: 'tool',
          name,
          input: data.input,
          status: 'running',
        },
      ],
    },
  }));
}

function completeStreamingToolCall(
  set: ChatSet,
  agentId: string,
  data: { toolUseId?: string; name?: string; result?: unknown },
): void {
  const toolUseId = data.toolUseId || data.name || 'tool';
  set((s) => {
    const timeline = [...(s.streamingTimeline[agentId] ?? [])];
    const index = findLastIndex(timeline, (item) => item.type === 'tool' && item.status === 'running' && item.id === toolUseId);
    const fallbackIndex = index === -1
      ? findLastIndex(timeline, (item) => item.type === 'tool' && item.status === 'running')
      : index;

    if (fallbackIndex === -1) {
      timeline.push({
        id: `${toolUseId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: 'tool',
        name: data.name || toolUseId,
        result: data.result,
        status: isErrorToolResult(data.result) ? 'error' : 'success',
      });
    } else {
      const item = timeline[fallbackIndex];
      if (item?.type === 'tool') {
        timeline[fallbackIndex] = {
          ...item,
          result: data.result,
          status: isErrorToolResult(data.result) ? 'error' : 'success',
        };
      }
    }

    return {
      streamingTimeline: {
        ...s.streamingTimeline,
        [agentId]: timeline,
      },
    };
  });
}

function isErrorToolResult(result: unknown): boolean {
  return Boolean(
    result
    && typeof result === 'object'
    && 'success' in result
    && (result as { success?: unknown }).success === false
  );
}

function findLastIndex<T>(items: T[], predicate: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index])) return index;
  }
  return -1;
}

async function runSessionChat(
  workspaceId: string,
  sessionId: string,
  _agentId: string,
  body: { content?: string; regenerateFromMessageId?: string },
  get: () => ChatStore,
  set: ChatSet,
): Promise<void> {
  const controller = new AbortController();
  activeChatRequests.set(sessionId, controller);
  set((s) => ({
    sending: { ...s.sending, [sessionId]: true },
    errors: { ...s.errors, [sessionId]: '' },
    streamingContent: { ...s.streamingContent, [sessionId]: '' },
    streamingThinking: { ...s.streamingThinking, [sessionId]: '' },
    streamingTimeline: { ...s.streamingTimeline, [sessionId]: [] },
  }));

  try {
    const response = await sdk.http.raw(`/api/chat/sessions/${sessionId}/run`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...body, workspaceId }),
    });

    if (!response.ok || !response.body) {
      get().onAgentError(sessionId, await response.text().catch(() => response.statusText));
      return;
    }

    await readChatRunStream(sessionId, response.body, get, set);
  } catch (err) {
    if (!(err instanceof DOMException && err.name === 'AbortError')) {
      get().onAgentError(sessionId, err instanceof Error ? err.message : String(err));
    }
  } finally {
    if (activeChatRequests.get(sessionId) === controller) {
      activeChatRequests.delete(sessionId);
    }
    set((s) => ({
      sending: { ...s.sending, [sessionId]: false },
    }));
  }
}
