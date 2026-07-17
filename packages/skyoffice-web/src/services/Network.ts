import { Client, Room } from 'colyseus.js'
import { IAgent, AgentActivity } from '../../../types/IAgent'
import { IOfficeState, IPlayer } from '../../../types/IOfficeState'
import { Message } from '../../../types/Messages'
import { IRoomData, RoomType } from '../../../types/Rooms'
import { ItemType } from '../../../types/Items'
import { phaserEvents, Event } from '../events/EventCenter'
import store from '../stores'
import { setSessionId, setPlayerNameMap, removePlayerNameMap } from '../stores/UserStore'
import {
  setLobbyJoined,
  setJoinedRoomData,
} from '../stores/RoomStore'
import {
  pushChatMessage,
  pushPlayerJoinedMessage,
  pushPlayerLeftMessage,
  pushAgentEvent,
} from '../stores/ChatStore'
import {
  upsertAgent,
  patchAgent,
  removeAgent,
  clearAgents,
  upsertHuman,
  removeHuman,
  clearHumans,
} from '../stores/AgentStore'

/**
 * Network —— 前端 viewer 与 Colyseus 服务端的连接封装。
 *
 * 已移除（相对原版）：
 *   - WebRTC（视频/语音）
 *   - Computer / 屏幕共享相关
 *   - LobbyRoom（自定义房间走 HTTP API + 直接 joinById）
 *
 * 新增：
 *   - state.agents 监听（外部 Agent 推送的角色，渲染为 AgentSprite）
 *   - AGENT_TALK / AGENT_EVENT 消息处理（说话气泡、事件流）
 */
export default class Network {
  private client: Client
  /** Colyseus 房间实例（Game 场景需要读 state 做兜底补 spawn） */
  room?: Room<IOfficeState>

  mySessionId!: string

  constructor() {
    const protocol = window.location.protocol.replace('http', 'ws')
    const endpoint =
      process.env.NODE_ENV === 'production'
        ? import.meta.env.VITE_SERVER_URL
        : `${protocol}//${window.location.hostname}:2567`
    this.client = new Client(endpoint)

    phaserEvents.on(Event.MY_PLAYER_NAME_CHANGE, this.updatePlayerName, this)
    phaserEvents.on(Event.MY_PLAYER_TEXTURE_CHANGE, this.updatePlayer, this)
  }

  /**
   * 人类玩家加入公共大厅。
   */
  async joinOrCreatePublic() {
    this.room = await this.client.joinOrCreate(RoomType.PUBLIC)
    this.initialize()
    store.dispatch(setLobbyJoined(true))
  }

  /**
   * 人类玩家按业务 roomId 加入自定义房间（房间由 HTTP API 创建）。
   *
   * 流程：
   *   1. 调用公开端点 GET /api/rooms/:roomId/join 解析出 Colyseus 内部 roomId
   *   2. 用 client.joinById(colyseusRoomId) 加入
   *
   * 注意：viewer 不需要 token（token 是给 Agent 用的）。
   */
  async joinCustomById(roomId: string) {
    // 先解析业务 roomId → Colyseus 内部 roomId
    const protocol = window.location.protocol
    const host =
      process.env.NODE_ENV === 'production'
        ? import.meta.env.VITE_SERVER_URL?.replace(/^https?/, '') ||
          window.location.host
        : `${window.location.hostname}:2567`
    const res = await fetch(`${protocol}//${host}/api/rooms/${roomId}/join`)
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw new Error(`room "${roomId}" not found${text ? `: ${text}` : ''}`)
    }
    const data = (await res.json()) as {
      colyseusRoomId: string
      name: string
      description: string
    }
    this.room = await this.client.joinById(data.colyseusRoomId)
    this.initialize()
    store.dispatch(setLobbyJoined(true))
  }

  /**
   * 兼容旧调用：直接创建一个临时房间（仅本地调试用）。
   */
  async createCustom(roomData: Partial<IRoomData>) {
    this.room = await this.client.create(RoomType.CUSTOM, {
      name: roomData.name || 'Custom',
      description: roomData.description || '',
      roomToken: '__viewer_temp__',
      autoDispose: roomData.autoDispose ?? true,
    } as any)
    this.initialize()
    store.dispatch(setLobbyJoined(true))
  }

  // 初始化所有网络监听
  initialize() {
    if (!this.room) return

    this.mySessionId = this.room.sessionId
    store.dispatch(setSessionId(this.room.sessionId))

    // 进入房间时先清空调试快照（避免上个房间残留）
    store.dispatch(clearAgents())
    store.dispatch(clearHumans())

    // —— 人类玩家（players MapSchema）——
    this.room.state.players.onAdd = (player: IPlayer, key: string) => {
      // 同步到调试面板（含自己）
      store.dispatch(upsertHuman({ id: key, name: player.name || '(unnamed)' }))

      if (key === this.mySessionId) return

      player.onChange = (changes) => {
        changes.forEach((change) => {
          const { field, value } = change
          phaserEvents.emit(Event.PLAYER_UPDATED, field, value, key)

          if (field === 'name' && value !== '') {
            phaserEvents.emit(Event.PLAYER_JOINED, player, key)
            store.dispatch(setPlayerNameMap({ id: key, name: value }))
            store.dispatch(pushPlayerJoinedMessage(value))
            store.dispatch(upsertHuman({ id: key, name: value }))
          }
        })
      }
    }

    this.room.state.players.onRemove = (player: IPlayer, key: string) => {
      phaserEvents.emit(Event.PLAYER_LEFT, key)
      store.dispatch(pushPlayerLeftMessage(player.name))
      store.dispatch(removePlayerNameMap(key))
      store.dispatch(removeHuman(key))
    }

    // —— 外部 Agent（agents MapSchema）——
    this.room.state.agents.onAdd = (agent: IAgent, key: string) => {
      phaserEvents.emit(Event.AGENT_JOINED, agent, key)
      store.dispatch(
        pushAgentEvent({ author: agent.name, content: 'joined the team' })
      )
      // 同步到调试面板
      store.dispatch(
        upsertAgent({
          id: agent.id,
          name: agent.name,
          texture: agent.texture,
          x: agent.x,
          y: agent.y,
          anim: agent.anim,
          activity: agent.activity,
          isHuman: false,
        })
      )

      // 监听 agent 字段变化（位置 / 动画 / 动作）
      agent.onChange = (changes) => {
        phaserEvents.emit(Event.AGENT_UPDATED, changes, key)

        // 把变更 patch 到调试快照
        const patch: any = {}
        changes.forEach((change) => {
          const { field, value } = change
          patch[field] = value

          // 当 text 字段从空变为非空，触发对话气泡
          if (field === 'text' && value) {
            phaserEvents.emit(Event.AGENT_TALK, key, value)
          }
          // activity 变化：传整个 agent（包含 targetX/Y/Dir），由 Game 触发走路
          if (field === 'activity') {
            phaserEvents.emit(Event.AGENT_ACTIVITY, key, agent)
          }
        })
        if (Object.keys(patch).length > 0) {
          store.dispatch(patchAgent({ id: key, patch }))
        }
      }
    }

    this.room.state.agents.onRemove = (agent: IAgent, key: string) => {
      phaserEvents.emit(Event.AGENT_LEFT, key)
      store.dispatch(pushAgentEvent({ author: agent.name, content: 'left' }))
      store.dispatch(removeAgent(key))
    }

    // —— 事件流（chatMessages，用于 AgentFeed）——
    this.room.state.chatMessages.onAdd = (item) => {
      store.dispatch(pushChatMessage(item))
    }

    // —— 服务端消息 ——
    this.room.onMessage(Message.SEND_ROOM_DATA, (content) => {
      store.dispatch(setJoinedRoomData(content))
    })

    // Agent 立即说话气泡（来自 Bridge 的 broadcast，比 state diff 更快）
    this.room.onMessage(Message.AGENT_TALK, (payload: { agentId: string; text: string }) => {
      phaserEvents.emit(Event.AGENT_TALK, payload.agentId, payload.text)
    })

    // Agent 事件流（spawn / action / left 等日志）
    this.room.onMessage(
      Message.AGENT_EVENT,
      (payload: { author: string; content: string; createdAt: number }) => {
        store.dispatch(pushAgentEvent(payload))
      }
    )

    // 人类玩家程序化触发的聊天（保留通道）
    this.room.onMessage(
      Message.ADD_CHAT_MESSAGE,
      (payload: { clientId: string; content: string }) => {
        phaserEvents.emit(Event.UPDATE_DIALOG_BUBBLE, payload.clientId, payload.content)
      }
    )
  }

  // —— 事件订阅便捷方法（供 Game 场景注册回调）——
  onPlayerJoined(callback: (player: IPlayer, key: string) => void, context?: any) {
    phaserEvents.on(Event.PLAYER_JOINED, callback, context)
  }

  onPlayerLeft(callback: (key: string) => void, context?: any) {
    phaserEvents.on(Event.PLAYER_LEFT, callback, context)
  }

  onPlayerUpdated(
    callback: (field: string, value: number | string, key: string) => void,
    context?: any
  ) {
    phaserEvents.on(Event.PLAYER_UPDATED, callback, context)
  }

  onItemUserAdded(
    callback: (playerId: string, key: string, itemType: ItemType) => void,
    context?: any
  ) {
    phaserEvents.on(Event.ITEM_USER_ADDED, callback, context)
  }

  onItemUserRemoved(
    callback: (playerId: string, key: string, itemType: ItemType) => void,
    context?: any
  ) {
    phaserEvents.on(Event.ITEM_USER_REMOVED, callback, context)
  }

  onChatMessageAdded(callback: (playerId: string, content: string) => void, context?: any) {
    phaserEvents.on(Event.UPDATE_DIALOG_BUBBLE, callback, context)
  }

  // Agent 相关订阅
  onAgentJoined(callback: (agent: IAgent, key: string) => void, context?: any) {
    phaserEvents.on(Event.AGENT_JOINED, callback, context)
  }

  onAgentLeft(callback: (key: string) => void, context?: any) {
    phaserEvents.on(Event.AGENT_LEFT, callback, context)
  }

  onAgentUpdated(
    callback: (changes: Array<{ field: string; value: any }>, key: string) => void,
    context?: any
  ) {
    phaserEvents.on(Event.AGENT_UPDATED, callback, context)
  }

  onAgentTalk(callback: (agentId: string, text: string) => void, context?: any) {
    phaserEvents.on(Event.AGENT_TALK, callback, context)
  }

  onAgentActivity(callback: (agentId: string, agent: IAgent) => void, context?: any) {
    phaserEvents.on(Event.AGENT_ACTIVITY, callback, context)
  }

  // —— 发送消息到服务端（人类玩家操作）——
  updatePlayer(currentX: number, currentY: number, currentAnim: string) {
    this.room?.send(Message.UPDATE_PLAYER, { x: currentX, y: currentY, anim: currentAnim })
  }

  updatePlayerName(currentName: string) {
    this.room?.send(Message.UPDATE_PLAYER_NAME, { name: currentName })
  }

  addChatMessage(content: string) {
    this.room?.send(Message.ADD_CHAT_MESSAGE, { content })
  }

  /**
   * 调试用：通过 Colyseus room.send 请求切换某 agent 的 activity。
   * 服务端 SkyOffice 收到 DELEGATE_AGENT_ACTIVITY 后转发给 Bridge。
   * 无需 Agent token，任何 viewer 都可调用（适合调试面板）。
   */
  delegateAgentActivity(agentId: string, activity: AgentActivity) {
    this.room?.send(Message.DELEGATE_AGENT_ACTIVITY, { agentId, activity })
  }

  /**
   * 调试用：通过 Colyseus room.send 让某 agent 说话（弹出气泡）。
   * 服务端 SkyOffice 收到 DELEGATE_AGENT_TALK 后转发给 Bridge.agentTalk。
   * 用于调试面板的"发送测试消息"按钮。
   */
  delegateAgentTalk(agentId: string, text: string, durationMs?: number) {
    this.room?.send(Message.DELEGATE_AGENT_TALK, { agentId, text, durationMs })
  }

  /**
   * 从服务端拉取所有椅子的 zone 标记（GET /api/map/chairs）。
   * 返回 [{ index, zone }] 列表，供 Game 场景初始化椅子颜色提示。
   */
  async loadChairZones(): Promise<Array<{ index: number; zone: string }>> {
    const protocol = window.location.protocol
    const host =
      process.env.NODE_ENV === 'production'
        ? import.meta.env.VITE_SERVER_URL?.replace(/^https?/, '') ||
          window.location.host
        : `${window.location.hostname}:2567`
    const res = await fetch(`${protocol}//${host}/api/map/chairs`)
    if (!res.ok) throw new Error(`loadChairZones failed: ${res.status}`)
    const data = (await res.json()) as { chairs: Array<{ index: number; zone: string }> }
    return data.chairs.filter((c) => c.zone).map((c) => ({ index: c.index, zone: c.zone }))
  }

  /**
   * 设置某把椅子的 zone 标记，写回 map.json（POST /api/map/chairs/:index/zone）。
   */
  async setChairZone(chairIndex: number, zone: string): Promise<boolean> {
    const protocol = window.location.protocol
    const host =
      process.env.NODE_ENV === 'production'
        ? import.meta.env.VITE_SERVER_URL?.replace(/^https?/, '') ||
          window.location.host
        : `${window.location.hostname}:2567`
    const res = await fetch(
      `${protocol}//${host}/api/map/chairs/${chairIndex}/zone`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zone }),
      }
    )
    return res.ok
  }
}
