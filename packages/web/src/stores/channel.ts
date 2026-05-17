import { create } from 'zustand';
import type { Channel, Message } from '@agent-spaces/shared';
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
  updateChannel: (workspaceId: string, channelId: string, data: Partial<Pick<Channel, 'name' | 'type' | 'issueId' | 'members' | 'pinnedMentionId' | 'draft' | 'todos' | 'notifyOnComplete' | 'archived'>>) => Promise<Channel>;
  setActiveChannel: (id: string) => void;
  loadMessages: (workspaceId: string, channelId: string) => Promise<void>;
  sendMessage: (workspaceId: string, channelId: string, content: string, mentions?: string[], attachments?: Message['attachments'], replyToMessageId?: string) => void;
  addMessage: (channelId: string, message: Message) => void;
  updateMessage: (channelId: string, message: Message) => void;
  stopProcessingMessages: (channelId: string) => void;
  deleteMessage: (channelId: string, messageId: string) => void;
  clearMessages: (workspaceId: string, channelId: string) => Promise<void>;
  deleteChannel: (workspaceId: string, channelId: string) => Promise<void>;
  removeChannelLocal: (channelId: string) => void;
  upsertChannel: (channel: Partial<Channel> & Pick<Channel, 'id'>) => void;
  saveDraft: (workspaceId: string, channelId: string, content: string) => Promise<void>;
  clearDraft: (workspaceId: string, channelId: string) => Promise<void>;
  /** Ensure channel exists in store (fetch from server if missing), then activate it */
  ensureAndActivateChannel: (workspaceId: string, channelId: string) => Promise<void>;
}

const STORAGE_KEY_PREFIX = 'agent-spaces:channel:';

function getStoredActiveId(workspaceId: string, channels: Channel[]): string | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_PREFIX + workspaceId);
    if (saved && channels.some((c) => c.id === saved)) return saved;
  } catch { /* ignore */ }
  return channels[0]?.id ?? null;
}

function isChannel(channel: Partial<Channel> & Pick<Channel, 'id'>): channel is Channel {
  return typeof channel.workspaceId === 'string'
    && typeof channel.name === 'string'
    && (channel.type === 'general' || channel.type === 'issue' || channel.type === 'agent')
    && Array.isArray(channel.members)
    && typeof channel.createdAt === 'string';
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
    set((s) => {
      const exists = s.channels.some((c) => c.id === channel.id);
      return {
        channels: exists ? s.channels.map((c) => (c.id === channel.id ? channel : c)) : [...s.channels, channel],
        activeChannelId: channel.id,
      };
    });
  },

  updateChannel: async (workspaceId, channelId, data) => {
    const res = await fetch(`/api/workspaces/${workspaceId}/channels/${channelId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to update channel');
    const updated: Channel = await res.json();
    set((s) => ({ channels: s.channels.map((c) => (c.id === channelId ? updated : c)) }));
    return updated;
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

  sendMessage: (workspaceId, channelId, content, mentions = [], attachments = [], replyToMessageId) => {
    const ws = getWS(workspaceId);
    ws.send('channel.message', { channelId, content, mentions, attachments, replyToMessageId });
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

  upsertChannel: (channel) => {
    set((s) => {
      const idx = s.channels.findIndex((c) => c.id === channel.id);
      if (idx < 0) {
        return isChannel(channel) ? { channels: [...s.channels, channel] } : { channels: s.channels };
      }

      const copy = [...s.channels];
      const current = copy[idx];
      copy[idx] = {
        ...current,
        ...channel,
        members: Array.isArray(channel.members) ? channel.members : current.members,
      };
      return { channels: copy };
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

  ensureAndActivateChannel: async (workspaceId, channelId) => {
    const { channels } = get();
    if (!channels.some((c) => c.id === channelId)) {
      const res = await fetch(`/api/workspaces/${workspaceId}/channels`);
      if (res.ok) {
        const all: Channel[] = await res.json();
        set({ channels: all });
      }
    }
    get().setActiveChannel(channelId);
  },
}));
