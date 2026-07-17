import { create } from 'zustand'
import { getPhaserGame } from '../phaser-ref'
import type Game from '../scenes/Game'
import type { IChatMessage } from '@agent-spaces/shared/skyoffice'

export enum MessageType {
  PLAYER_JOINED,
  PLAYER_LEFT,
  AGENT_EVENT,
  REGULAR_MESSAGE,
}

export interface ChatMessageEntry {
  messageType: MessageType
  chatMessage: IChatMessage
}

interface ChatState {
  chatMessages: ChatMessageEntry[]
  focused: boolean
  showChat: boolean
  pushChatMessage: (m: IChatMessage) => void
  pushPlayerJoinedMessage: (name: string) => void
  pushPlayerLeftMessage: (name: string) => void
  pushAgentEvent: (payload: { author: string; content: string; createdAt?: number }) => void
  /** 聚焦聊天：启用/禁用 Phaser 键盘捕获（避免 WASD 同时输入文字）。 */
  setFocused: (v: boolean) => void
  setShowChat: (v: boolean) => void
  clearMessages: () => void
}

export const useChatStore = create<ChatState>((set) => ({
  chatMessages: [],
  focused: false,
  showChat: true,

  pushChatMessage: (m) =>
    set((s) => ({
      chatMessages: [...s.chatMessages, { messageType: MessageType.REGULAR_MESSAGE, chatMessage: m }],
    })),

  pushPlayerJoinedMessage: (name) =>
    set((s) => ({
      chatMessages: [
        ...s.chatMessages,
        { messageType: MessageType.PLAYER_JOINED, chatMessage: { author: name, content: 'joined the lobby', createdAt: Date.now() } },
      ],
    })),

  pushPlayerLeftMessage: (name) =>
    set((s) => ({
      chatMessages: [
        ...s.chatMessages,
        { messageType: MessageType.PLAYER_LEFT, chatMessage: { author: name, content: 'left the lobby', createdAt: Date.now() } },
      ],
    })),

  pushAgentEvent: ({ author, content, createdAt }) =>
    set((s) => ({
      chatMessages: [
        ...s.chatMessages,
        { messageType: MessageType.AGENT_EVENT, chatMessage: { author, content, createdAt: createdAt ?? Date.now() } },
      ],
    })),

  setFocused: (v) => {
    const game = getPhaserGame()?.scene.keys.game as Game | undefined
    if (v) game?.disableKeys()
    else game?.enableKeys()
    set({ focused: v })
  },

  setShowChat: (v) => set({ showChat: v }),
  clearMessages: () => set({ chatMessages: [] }),
}))
