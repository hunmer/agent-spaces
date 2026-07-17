import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { IChatMessage } from '../../../types/IOfficeState'
import phaserGame from '../PhaserGame'
import Game from '../scenes/Game'

/**
 * MessageType 区分：
 *   - PLAYER_JOINED / PLAYER_LEFT: 人类玩家进出
 *   - AGENT_EVENT: 外部 Agent 的事件（spawn / talk / action / left）
 *   - REGULAR_MESSAGE: 人类玩家的聊天消息（保留通道）
 */
export enum MessageType {
  PLAYER_JOINED,
  PLAYER_LEFT,
  AGENT_EVENT,
  REGULAR_MESSAGE,
}

export const chatSlice = createSlice({
  name: 'chat',
  initialState: {
    chatMessages: new Array<{ messageType: MessageType; chatMessage: IChatMessage }>(),
    focused: false,
    showChat: true,
  },
  reducers: {
    pushChatMessage: (state, action: PayloadAction<IChatMessage>) => {
      state.chatMessages.push({
        messageType: MessageType.REGULAR_MESSAGE,
        chatMessage: action.payload,
      })
    },
    pushPlayerJoinedMessage: (state, action: PayloadAction<string>) => {
      state.chatMessages.push({
        messageType: MessageType.PLAYER_JOINED,
        chatMessage: {
          createdAt: new Date().getTime(),
          author: action.payload,
          content: 'joined the lobby',
        } as IChatMessage,
      })
    },
    pushPlayerLeftMessage: (state, action: PayloadAction<string>) => {
      state.chatMessages.push({
        messageType: MessageType.PLAYER_LEFT,
        chatMessage: {
          createdAt: new Date().getTime(),
          author: action.payload,
          content: 'left the lobby',
        } as IChatMessage,
      })
    },
    pushAgentEvent: (
      state,
      action: PayloadAction<{ author: string; content: string; createdAt?: number }>
    ) => {
      state.chatMessages.push({
        messageType: MessageType.AGENT_EVENT,
        chatMessage: {
          createdAt: action.payload.createdAt ?? new Date().getTime(),
          author: action.payload.author,
          content: action.payload.content,
        } as IChatMessage,
      })
    },
    setFocused: (state, action: PayloadAction<boolean>) => {
      const game = phaserGame.scene.keys.game as Game
      action.payload ? game.disableKeys() : game.enableKeys()
      state.focused = action.payload
    },
    setShowChat: (state, action: PayloadAction<boolean>) => {
      state.showChat = action.payload
    },
    clearMessages: (state) => {
      state.chatMessages = []
    },
  },
})

export const {
  pushChatMessage,
  pushPlayerJoinedMessage,
  pushPlayerLeftMessage,
  pushAgentEvent,
  setFocused,
  setShowChat,
  clearMessages,
} = chatSlice.actions

export default chatSlice.reducer
