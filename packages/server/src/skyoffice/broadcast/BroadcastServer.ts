import { WebSocketServer, WebSocket } from 'ws'
import http from 'http'
import { roomRegistry } from '../rooms/RoomRegistry'
import { bridge } from './Bridge'

/**
 * Agent 广播 WS 网关。
 *
 * - 监听路径：/agent-ws（共用 Colyseus 的 http server，通过 upgrade 事件分流）
 * - 鉴权：连接时在 query 上带 ?roomId=xxx&token=yyy
 * - 一个连接可以推送任意 agentId 的更新（团队协作场景）
 *
 * 消息格式（JSON 文本）：
 *   { "type": "agent.spawn",  "agentId": "a1", "name": "Worker", "texture": "lucy", "x": 100, "y": 200 }
 *   { "type": "agent.update", "agentId": "a1", "x": 110, "y": 220, "anim": "lucy_run_right" }
 *   { "type": "agent.talk",   "agentId": "a1", "text": "Hello!", "durationMs": 5000 }
 *   { "type": "agent.action", "agentId": "a1", "action": "wave" }
 *   { "type": "agent.sit",    "agentId": "a1", "x": 300, "y": 400 }
 *   { "type": "agent.despawn","agentId": "a1" }
 *
 * 服务端响应（每条消息回复一个 ack）：
 *   { "ok": true, "type": "agent.update", "agentId": "a1" }
 *   { "ok": false, "error": "agentId required" }
 *
 * 同时服务端会把 Colyseus 房间内的事件（其他 agent 的 spawn/talk 等）回推，
 * 让多 Agent 协作端可感知彼此（订阅模式）。
 */
interface AgentConnection {
  roomId: string
  ws: WebSocket
}

class BroadcastServerImpl {
  private wss?: WebSocketServer
  /** ws → connection 元数据 */
  private connections = new Map<WebSocket, AgentConnection>()
  /** roomId → Set<ws>，用于事件回推 */
  private roomSubscribers = new Map<string, Set<WebSocket>>()

  /**
   * 初始化广播 WS 服务。
   *
   * 合并进主后端后的行为变化：
   *   - 不再劫持 server 的 'upgrade' 事件（旧实现用 removeAllListeners 会破坏主后端 dispatcher）
   *   - 只创建 noServer 的 wss + 注册 connection handler
   *   - 实际的 upgrade 由主后端 app.ts 的统一 dispatcher 在 /agent-ws 路径上调用 handleUpgrade
   *
   * 参数 server 仅用于兼容旧签名，当前实现不再使用它（保留以便未来需要时挂载）。
   */
  attach(_server?: http.Server): void {
    this.wss = new WebSocketServer({ noServer: true })
    this.wss.on('connection', (ws, request) => {
      this.handleConnection(ws, request)
    })
  }

  /**
   * 供主后端统一 upgrade dispatcher 在 /agent-ws 路径上调用。
   * 完成 ws 握手并触发 connection 事件。
   */
  handleUpgrade(request: http.IncomingMessage, socket: import('net').Socket, head: Buffer): void {
    if (!this.wss) {
      socket.destroy()
      return
    }
    this.wss.handleUpgrade(request, socket, head, (ws) => {
      this.wss!.emit('connection', ws, request)
    })
  }

  /** 暴露内部 wss（监控/调试用） */
  getWss(): WebSocketServer | undefined {
    return this.wss
  }

  private handleConnection(ws: WebSocket, request: http.IncomingMessage): void {
    const url = new URL(request.url || '', 'http://localhost')
    const roomId = url.searchParams.get('roomId') || ''
    const token = url.searchParams.get('token') || ''

    // 鉴权
    if (!roomId || !token) {
      this.sendError(ws, 'roomId and token are required')
      ws.close(4001, 'missing credentials')
      return
    }
    if (!roomRegistry.verify(roomId, token)) {
      this.sendError(ws, 'invalid roomId or token')
      ws.close(4003, 'invalid credentials')
      return
    }

    const conn: AgentConnection = { roomId, ws }
    this.connections.set(ws, conn)

    // 加入房间订阅集合
    let subs = this.roomSubscribers.get(roomId)
    if (!subs) {
      subs = new Set()
      this.roomSubscribers.set(roomId, subs)
    }
    subs.add(ws)

    ws.send(JSON.stringify({ type: 'connected', roomId }))

    ws.on('message', (raw) => {
      this.handleMessage(ws, raw.toString())
    })

    ws.on('close', () => {
      this.connections.delete(ws)
      const s = this.roomSubscribers.get(roomId)
      if (s) {
        s.delete(ws)
        if (s.size === 0) this.roomSubscribers.delete(roomId)
      }
    })

    ws.on('error', (err) => {
      console.error('[agent-ws] connection error:', err)
    })
  }

  private handleMessage(ws: WebSocket, raw: string): void {
    const conn = this.connections.get(ws)
    if (!conn) {
      this.sendError(ws, 'connection not registered')
      return
    }

    let payload: any
    try {
      payload = JSON.parse(raw)
    } catch {
      this.sendError(ws, 'invalid JSON')
      return
    }

    // 支持批量消息（数组）：一次性处理多条 update
    if (Array.isArray(payload)) {
      const results = payload.map((p) => {
        const r = bridge.dispatch(conn.roomId, p)
        return { ok: r.ok, error: r.error, type: p?.type, agentId: p?.agentId }
      })
      ws.send(JSON.stringify({ type: 'batch_ack', results }))
      // 批量消息也回推给房间其他订阅者（让多 agent 端互相感知）
      payload.forEach((p) => this.fanout(conn.roomId, ws, p))
      return
    }

    const result = bridge.dispatch(conn.roomId, payload)
    if (result.ok) {
      ws.send(
        JSON.stringify({ ok: true, type: payload.type, agentId: payload.agentId })
      )
    } else {
      ws.send(
        JSON.stringify({ ok: false, error: result.error, type: payload.type })
      )
    }

    // 把消息扇出给房间内其他订阅者（协作感知）
    this.fanout(conn.roomId, ws, payload)
  }

  /**
   * 把一条 agent 消息推给同一房间的其他 WS 连接（除了发送者）。
   * 用于多 Agent 端协作时互相感知。
   */
  private fanout(roomId: string, exceptWs: WebSocket, payload: any): void {
    const subs = this.roomSubscribers.get(roomId)
    if (!subs) return
    const text = JSON.stringify({ source: 'broadcast', payload })
    subs.forEach((peer) => {
      if (peer !== exceptWs && peer.readyState === WebSocket.OPEN) {
        peer.send(text)
      }
    })
  }

  private sendError(ws: WebSocket, message: string): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ ok: false, error: message }))
    }
  }

  /**
   * 通知某房间所有连接房间已解散（HTTP DELETE /rooms/:id 时调用）。
   */
  notifyRoomClosed(roomId: string): void {
    const subs = this.roomSubscribers.get(roomId)
    if (!subs) return
    const text = JSON.stringify({ type: 'room_closed', roomId })
    subs.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(text)
        ws.close(1001, 'room closed')
      }
    })
    this.roomSubscribers.delete(roomId)
  }

  /** 房间内当前订阅连接数（监控用） */
  getSubscriberCount(roomId: string): number {
    return this.roomSubscribers.get(roomId)?.size || 0
  }
}

export const broadcastServer = new BroadcastServerImpl()
