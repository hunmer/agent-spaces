import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { AgentActivity } from '../../../types/IAgent'

/**
 * 调试面板用的成员快照。
 * 包含 agents（外部 Agent）和 players（人类 viewer）。
 */
export interface AgentListItem {
  id: string
  name: string
  texture: string
  x: number
  y: number
  anim: string
  activity: AgentActivity
  /** 是否为人类玩家（true=浏览器键盘控制，false=外部 Agent 推送） */
  isHuman: boolean
}

interface AgentState {
  agents: Record<string, AgentListItem>
  /** 人类玩家（key = sessionId），仅 id/name 用于调试显示 */
  humans: Record<string, { id: string; name: string }>
}

const initialState: AgentState = {
  agents: {},
  humans: {},
}

export const agentSlice = createSlice({
  name: 'agentDebug',
  initialState,
  reducers: {
    /** Agent 加入或全量更新 */
    upsertAgent: (state, action: PayloadAction<AgentListItem>) => {
      state.agents[action.payload.id] = action.payload
    },
    /** Agent 字段 patch（仅更新指定字段） */
    patchAgent: (
      state,
      action: PayloadAction<{ id: string; patch: Partial<AgentListItem> }>
    ) => {
      const cur = state.agents[action.payload.id]
      if (cur) {
        state.agents[action.payload.id] = { ...cur, ...action.payload.patch }
      }
    },
    /** Agent 离开 */
    removeAgent: (state, action: PayloadAction<string>) => {
      delete state.agents[action.payload]
    },
    /** 清空所有 agent */
    clearAgents: (state) => {
      state.agents = {}
    },
    /** 人类玩家加入/更新 */
    upsertHuman: (state, action: PayloadAction<{ id: string; name: string }>) => {
      state.humans[action.payload.id] = action.payload
    },
    /** 人类玩家离开 */
    removeHuman: (state, action: PayloadAction<string>) => {
      delete state.humans[action.payload]
    },
    /** 清空人类玩家 */
    clearHumans: (state) => {
      state.humans = {}
    },
  },
})

export const {
  upsertAgent,
  patchAgent,
  removeAgent,
  clearAgents,
  upsertHuman,
  removeHuman,
  clearHumans,
} = agentSlice.actions

export default agentSlice.reducer
