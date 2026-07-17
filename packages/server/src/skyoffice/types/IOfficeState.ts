import { Schema, ArraySchema, MapSchema } from '@colyseus/schema'
import { IAgent } from './IAgent.js'

export interface IPlayer extends Schema {
  name: string
  x: number
  y: number
  anim: string
}

export interface IChatMessage extends Schema {
  author: string
  createdAt: number
  content: string
}

export interface IOfficeState extends Schema {
  /** 人类玩家（浏览器键盘控制），key 是 Colyseus sessionId */
  players: MapSchema<IPlayer>
  /** 外部 Agent（广播 WS 推送），key 是外部 agentId */
  agents: MapSchema<IAgent>
  /** 历史事件流（用于 UI 的 AgentFeed 面板，限制最多 100 条） */
  chatMessages: ArraySchema<IChatMessage>
}
