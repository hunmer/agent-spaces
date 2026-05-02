import { create } from 'zustand';
import type { Channel, Message } from '@agent-spaces/shared';
import { getWS } from '@/lib/ws';

interface ChannelStore {
  channels: Channel[];
  activeChannelId: string | null;
  messages: Record<string, Message[]>;

  loadChannels: (workspaceId: string) => Promise<void>;
  createChannel: (workspaceId: string, name: string, type?: Channel['type']) => Promise<void>;
  updateChannel: (workspaceId: string, channelId: string, data: Partial<Pick<Channel, 'name' | 'type' | 'members'>>) => Promise<void>;
  setActiveChannel: (id: string) => void;
  loadMessages: (workspaceId: string, channelId: string) => Promise<void>;
  sendMessage: (workspaceId: string, channelId: string, content: string, mentions?: string[]) => void;
  addMessage: (channelId: string, message: Message) => void;
  updateMessage: (channelId: string, message: Message) => void;
  deleteMessage: (channelId: string, messageId: string) => void;
  deleteChannel: (workspaceId: string, channelId: string) => Promise<void>;
}

export const useChannelStore = create<ChannelStore>((set) => ({
  channels: [],
  activeChannelId: null,
  messages: {},

  loadChannels: async (workspaceId) => {
    const res = await fetch(`/api/workspaces/${workspaceId}/channels`);
    const channels: Channel[] = await res.json();
    set({ channels, activeChannelId: channels[0]?.id ?? null });
  },

  createChannel: async (workspaceId, name, type = 'general') => {
    const res = await fetch(`/api/workspaces/${workspaceId}/channels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, type }),
    });
    const channel: Channel = await res.json();
    set((s) => ({ channels: [...s.channels, channel] }));
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

  setActiveChannel: (id) => set({ activeChannelId: id }),

  loadMessages: async (workspaceId, channelId) => {
    const res = await fetch(`/api/workspaces/${workspaceId}/channels/${channelId}/messages`);
    const msgs: Message[] = await res.json();
    set((s) => ({ messages: { ...s.messages, [channelId]: msgs } }));
  },

  sendMessage: (workspaceId, channelId, content, mentions = []) => {
    const ws = getWS(workspaceId);
    ws.send('channel.message', { channelId, content, mentions });
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

  deleteMessage: (channelId, messageId) => {
    set((s) => ({
      messages: {
        ...s.messages,
        [channelId]: (s.messages[channelId] || []).filter((item) => item.id !== messageId),
      },
    }));
  },

  deleteChannel: async (workspaceId, channelId) => {
    await fetch(`/api/workspaces/${workspaceId}/channels/${channelId}`, { method: 'DELETE' });
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
}));
