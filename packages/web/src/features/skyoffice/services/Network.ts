import { Client, Room } from 'colyseus.js'
import {
  Message,
  RoomType,
  ItemType,
  type IAgent,
  type AgentActivity,
  type IOfficeState,
  type IPlayer,
  type IChatMessage,
  type IRoomData,
} from '@agent-spaces/shared/skyoffice'
import { phaserEvents, Event } from '../events/EventCenter'
import { useUserStore } from '../stores/user-store'
import { useChatStore, MessageType } from '../stores/chat-store'
import { useRoomStore } from '../stores/room-store'
import { useAgentDebugStore } from '../stores/agent-debug-store'

/**
 * Colyseus 连接封装。
 *
 * 后端地址：复用主 web 的 NEXT_PUBLIC_SERVER_URL 约定（默认 http://localhost:3100）。
 * dev/prod 均走同一主后端（skyoffice 已合并进单进程）。
 * SSR 安全：Network 只在 client useEffect 内 new，构造里访问 window 的部分仅在 client 执行。
 */

/** 主后端 HTTP host（无 scheme），用于 fetch /api/skyoffice/*。 */
function getHttpHost(): string {
  const url = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3100'
  return url.replace(/^https?:\/\//, '')
}

/** 主后端 WS endpoint（带 scheme），用于 colyseus.js Client。 */
function getWsEndpoint(): string {
  return process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3100'
}

const API_PREFIX = '/api/skyoffice'

export default class Network {
  private client: Client
  /** Colyseus 房间实例（Game 场景需要读 state 做兜底补 spawn） */
  room?: Room<IOfficeState>
  mySessionId!: string

  constructor() {
    this.client = new Client(getWsEndpoint())
    phaserEvents.on(Event.MY_PLAYER_NAME_CHANGE, this.updatePlayerName, this)
    phaserEvents.on(Event.MY_PLAYER_TEXTURE_CHANGE, this.updatePlayer, this)
  }

  /** 加入公共大厅。 */
  async joinOrCreatePublic(): Promise<void> {
    this.room = await this.client.joinOrCreate(RoomType.PUBLIC)
    this.initialize()
    useRoomStore.getState().setLobbyJoined(true)
  }

  /**
   * 按业务 roomId 加入自定义房间（房间由 HTTP API 创建）。
   * 流程：GET /api/skyoffice/rooms/:roomId/join 解析出 Colyseus 内部 roomId → client.joinById。
   * viewer 不需要 token（token 是给 Agent 用的）。
   */
  async joinCustomById(roomId: string): Promise<void> {
    const protocol = typeof window !== 'undefined' ? window.location.protocol : 'http:'
    const host = getHttpHost()
    const res = await fetch(`${protocol}//${host}${API_PREFIX}/rooms/${roomId}/join`)
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw new Error(`room "${roomId}" not found${text ? `: ${text}` : ''}`)
    }
    const data = (await res.json()) as { colyseusRoomId: string }
    this.room = await this.client.joinById(data.colyseusRoomId)
    this.initialize()
    useRoomStore.getState().setLobbyJoined(true)
  }

  /** 仅调试用：viewer 直接创建自定义房间。 */
  async createCustom(roomData: Partial<IRoomData>): Promise<void> {
    this.room = await this.client.create(RoomType.CUSTOM, {
      name: roomData.name,
      description: roomData.description,
      roomToken: '__viewer_temp__',
      autoDispose: roomData.autoDispose,
    } as any)
    this.initialize()
    useRoomStore.getState().setLobbyJoined(true)
  }

  /** 注册全部 Colyseus state/message 监听器（进入房间后调用一次）。 */
  private initialize(): void {
    if (!this.room) return
    this.mySessionId = this.room.sessionId
    useUserStore.getState().setSessionId(this.room.sessionId)

    // 清空调试快照
    useAgentDebugStore.getState().clearAgents()
    useAgentDebugStore.getState().clearHumans()

    // ---------- 人类玩家 state.players ----------
    this.room.state.players.onAdd((player: IPlayer, key: string) => {
      useAgentDebugStore.getState().upsertHuman({ id: key, name: player.name || '(unnamed)' })
      // 自己的玩家走 MyPlayer，不在此处理
      if (key === this.mySessionId) return
      player.onChange = (changes) => {
        changes.forEach(({ field, value }) => {
          phaserEvents.emit(Event.PLAYER_UPDATED, field, value, key)
          if (field === 'name' && value !== '') {
            const name = value as string
            phaserEvents.emit(Event.PLAYER_JOINED, player, key)
            useUserStore.getState().setPlayerNameMap({ id: key, name })
            useChatStore.getState().pushPlayerJoinedMessage(name)
            useAgentDebugStore.getState().upsertHuman({ id: key, name })
          }
        })
      }
    })

    this.room.state.players.onRemove((player: IPlayer, key: string) => {
      phaserEvents.emit(Event.PLAYER_LEFT, key)
      useChatStore.getState().pushPlayerLeftMessage(player.name)
      useUserStore.getState().removePlayerNameMap(key)
      useAgentDebugStore.getState().removeHuman(key)
    })

    // ---------- 外部 Agent state.agents ----------
    this.room.state.agents.onAdd((agent: IAgent, key: string) => {
      phaserEvents.emit(Event.AGENT_JOINED, agent, key)
      useChatStore.getState().pushAgentEvent({ author: agent.name, content: 'joined the team' })
      useAgentDebugStore.getState().upsertAgent({
        id: key,
        name: agent.name,
        texture: agent.texture,
        x: agent.x,
        y: agent.y,
        anim: agent.anim,
        activity: agent.activity,
        isHuman: false,
      })
      agent.onChange = (changes) => {
        phaserEvents.emit(Event.AGENT_UPDATED, changes, key)
        const patch: Record<string, unknown> = {}
        changes.forEach(({ field, value }) => {
          patch[field] = value
          if (field === 'text' && value) {
            phaserEvents.emit(Event.AGENT_TALK, key, value)
          }
          if (field === 'activity') {
            // 传整个 agent（含 targetX/Y/Dir），由 Game 触发走路
            phaserEvents.emit(Event.AGENT_ACTIVITY, key, agent)
          }
        })
        useAgentDebugStore.getState().patchAgent({ id: key, patch: patch as any })
      }
    })

    this.room.state.agents.onRemove((_agent: IAgent, key: string) => {
      phaserEvents.emit(Event.AGENT_LEFT, key)
      // 注意：onRemove 时 agent.name 可能已不可靠，用快照里的 name
      const name = useAgentDebugStore.getState().agents[key]?.name ?? key
      useChatStore.getState().pushAgentEvent({ author: name, content: 'left' })
      useAgentDebugStore.getState().removeAgent(key)
    })

    // ---------- 事件流 state.chatMessages ----------
    this.room.state.chatMessages.onAdd((item: IChatMessage) => {
      useChatStore.getState().pushChatMessage(item)
    })

    // ---------- 服务端推送消息 ----------
    this.room.onMessage(Message.SEND_ROOM_DATA, (content: { id: string; name: string; description: string }) => {
      useRoomStore.getState().setJoinedRoomData(content)
    })

    this.room.onMessage(Message.AGENT_TALK, (content: { agentId: string; text: string }) => {
      phaserEvents.emit(Event.AGENT_TALK, content.agentId, content.text)
    })

    this.room.onMessage(Message.AGENT_EVENT, (content: { author: string; content: string; createdAt: number }) => {
      useChatStore.getState().pushAgentEvent(content)
    })

    this.room.onMessage(Message.ADD_CHAT_MESSAGE, (content: { clientId: string; content: string }) => {
      phaserEvents.emit(Event.UPDATE_DIALOG_BUBBLE, content.clientId, content.content)
    })
  }

  // ---------- 订阅便捷方法（供 Game 场景注册回调） ----------
  onPlayerJoined(cb: (player: IPlayer, key: string) => void, context?: unknown) {
    phaserEvents.on(Event.PLAYER_JOINED, cb, context)
  }
  onPlayerLeft(cb: (key: string) => void, context?: unknown) {
    phaserEvents.on(Event.PLAYER_LEFT, cb, context)
  }
  onPlayerUpdated(cb: (field: string, value: number | string, key: string) => void, context?: unknown) {
    phaserEvents.on(Event.PLAYER_UPDATED, cb, context)
  }
  onItemUserAdded(cb: (playerId: string, key: string, itemType: ItemType) => void, context?: unknown) {
    phaserEvents.on(Event.ITEM_USER_ADDED, cb, context)
  }
  onItemUserRemoved(cb: (playerId: string, key: string, itemType: ItemType) => void, context?: unknown) {
    phaserEvents.on(Event.ITEM_USER_REMOVED, cb, context)
  }
  onChatMessageAdded(cb: (playerId: string, content: string) => void, context?: unknown) {
    phaserEvents.on(Event.UPDATE_DIALOG_BUBBLE, cb, context)
  }
  onAgentJoined(cb: (agent: IAgent, key: string) => void, context?: unknown) {
    phaserEvents.on(Event.AGENT_JOINED, cb, context)
  }
  onAgentLeft(cb: (key: string) => void, context?: unknown) {
    phaserEvents.on(Event.AGENT_LEFT, cb, context)
  }
  onAgentUpdated(cb: (changes: Array<{ field: string; value: unknown }>, key: string) => void, context?: unknown) {
    phaserEvents.on(Event.AGENT_UPDATED, cb, context)
  }
  onAgentTalk(cb: (agentId: string, text: string) => void, context?: unknown) {
    phaserEvents.on(Event.AGENT_TALK, cb, context)
  }
  onAgentActivity(cb: (agentId: string, agent: IAgent) => void, context?: unknown) {
    phaserEvents.on(Event.AGENT_ACTIVITY, cb, context)
  }

  // ---------- 发送方法（人类玩家操作） ----------
  updatePlayer(currentX: number, currentY: number, currentAnim: string) {
    this.room?.send(Message.UPDATE_PLAYER, { x: currentX, y: currentY, anim: currentAnim })
  }
  updatePlayerName(currentName: string) {
    this.room?.send(Message.UPDATE_PLAYER_NAME, { name: currentName })
  }
  addChatMessage(content: string) {
    this.room?.send(Message.ADD_CHAT_MESSAGE, { content })
  }
  /** 调试委托：viewer 请求切换某 agent 的 activity（无需 Agent token，服务端转发给 Bridge）。 */
  delegateAgentActivity(agentId: string, activity: AgentActivity) {
    this.room?.send(Message.DELEGATE_AGENT_ACTIVITY, { agentId, activity })
  }
  delegateAgentTalk(agentId: string, text: string, durationMs?: number) {
    this.room?.send(Message.DELEGATE_AGENT_TALK, { agentId, text, durationMs })
  }

  // ---------- HTTP 工具方法（椅子 zone 管理） ----------
  /** 拉取所有标记了 zone 的椅子。 */
  async loadChairZones(): Promise<Array<{ index: number; zone: string }>> {
    const protocol = typeof window !== 'undefined' ? window.location.protocol : 'http:'
    const host = getHttpHost()
    const res = await fetch(`${protocol}//${host}${API_PREFIX}/map/chairs`)
    if (!res.ok) throw new Error(`loadChairZones failed: ${res.status}`)
    const data = (await res.json()) as { chairs: Array<{ index: number; zone: string }> }
    return data.chairs.filter((c) => c.zone).map((c) => ({ index: c.index, zone: c.zone }))
  }

  /** 设置某把椅子的 zone 标记，写回 map.json。 */
  async setChairZone(chairIndex: number, zone: string): Promise<boolean> {
    const protocol = typeof window !== 'undefined' ? window.location.protocol : 'http:'
    const host = getHttpHost()
    const res = await fetch(`${protocol}//${host}${API_PREFIX}/map/chairs/${chairIndex}/zone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zone }),
    })
    return res.ok
  }
}

// 注意：playerNameMap 的 key 用 sessionId（与场景 keys 一致），不做 sanitize，
// 因为 Colyseus sessionId 是安全字符。
