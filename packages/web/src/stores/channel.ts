import { create } from 'zustand';
import type { Channel, Message, TodoItem } from '@agent-spaces/shared';
import { getWS } from '@/lib/ws';

interface ChannelStore {
  workspaceId: string | null;
  channels: Channel[];
  activeChannelId: string | null;
  /** 每次 setActiveChannel 递增，用于触发 tab 切换 */
  channelSelectSeq: number;
  messages: Record<string, Message[]>;

  loadChannels: (workspaceId: string) => Promise<void>;
  createChannel: (workspaceId: string, name: string, type?: Channel['type'], members?: string[]) => Promise<void>;
  updateChannel: (workspaceId: string, channelId: string, data: Partial<Pick<Channel, 'name' | 'type' | 'issueId' | 'members' | 'pinnedMentionId' | 'draft' | 'todos'>>) => Promise<void>;
  setActiveChannel: (id: string) => void;
  loadMessages: (workspaceId: string, channelId: string) => Promise<void>;
  sendMessage: (workspaceId: string, channelId: string, content: string, mentions?: string[], attachments?: Message['attachments']) => void;
  addMessage: (channelId: string, message: Message) => void;
  updateMessage: (channelId: string, message: Message) => void;
  stopProcessingMessages: (channelId: string) => void;
  deleteMessage: (channelId: string, messageId: string) => void;
  clearMessages: (workspaceId: string, channelId: string) => Promise<void>;
  deleteChannel: (workspaceId: string, channelId: string) => Promise<void>;
  removeChannelLocal: (channelId: string) => void;
  saveDraft: (workspaceId: string, channelId: string, content: string) => Promise<void>;
  clearDraft: (workspaceId: string, channelId: string) => Promise<void>;
}

const STORAGE_KEY_PREFIX = 'agent-spaces:channel:';

function getStoredActiveId(workspaceId: string, channels: Channel[]): string | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_PREFIX + workspaceId);
    if (saved && channels.some((c) => c.id === saved)) return saved;
  } catch { /* ignore */ }
  return channels[0]?.id ?? null;
}

export const useChannelStore = create<ChannelStore>((set, get) => ({
  workspaceId: null,
  channels: [],
  activeChannelId: null,
  channelSelectSeq: 0,
  messages: {},

  loadChannels: async (workspaceId) => {
    const res = await fetch(`/api/workspaces/${workspaceId}/channels`);
    const channels: Channel[] = await res.json();
    const activeChannelId = getStoredActiveId(workspaceId, channels);
    set({ workspaceId, channels, activeChannelId });
  },

  createChannel: async (workspaceId, name, type = 'general', members) => {
    const res = await fetch(`/api/workspaces/${workspaceId}/channels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, type, members }),
    });
    const channel: Channel = await res.json();
    set((s) => ({ channels: [...s.channels, channel], activeChannelId: channel.id }));
  },

  updateChannel: async (workspaceId, channelId, data) => {
    const res = await fetch(`/api/workspaces/${workspaceId}/channels/${channelId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const updated: Channel = await res.json();
    set((s) => ({ channels: s.channels.map((c) => (c.id === channelId ? updated : c)) }));
  },

  setActiveChannel: (id) => {
    const { workspaceId } = useChannelStore.getState();
    if (workspaceId) {
      try { localStorage.setItem(STORAGE_KEY_PREFIX + workspaceId, id); } catch { /* ignore */ }
    }
    set((s) => ({ activeChannelId: id, channelSelectSeq: s.channelSelectSeq + 1 }));
  },

  loadMessages: async (workspaceId, channelId) => {
    const res = await fetch(`/api/workspaces/${workspaceId}/channels/${channelId}/messages`);
    const msgs: Message[] = await res.json();
    set((s) => ({ messages: { ...s.messages, [channelId]: msgs } }));
  },

  sendMessage: (workspaceId, channelId, content, mentions = [], attachments = []) => {
    const ws = getWS(workspaceId);
    ws.send('channel.message', { channelId, content, mentions, attachments });
  },

  addMessage: (channelId, message) => {
    set((s) => ({
      messages: {
        ...s.messages,
        [channelId]: [...(s.messages[channelId] || []), message],
      },
    }));
  },

  updateMessage: (channelId, message) => {
    set((s) => ({
      messages: {
        ...s.messages,
        [channelId]: (s.messages[channelId] || []).map((item) =>
          item.id === message.id ? message : item,
        ),
      },
    }));
  },

  stopProcessingMessages: (channelId) => {
    set((s) => ({
      messages: {
        ...s.messages,
        [channelId]: (s.messages[channelId] || []).map((message) =>
          message.status === 'pending' || message.status === 'streaming' || message.status === 'waiting_for_user'
            ? { ...message, status: 'error', content: message.content || 'Stopped by user' }
            : message,
        ),
      },
    }));
  },

  deleteMessage: (channelId, messageId) => {
    set((s) => ({
      messages: {
        ...s.messages,
        [channelId]: (s.messages[channelId] || []).filter((item) => item.id !== messageId),
      },
    }));
  },

  clearMessages: async (workspaceId, channelId) => {
    await fetch(`/api/workspaces/${workspaceId}/channels/${channelId}/messages`, { method: 'DELETE' });
    set((s) => ({
      messages: { ...s.messages, [channelId]: [] },
    }));
  },

  deleteChannel: async (workspaceId, channelId) => {
    await fetch(`/api/workspaces/${workspaceId}/channels/${channelId}`, { method: 'DELETE' });
    get().removeChannelLocal(channelId);
  },

  removeChannelLocal: (channelId) => {
    set((s) => {
      const channels = s.channels.filter((c) => c.id !== channelId);
      const rest = { ...s.messages };
      delete rest[channelId];
      return {
        channels,
        activeChannelId: s.activeChannelId === channelId ? (channels[0]?.id ?? null) : s.activeChannelId,
        messages: rest,
      };
    });
  },

  saveDraft: async (workspaceId, channelId, content) => {
    const current = useChannelStore.getState().channels.find((c) => c.id === channelId);
    if (current?.draft?.content === content) return;
    const draft = { content, updatedAt: new Date().toISOString() };
    set((s) => ({
      channels: s.channels.map((c) => (c.id === channelId ? { ...c, draft } : c)),
    }));
    await fetch(`/api/workspaces/${workspaceId}/channels/${channelId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draft }),
    });
  },

  clearDraft: async (workspaceId, channelId) => {
    set((s) => ({
      channels: s.channels.map((c) => (c.id === channelId ? { ...c, draft: undefined } : c)),
    }));
    await fetch(`/api/workspaces/${workspaceId}/channels/${channelId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draft: null }),
    });
  },
}));
