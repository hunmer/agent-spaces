import { Room, Client } from 'colyseus'
import { Dispatcher } from '@colyseus/command'
import { Player, OfficeState } from './schema/OfficeState'
import { Message } from '../types/Messages'
import { IRoomData } from '../types/Rooms'
import { bridge } from '../broadcast/Bridge'
import PlayerUpdateCommand from './commands/PlayerUpdateCommand'
import PlayerUpdateNameCommand from './commands/PlayerUpdateNameCommand'
import ChatMessageUpdateCommand from './commands/ChatMessageUpdateCommand'

/**
 * SkyOffice 房间 —— 同时承载人类玩家（浏览器键盘控制）和外部 Agent（广播 WS 推送）。
 *
 * - 人类玩家：通过 Colyseus client.joinById 进入，sessionId 作为 state.players 的 key
 * - 外部 Agent：由 Bridge 在 state.agents 上直接写入，没有 Colyseus client 连接
 *
 * 已移除（相对原版）：
 *   - bcrypt 密码鉴权（房间级 token 鉴权由 HTTP API 层处理）
 *   - WebRTC / 视频聊天 / 屏幕共享 / Computer 相关
 *   - LobbyRoom（自定义房间走 HTTP API）
 *   - Whiteboard 相关（白板 schema / 连接消息 / 用户列表）
 */
export class SkyOffice extends Room<OfficeState> {
  private dispatcher = new Dispatcher(this)
  private name: string
  private description: string
  /** 业务层 roomId（由 HTTP API 传入，用于 RoomRegistry 反查） */
  bizRoomId: string

  onCreate(options: IRoomData & { bizRoomId?: string }) {
    const { name, description, autoDispose, bizRoomId } = options
    this.name = name
    this.description = description
    this.bizRoomId = bizRoomId || ''
    this.autoDispose = autoDispose

    this.setMetadata({ name, description, bizRoomId })

    this.setState(new OfficeState())

    // 人类玩家移动
    this.onMessage(
      Message.UPDATE_PLAYER,
      (client, message: { x: number; y: number; anim: string }) => {
        this.dispatcher.dispatch(new PlayerUpdateCommand(), {
          client,
          x: message.x,
          y: message.y,
          anim: message.anim,
        })
      }
    )

    // 人类玩家改名
    this.onMessage(Message.UPDATE_PLAYER_NAME, (client, message: { name: string }) => {
      this.dispatcher.dispatch(new PlayerUpdateNameCommand(), {
        client,
        name: message.name,
      })
    })

    // 人类玩家聊天消息（保留通道，UI 主聊天框已移除，但前端可程序化触发）
    this.onMessage(Message.ADD_CHAT_MESSAGE, (client, message: { content: string }) => {
      this.dispatcher.dispatch(new ChatMessageUpdateCommand(), {
        client,
        content: message.content,
      })
      this.broadcast(
        Message.ADD_CHAT_MESSAGE,
        { clientId: client.sessionId, content: message.content },
        { except: client }
      )
    })

    // 调试委托：viewer 请求切换某 agent 的 activity（用于调试面板）
    // 转发给 Bridge 处理（异步，读 map.json），无需 Agent token
    this.onMessage(
      Message.DELEGATE_AGENT_ACTIVITY,
      (_client, message: { agentId: string; activity: string }) => {
        if (!message || !message.agentId) return
        const valid = ['idle', 'working', 'meeting', 'relaxing']
        if (!valid.includes(message.activity)) return
        if (this.bizRoomId) {
          bridge
            .agentActivity(this.bizRoomId, message.agentId, message.activity as any)
            .catch((e) => console.error('[room] delegate activity failed:', e))
        }
      }
    )

    // 调试委托：viewer 请求让某 agent 说话（用于调试面板的"测试消息"）
    this.onMessage(
      Message.DELEGATE_AGENT_TALK,
      (_client, message: { agentId: string; text: string; durationMs?: number }) => {
        if (!message || !message.agentId || !message.text) return
        if (this.bizRoomId) {
          bridge.agentTalk(
            this.bizRoomId,
            message.agentId,
            message.text,
            message.durationMs
          )
        }
      }
    )
  }

  onJoin(client: Client, _options: any) {
    this.state.players.set(client.sessionId, new Player())
    client.send(Message.SEND_ROOM_DATA, {
      id: this.roomId,
      name: this.name,
      description: this.description,
    })
  }

  onLeave(client: Client, _consented: boolean) {
    if (this.state.players.has(client.sessionId)) {
      this.state.players.delete(client.sessionId)
    }
  }

  onDispose() {
    // 清理 Bridge 的椅子占用表（如果有 bizRoomId）
    if (this.bizRoomId) {
      bridge.clearRoom(this.bizRoomId)
    }

    console.log('room', this.roomId, 'disposing...')
    this.dispatcher.stop()
  }
}
