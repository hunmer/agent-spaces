/**
 * Colyseus 客户端 ↔ 房间之间的消息枚举（主要服务人类玩家）。
 * 注意：移除了原 VIDEO_CONNECTED / DISCONNECT_STREAM / CONNECT_TO_COMPUTER /
 * STOP_SCREEN_SHARE 等 WebRTC / 屏幕共享相关消息，以及白板相关消息。
 */
export enum Message {
  /** 人类玩家移动 / 切换动画 */
  UPDATE_PLAYER,
  /** 人类玩家更新名字 */
  UPDATE_PLAYER_NAME,
  /** 人类玩家聊天消息（保留通道，UI 已移除主聊天框，但可程序化触发） */
  ADD_CHAT_MESSAGE,
  /** 房间信息推送给客户端 */
  SEND_ROOM_DATA,
  /** Agent 说话气泡广播（服务端推送给所有客户端） */
  AGENT_TALK,
  /** Agent 事件流日志（用于 UI 的 AgentFeed 面板） */
  AGENT_EVENT,
  /**
   * 调试委托：viewer 通过 room.send 请求切换某 agent 的 activity。
   * 服务端 SkyOffice 收到后转发给 Bridge.agentActivity。
   * 用于调试面板，无需 Agent token。
   */
  DELEGATE_AGENT_ACTIVITY,
  /**
   * 调试委托：viewer 通过 room.send 请求让某 agent 说话。
   * 服务端 SkyOffice 收到后转发给 Bridge.agentTalk。
   * 用于调试面板的"发送测试消息"功能。
   */
  DELEGATE_AGENT_TALK,
}

/**
 * 广播 WS 上 Agent → 服务端的消息类型字符串。
 * 用字符串而非枚举，因为原生 ws 走 JSON 协议更直观。
 */
export const AgentBroadcastType = {
  /** 创建/重置一个 agent；不存在则 spawn，存在则更新基础信息 */
  AGENT_SPAWN: 'agent.spawn',
  /** 更新 agent 位置和动画（最频繁的消息） */
  AGENT_UPDATE: 'agent.update',
  /** 让 agent 说话（弹出气泡） */
  AGENT_TALK: 'agent.talk',
  /** 切换 agent 动作（sit / work / wave ...） */
  AGENT_ACTION: 'agent.action',
  /** 让 agent 移动到指定椅子并坐下（前端解读为 sit 动画） */
  AGENT_SIT: 'agent.sit',
  /**
   * 切换活动状态（推荐用法）：working | meeting | relaxing | idle
   * 服务端会自动分配该区域的空椅子，前端 tween 走过去坐下。
   * 切到 idle 时释放当前椅子，agent 原地站立。
   */
  AGENT_ACTIVITY: 'agent.activity',
  /** 移除 agent */
  AGENT_DESPAWN: 'agent.despawn',
} as const

export type AgentBroadcastTypeValue = typeof AgentBroadcastType[keyof typeof AgentBroadcastType]

/** 说话气泡默认显示时长（ms） */
export const AGENT_TALK_DEFAULT_MS = 6000
