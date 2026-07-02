import { create } from 'zustand';
import type { Channel, Message } from '@agent-spaces/shared';
import { getWS } from '@/lib/ws';
import { sdk } from '@/lib/sdk';

export interface MiniAppMessageContext {
  projectId: string;
  activeFilePath?: string;
  projectType?: 'react' | 'html';
  fileContent?: string;
}

interface ChannelStore {
  workspaceId: string | null;
  channels: Channel[];
  activeChannelId: string | null;
  /** 每次 setActiveChannel 递增，用于触发 tab 切换 */
  channelSelectSeq: number;
  messages: Record<string, Message[]>;
  createDialogOpen: boolean;
  setCreateDialogOpen: (open: boolean) => void;

  loadChannels: (workspaceId: string) => Promise<void>;
  createChannel: (workspaceId: string, name: string, type?: Channel['type'], members?: string[], titlePrompt?: string) => Promise<void>;
  updateChannel: (workspaceId: string, channelId: string, data: Partial<Pick<Channel, 'name' | 'type' | 'issueId' | 'members' | 'pinnedMentionId' | 'draft' | 'todos' | 'archived'>>) => Promise<Channel>;
  setActiveChannel: (id: string) => void;
  loadMessages: (workspaceId: string, channelId: string) => Promise<void>;
  loadChannelState: (workspaceId: string, channelId: string) => Promise<ChannelState | null>;
  sendMessage: (workspaceId: string, channelId: string, content: string, mentions?: string[], attachments?: Message['attachments'], replyToMessageId?: string, contextLength?: number, miniAppContext?: MiniAppMessageContext) => void;
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

export interface ChannelState {
  channelId: string;
  active: boolean;
  lastMessage: {
    id: string;
    status?: Message['status'];
    metadata?: Message['metadata'];
    hasPendingQuestion?: boolean;
  } | null;
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
    && (channel.type === 'general' || channel.type === 'issue' || channel.type === 'agent' || channel.type === 'mini-apps')
    && Array.isArray(channel.members)
    && typeof channel.createdAt === 'string';
}

function uniqueMembers(members: string[] | undefined): string[] {
  return [...new Set(members ?? [])];
}

function normalizeChannel(channel: Channel): Channel {
  return { ...channel, members: uniqueMembers(channel.members) };
}

export const useChannelStore = create<ChannelStore>((set, get) => ({
  workspaceId: null,
  channels: [],
  activeChannelId: null,
  channelSelectSeq: 0,
  messages: {},
  createDialogOpen: false,
  setCreateDialogOpen: (open) => set({ createDialogOpen: open }),

  loadChannels: async (workspaceId) => {
    const { workspaceId: currentWid } = get();
    if (currentWid === workspaceId && get().channels.length > 0) return;
    const channels = (await sdk.channel.list(workspaceId)).map(normalizeChannel);
    const activeChannelId = getStoredActiveId(workspaceId, channels);
    set({ workspaceId, channels, activeChannelId });
  },

  createChannel: async (workspaceId, name, type = 'general', members, titlePrompt) => {
    const channel = normalizeChannel(await sdk.channel.create(workspaceId, { name, type, members, titlePrompt }));
    set((s) => {
      const exists = s.channels.some((c) => c.id === channel.id);
      return {
        channels: exists ? s.channels.map((c) => (c.id === channel.id ? channel : c)) : [...s.channels, channel],
        activeChannelId: channel.id,
      };
    });
  },

  updateChannel: async (workspaceId, channelId, data) => {
    const updated = normalizeChannel(await sdk.channel.update(workspaceId, channelId, data));
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
    try {
      const data = await sdk.channel.getMessages(workspaceId, channelId);
      set((s) => ({ messages: { ...s.messages, [channelId]: data } }));
    } catch {
      set((s) => ({ messages: { ...s.messages, [channelId]: [] } }));
    }
  },

  loadChannelState: async (workspaceId, channelId) => {
    try {
      return (await sdk.channel.getState(workspaceId, channelId)) as unknown as ChannelState;
    } catch {
      return null;
    }
  },

  sendMessage: (workspaceId, channelId, content, mentions = [], attachments = [], replyToMessageId, contextLength, miniAppContext) => {
    const ws = getWS(workspaceId);
    ws.send('channel.message', { channelId, content, mentions, attachments, replyToMessageId, contextLength, miniAppContext });
  },

  addMessage: (channelId, message) => {
    set((s) => ({
      messages: {
        ...s.messages,
        [channelId]: ensureMessageArray(s.messages[channelId]).some((item) => item.id === message.id)
          ? ensureMessageArray(s.messages[channelId])
          : [...ensureMessageArray(s.messages[channelId]), message],
      },
    }));
  },

  updateMessage: (channelId, message) => {
    set((s) => ({
      messages: {
        ...s.messages,
        [channelId]: ensureMessageArray(s.messages[channelId]).some((item) => item.id === message.id)
          ? ensureMessageArray(s.messages[channelId]).map((item) => item.id === message.id ? message : item)
          : [...ensureMessageArray(s.messages[channelId]), message],
      },
    }));
  },

  stopProcessingMessages: (channelId) => {
    set((s) => ({
      messages: {
        ...s.messages,
        [channelId]: ensureMessageArray(s.messages[channelId]).map((message) =>
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
        [channelId]: ensureMessageArray(s.messages[channelId]).filter((item) => item.id !== messageId),
      },
    }));
  },

  clearMessages: async (workspaceId, channelId) => {
    await sdk.channel.clearMessages(workspaceId, channelId).catch(() => {});
    set((s) => ({
      messages: { ...s.messages, [channelId]: [] },
    }));
  },

  deleteChannel: async (workspaceId, channelId) => {
    await sdk.channel.delete_(workspaceId, channelId).catch(() => {});
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
        members: Array.isArray(channel.members) ? uniqueMembers(channel.members) : current.members,
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
    await sdk.channel.update(workspaceId, channelId, { draft }).catch(() => {});
  },

  clearDraft: async (workspaceId, channelId) => {
    set((s) => ({
      channels: s.channels.map((c) => (c.id === channelId ? { ...c, draft: undefined } : c)),
    }));
    await sdk.channel.update(workspaceId, channelId, { draft: null as unknown as undefined }).catch(() => {});
  },

  ensureAndActivateChannel: async (workspaceId, channelId) => {
    const { channels } = get();
    if (!channels.some((c) => c.id === channelId)) {
      try {
        const all = (await sdk.channel.list(workspaceId)).map(normalizeChannel);
        set({ channels: all });
      } catch { /* ignore */ }
    }
    get().setActiveChannel(channelId);
  },
}));

function ensureMessageArray(value: unknown): Message[] {
  return Array.isArray(value) ? value : [];
}
