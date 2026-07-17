import { matchMaker, Room } from 'colyseus'
import { Agent, ChatMessage, OfficeState } from '../rooms/schema/OfficeState'
import { roomRegistry } from '../rooms/RoomRegistry'
import { Message, AGENT_TALK_DEFAULT_MS } from '../types/Messages'
import {
  AgentActivity,
  DEFAULT_AGENT_ANIM,
  DEFAULT_AGENT_TEXTURE,
  DEFAULT_AGENT_X,
  DEFAULT_AGENT_Y,
} from '../types/IAgent'
import { AgentBroadcastType } from '../types/Messages'
import { loadZoneChairs } from '../api/mapRoutes'

/**
 * Bridge：把 Agent 广播 WS 的消息桥接到对应 Colyseus 房间的 state。
 *
 * 核心原则：
 *   - agentId 是外部自定义的 ID，独立于 Colyseus sessionId
 *   - state.agents MapSchema 的 key 就是 agentId
 *   - 不存在则 spawn（创建 Agent schema 实例），存在则 patch
 *
 * 通过 matchMaker.getRoomById(colyseusRoomId) 拿到 room 实例，
 * 直接操作 room.state.agents，Colyseus 会自动 diff + 增量推送给 viewer。
 */
class BridgeImpl {
  /**
   * 每个业务 roomId 对应的椅子占用表。
   * key: agentId → value: chairKey（如 'working:3'）
   * 用于保证一个区域内的椅子不被多个 agent 同时占用。
   */
  private chairLocks = new Map<string, Map<string, string>>()

  /**
   * 根据业务 roomId 找到 Colyseus room 实例。
   */
  private getRoom(roomId: string): Room<OfficeState> | undefined {
    const entry = roomRegistry.get(roomId)
    if (!entry) return undefined
    const room = matchMaker.getRoomById(entry.colyseusRoomId) as Room<OfficeState> | undefined
    return room
  }

  /** 获取（或创建）某房间的椅子占用表 */
  private getLocks(roomId: string): Map<string, string> {
    let m = this.chairLocks.get(roomId)
    if (!m) {
      m = new Map()
      this.chairLocks.set(roomId, m)
    }
    return m
  }

  /** 收集某房间当前已被占用的椅子 key 集合 */
  private occupiedChairKeys(roomId: string): Set<string> {
    const m = this.chairLocks.get(roomId)
    if (!m) return new Set()
    return new Set(m.values())
  }

  /** 释放某 agent 当前占用的椅子 */
  private releaseChair(roomId: string, agentId: string): void {
    const m = this.chairLocks.get(roomId)
    if (!m) return
    m.delete(agentId)
  }

  /** 房间销毁时清理占用表 */
  clearRoom(roomId: string): void {
    this.chairLocks.delete(roomId)
  }

  /**
   * 校验 roomId 是否已注册（用于 WS 连接时鉴权前的存在性检查）。
   */
  hasRoom(roomId: string): boolean {
    return roomRegistry.get(roomId) !== undefined
  }

  /**
   * Spawn 或更新 agent。
   */
  spawnAgent(
    roomId: string,
    agentId: string,
    patch: {
      name?: string
      texture?: string
      x?: number
      y?: number
      anim?: string
      action?: string
    }
  ): boolean {
    const room = this.getRoom(roomId)
    if (!room) return false

    let agent = room.state.agents.get(agentId)
    if (!agent) {
      agent = new Agent()
      agent.id = agentId
      agent.name = patch.name || `Agent-${agentId.slice(0, 6)}`
      agent.texture = patch.texture || DEFAULT_AGENT_TEXTURE
      agent.x = patch.x ?? DEFAULT_AGENT_X
      agent.y = patch.y ?? DEFAULT_AGENT_Y
      agent.anim = patch.anim || DEFAULT_AGENT_ANIM
      agent.action = patch.action || 'idle'
      room.state.agents.set(agentId, agent)
      this.appendEvent(room, agent.name, 'spawned')
    } else {
      // 已存在则更新基础信息（位置 / 动画由 update 处理，这里只更新 spawn 级字段）
      if (patch.name !== undefined) agent.name = patch.name
      if (patch.texture !== undefined) agent.texture = patch.texture
      if (patch.action !== undefined) agent.action = patch.action
      if (patch.x !== undefined) agent.x = patch.x
      if (patch.y !== undefined) agent.y = patch.y
      if (patch.anim !== undefined) agent.anim = patch.anim
    }
    return true
  }

  /**
   * 仅更新位置和动画（最频繁的消息，避免重复字段写入）。
   */
  updateAgent(
    roomId: string,
    agentId: string,
    patch: { x?: number; y?: number; anim?: string }
  ): boolean {
    const room = this.getRoom(roomId)
    if (!room) return false

    const agent = room.state.agents.get(agentId)
    if (!agent) return false

    if (patch.x !== undefined) agent.x = patch.x
    if (patch.y !== undefined) agent.y = patch.y
    if (patch.anim !== undefined) agent.anim = patch.anim
    return true
  }

  /**
   * Agent 说话：设置气泡内容 + 过期时间。
   * 同时通过 Colyseus broadcast 让前端立即弹出（不必等 state diff）。
   */
  agentTalk(
    roomId: string,
    agentId: string,
    text: string,
    durationMs: number = AGENT_TALK_DEFAULT_MS
  ): boolean {
    const room = this.getRoom(roomId)
    if (!room) return false

    const agent = room.state.agents.get(agentId)
    if (!agent) return false

    agent.text = text
    agent.textUntil = Date.now() + durationMs

    // 立即广播给所有客户端，前端可马上显示气泡
    room.broadcast(Message.AGENT_TALK, {
      agentId,
      text,
      durationMs,
    })

    this.appendEvent(room, agent.name, `said: ${text}`)

    // durationMs 后清空 text 字段，state diff 会自动同步
    setTimeout(() => {
      const r = this.getRoom(roomId)
      const a = r?.state.agents.get(agentId)
      if (a && a.text === text) {
        a.text = ''
        a.textUntil = 0
      }
    }, durationMs)

    return true
  }

  /**
   * 切换 agent 动作（sit / work / wave ...）。
   * 如果传了 x/y/anim，一并更新。
   */
  agentAction(
    roomId: string,
    agentId: string,
    action: string,
    extra?: { x?: number; y?: number; anim?: string }
  ): boolean {
    const room = this.getRoom(roomId)
    if (!room) return false

    const agent = room.state.agents.get(agentId)
    if (!agent) return false

    agent.action = action
    if (extra?.x !== undefined) agent.x = extra.x
    if (extra?.y !== undefined) agent.y = extra.y
    if (extra?.anim !== undefined) agent.anim = extra.anim

    this.appendEvent(room, agent.name, `action: ${action}`)
    return true
  }

  /**
   * 切换 agent 的活动状态（working / meeting / relaxing / idle）。
   *
   * - working/meeting/relaxing：从 map.json 中标记了该 zone 的椅子里挑一把空的，
   *   写入 targetX/targetY/targetDir/chairKey + x/y/anim，前端 tween 走过去坐下
   * - idle：释放当前椅子，agent 原地站立（anim 切回 idle_down）
   *
   * 完全以 map.json 中的手动标记为准：未标记的椅子不会被分配。
   * 如果某 zone 没有标记椅子，agent 保持 idle 并记录事件。
   */
  async agentActivity(roomId: string, agentId: string, activity: AgentActivity): Promise<boolean> {
    const room = this.getRoom(roomId)
    if (!room) return false

    const agent = room.state.agents.get(agentId)
    if (!agent) return false

    // 先释放当前占用的椅子（不管切到什么状态，旧椅子都要释放）
    this.releaseChair(roomId, agentId)

    if (activity === 'idle') {
      agent.activity = 'idle'
      agent.chairKey = ''
      agent.targetX = 0
      agent.targetY = 0
      agent.targetDir = ''
      agent.anim = `${agent.texture}_idle_down`
      this.appendEvent(room, agent.name, 'switched to idle')
      return true
    }

    // 从 map.json 读取该 zone 的标记椅子
    const zoneChairs = await loadZoneChairs()
    const pool = zoneChairs[activity]
    if (!pool || pool.length === 0) {
      // 该 zone 没有标记椅子 —— agent 保持 idle
      agent.activity = 'idle'
      this.appendEvent(room, agent.name, `no chair marked for ${activity}`)
      return false
    }

    // 排除已被占用的椅子
    const occupied = this.occupiedChairKeys(roomId)
    const available = pool.filter((c) => !occupied.has(c.key))
    const candidates = available.length > 0 ? available : pool
    const pick = candidates[Math.floor(Math.random() * candidates.length)]

    // 占用新椅子
    this.getLocks(roomId).set(agentId, pick.key)

    agent.activity = activity
    agent.chairKey = pick.key
    agent.targetX = pick.x
    agent.targetY = pick.y
    agent.targetDir = pick.dir
    // 同步更新 x/y/anim 到目标椅子，保证 state 一致
    agent.x = pick.x
    agent.y = pick.y
    agent.anim = `${agent.texture}_sit_${pick.dir}`

    this.appendEvent(room, agent.name, `switched to ${activity}`)
    return true
  }

  /**
   * 移除 agent。
   */
  despawnAgent(roomId: string, agentId: string): boolean {
    const room = this.getRoom(roomId)
    if (!room) return false

    const agent = room.state.agents.get(agentId)
    if (!agent) return false

    // 释放占用的椅子
    this.releaseChair(roomId, agentId)

    const name = agent.name
    room.state.agents.delete(agentId)
    this.appendEvent(room, name, 'left')
    return true
  }

  /**
   * 列出房间内所有 agent（HTTP API 用）。
   */
  listAgents(roomId: string): Array<{
    id: string
    name: string
    texture: string
    x: number
    y: number
    anim: string
    action: string
    activity: string
    targetX: number
    targetY: number
    targetDir: string
  }> {
    const room = this.getRoom(roomId)
    if (!room) return []
    const result: any[] = []
    room.state.agents.forEach((agent, id) => {
      result.push({
        id,
        name: agent.name,
        texture: agent.texture,
        x: agent.x,
        y: agent.y,
        anim: agent.anim,
        action: agent.action,
        activity: agent.activity,
        targetX: agent.targetX,
        targetY: agent.targetY,
        targetDir: agent.targetDir,
      })
    })
    return result
  }

  /**
   * 追加事件到 chatMessages（用于 UI AgentFeed 面板）。
   * 限制最多 100 条，超过则删除最早的。
   */
  private appendEvent(room: Room<OfficeState>, author: string, content: string): void {
    const messages = room.state.chatMessages
    if (messages.length >= 100) messages.shift()
    // ChatMessage schema 复用为通用事件项
    const msg = new ChatMessage()
    msg.author = author
    msg.content = content
    msg.createdAt = new Date().getTime()
    messages.push(msg)

    // 通过 AGENT_EVENT 消息广播事件（前端可独立订阅用于实时 feed）
    room.broadcast(Message.AGENT_EVENT, { author, content, createdAt: msg.createdAt })
  }

  /**
   * 解析并路由一条广播消息。
   * 返回 { ok, error? }。
   */
  dispatch(
    roomId: string,
    payload: any
  ): { ok: boolean; error?: string } {
    if (!payload || typeof payload !== 'object') {
      return { ok: false, error: 'invalid payload' }
    }
    const type = payload.type
    const agentId = payload.agentId

    if (typeof agentId !== 'string' || !agentId) {
      return { ok: false, error: 'agentId required' }
    }

    switch (type) {
      case AgentBroadcastType.AGENT_SPAWN:
        this.spawnAgent(roomId, agentId, {
          name: payload.name,
          texture: payload.texture,
          x: payload.x,
          y: payload.y,
          anim: payload.anim,
          action: payload.action,
        })
        return { ok: true }

      case AgentBroadcastType.AGENT_UPDATE:
        // 如果 agent 不存在，自动 spawn（避免顺序耦合）
        const room = this.getRoom(roomId)
        if (room && !room.state.agents.has(agentId)) {
          this.spawnAgent(roomId, agentId, {
            name: payload.name,
            texture: payload.texture,
            x: payload.x,
            y: payload.y,
            anim: payload.anim,
          })
        } else {
          this.updateAgent(roomId, agentId, {
            x: payload.x,
            y: payload.y,
            anim: payload.anim,
          })
        }
        return { ok: true }

      case AgentBroadcastType.AGENT_TALK:
        this.agentTalk(roomId, agentId, String(payload.text ?? ''), payload.durationMs)
        return { ok: true }

      case AgentBroadcastType.AGENT_ACTION:
        this.agentAction(roomId, agentId, String(payload.action || 'idle'), {
          x: payload.x,
          y: payload.y,
          anim: payload.anim,
        })
        return { ok: true }

      case AgentBroadcastType.AGENT_SIT:
        this.agentAction(
          roomId,
          agentId,
          'sit',
          {
            x: payload.x,
            y: payload.y,
            anim: payload.anim || `${DEFAULT_AGENT_TEXTURE}_sit_down`,
          }
        )
        return { ok: true }

      case AgentBroadcastType.AGENT_ACTIVITY: {
        const activity = String(payload.activity || 'idle') as AgentActivity
        const valid: AgentActivity[] = ['idle', 'working', 'meeting', 'relaxing']
        if (!valid.includes(activity)) {
          return { ok: false, error: `invalid activity: ${activity}` }
        }
        // agentActivity 是异步的（需要读 map.json），但不阻塞 ack
        this.agentActivity(roomId, agentId, activity).catch((e) =>
          console.error('[bridge] agentActivity failed:', e)
        )
        return { ok: true }
      }

      case AgentBroadcastType.AGENT_DESPAWN:
        this.despawnAgent(roomId, agentId)
        return { ok: true }

      default:
        return { ok: false, error: `unknown type: ${type}` }
    }
  }
}

export const bridge = new BridgeImpl()
