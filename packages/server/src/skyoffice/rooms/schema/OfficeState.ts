import { Schema, ArraySchema, MapSchema, type } from '@colyseus/schema'
import type {
  IPlayer,
  IOfficeState,
  IChatMessage,
} from '../../types/IOfficeState.js'
import type { IAgent, AgentActivity } from '../../types/IAgent.js'
import {
  DEFAULT_AGENT_ACTIVITY,
  DEFAULT_AGENT_ANIM,
  DEFAULT_AGENT_TEXTURE,
  DEFAULT_AGENT_X,
  DEFAULT_AGENT_Y,
} from '../../types/IAgent.js'

/**
 * 人类玩家 schema（浏览器键盘控制），key 是 Colyseus sessionId。
 * 移除了原 readyToConnect / videoConnected（WebRTC 相关）。
 */
export class Player extends Schema implements IPlayer {
  @type('string') name = ''
  @type('number') x = 705
  @type('number') y = 500
  @type('string') anim = 'adam_idle_down'
}

/**
 * Agent schema（外部广播 WS 推送），key 是外部 agentId。
 */
export class Agent extends Schema implements IAgent {
  @type('string') id = ''
  @type('string') name = ''
  @type('string') texture = DEFAULT_AGENT_TEXTURE
  @type('number') x = DEFAULT_AGENT_X
  @type('number') y = DEFAULT_AGENT_Y
  @type('string') anim = DEFAULT_AGENT_ANIM
  @type('string') text = ''
  @type('number') textUntil = 0
  @type('string') action = 'idle'
  @type('string') activity: AgentActivity = DEFAULT_AGENT_ACTIVITY
  @type('number') targetX = 0
  @type('number') targetY = 0
  @type('string') targetDir = ''
  @type('string') chairKey = ''
}

/** 事件流消息 schema（用于 UI AgentFeed 面板，限制最多 100 条） */
export class ChatMessage extends Schema implements IChatMessage {
  @type('string') author = ''
  @type('number') createdAt = new Date().getTime()
  @type('string') content = ''
}

export class OfficeState extends Schema implements IOfficeState {
  @type({ map: Player })
  players = new MapSchema<Player>()

  @type({ map: Agent })
  agents = new MapSchema<Agent>()

  @type([ChatMessage])
  chatMessages = new ArraySchema<ChatMessage>()
}
