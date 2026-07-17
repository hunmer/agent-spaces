import type http from 'http'
import type { Application } from 'express'
import { Server } from 'colyseus'
import { monitor } from '@colyseus/monitor'
import { WebSocketTransport } from '@colyseus/ws-transport'

import { RoomType } from './types/Rooms'
import { SkyOffice } from './rooms/SkyOffice'
import { roomRoutes } from './api/roomRoutes'
import { mapRoutes } from './api/mapRoutes'
import { broadcastServer } from './broadcast/BroadcastServer'

export { broadcastServer }

/**
 * 被主后端统一 upgrade dispatcher 调用的 Colyseus transport upgrade handler。
 *
 * 背景：@colyseus/ws-transport 在构造时会向 http server 注册一个 'upgrade' listener。
 * 我们在 attachSkyOffice 中创建 transport 后立即把这个 listener "摘"出来，
 * 让主后端 app.ts 的统一 dispatcher 在第五路（非 /ws /ws/speech /ws/lsp/typescript /agent-ws）
 * 主动调用它，从而避免三个 upgrade listener 争抢同一个事件。
 */
let colyseusUpgradeHandler: ((req: http.IncomingMessage, socket: import('net').Socket, head: Buffer) => void) | null = null

export function getColyseusUpgradeHandler() {
  return colyseusUpgradeHandler
}

export interface AttachOptions {
  app: Application
  server: http.Server
}

/**
 * 把 SkyOffice（Colyseus 房间服务 + Agent 广播 WS + HTTP API）接入主后端单进程。
 *
 * - 不自建 http server，复用主后端的 server
 * - 不重复 cors / express.json（由主 app 全局提供）
 * - Colyseus 不自己 listen，而是 attach 到主 server，并让出 upgrade 事件给统一 dispatcher
 * - HTTP API 挂到 /api/skyoffice/*（在主 authMiddleware 之前注册，由 SkyOffice 自管 per-room token 鉴权）
 * - Agent WS 挂到 /agent-ws（由主 dispatcher 第四路分流到 broadcastServer.handleUpgrade）
 * - Colyseus viewer 挂到 /skyoffice/colyseus 监控面板
 *
 * 必须在主后端 server.listen 之前调用。
 */
export function attachSkyOffice({ app, server }: AttachOptions): void {
  // 1) 创建 Colyseus transport 并 attach 到主 server
  //    WebSocketTransport 构造时会 server.on('upgrade', ...)，我们立即摘出该 listener，
  //    避免它和主后端的统一 dispatcher 冲突。
  const transport = new WebSocketTransport({ server })
  const handlers = server.listeners('upgrade') as Array<(req: http.IncomingMessage, socket: import('net').Socket, head: Buffer) => void>
  // transport 刚注册的 handler 是最后一个
  colyseusUpgradeHandler = handlers[handlers.length - 1] || null
  server.removeListener('upgrade', colyseusUpgradeHandler as any)

  // 2) 创建 Colyseus Server（复用 transport，不再绑端口）
  const gameServer = new Server({ transport })

  // 3) 注册房间
  gameServer.define(RoomType.PUBLIC, SkyOffice, {
    name: 'Public Lobby',
    description: 'Agent teams showcase',
    roomToken: '__public__',
    autoDispose: false,
  } as any)

  gameServer.define(RoomType.CUSTOM, SkyOffice)

  // 4) HTTP API：挂在 /api/skyoffice 下，由 SkyOffice 自管 per-room token 鉴权
  //    （注意：调用方需确保此挂载在主后端 app.use('/api', authMiddleware) 之前）
  //    类型断言：Express 5 的 @types/express v5 对 Application.use(path, Router) 重载推断不全
  app.use('/api/skyoffice', roomRoutes as any)
  app.use('/api/skyoffice', mapRoutes as any)

  // 5) Agent 广播 WS：只创建 wss + 注册 connection handler，不碰 server.on('upgrade')
  //    实际的 upgrade 由主后端统一 dispatcher 在 /agent-ws 路径上调用 broadcastServer.handleUpgrade
  broadcastServer.attach(server)

  // 6) Colyseus 监控面板（加前缀避免和主后端可能的 /colyseus 冲突）
  app.use('/skyoffice/colyseus', monitor() as any)

  console.log('[skyoffice] attached to main server')
  console.log('  HTTP API:   /api/skyoffice/rooms')
  console.log('  Agent WS:   /agent-ws?roomId=xxx&token=yyy')
  console.log('  Colyseus:   ws://<host>/<roomId> (viewer)')
  console.log('  Monitor:    /skyoffice/colyseus')
}
