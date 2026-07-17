import { Schema } from '@colyseus/schema'

/**
 * Agent 的活动状态。
 * - idle: 默认（站着/原地）
 * - working: 在工位坐着
 * - meeting: 在会议室坐着
 * - relaxing: 在酒馆/休闲区坐着
 *
 * 切换到 working/meeting/relaxing 时，前端会自动 tween 走到该区域某把空椅子并坐下。
 */
export type AgentActivity = 'idle' | 'working' | 'meeting' | 'relaxing'

/**
 * Agent 数据结构 —— 由外部 Agent 通过广播 WS 推送更新。
 * 与人类玩家的 IPlayer 区分：
 *   - IPlayer 由键盘控制的浏览器玩家持有，key 是 Colyseus sessionId
 *   - IAgent  由外部 Agent 通过广播 WS 推送，key 是外部自定义的 agentId
 *
 * 一个 Agent WS 连接可以更新多个 agentId（团队协作场景）。
 */
export interface IAgent extends Schema {
  /** 外部 agentId，独立于 Colyseus sessionId，由 Agent 端自定义 */
  id: string
  /** 角色显示名 */
  name: string
  /** 角色贴图：adam | ash | lucy | nancy（也可扩展自定义） */
  texture: string
  /** x 坐标 */
  x: number
  /** y 坐标 */
  y: number
  /** Phaser 动画 key，如 adam_run_right / adam_idle_down / adam_sit_up */
  anim: string
  /** 说话气泡内容（空字符串表示无气泡） */
  text: string
  /** 气泡过期时间戳（ms），0 表示立即清除 */
  textUntil: number
  /** 自定义动作标签（旧字段，保留兼容）：idle | sit | work | wave ... */
  action: string
  /** 活动状态（推荐使用）：idle | working | meeting | relaxing */
  activity: AgentActivity
  /** 服务端分配的目标椅子 x（activity != idle 时有效，前端 tween 走过去） */
  targetX: number
  /** 服务端分配的目标椅子 y */
  targetY: number
  /** 服务端分配的目标椅子朝向：up | down | left | right */
  targetDir: string
  /** 服务端分配的椅子 key（用于释放占用锁），空字符串表示无目标 */
  chairKey: string
}

/** 默认 agent 贴图（与现有 Player 一致） */
export const DEFAULT_AGENT_TEXTURE = 'adam'

/** Agent 默认动画 */
export const DEFAULT_AGENT_ANIM = 'adam_idle_down'

/** Agent 默认出生坐标（与 Player 默认值一致） */
export const DEFAULT_AGENT_X = 705
export const DEFAULT_AGENT_Y = 500

/** 默认活动状态 */
export const DEFAULT_AGENT_ACTIVITY: AgentActivity = 'idle'
