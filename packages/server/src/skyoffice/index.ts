import type http from 'http'
import type { Application } from 'express'
// colyseus / @colyseus/{monitor,ws-transport} 无 exports 字段（CJS），
// Node ESM 下具名 import 不可用，用 default import + 解构。
// @colyseus/schema 有完整 exports，在 OfficeState 等文件中直接具名 import。
import colyseus from 'colyseus'
import monitorPkg from '@colyseus/monitor'
import wsTransportPkg from '@colyseus/ws-transport'
const { Server } = colyseus
const { monitor } = monitorPkg
const { WebSocketTransport } = wsTransportPkg

import { RoomType } from './types/Rooms.js'
import { SkyOffice } from './rooms/SkyOffice.js'
import { roomRoutes } from './api/roomRoutes.js'
import { mapRoutes } from './api/mapRoutes.js'
import { broadcastServer } from './broadcast/BroadcastServer.js'

export { broadcastServer }

/**
 * 被主后端统一 upgrade dispatcher 调用的 Colyseus transport upgrade handler。
 *
 * 背景：@colyseus/ws-transport 在构造时会向 http server 注册一个 'upgrade' listener。
 * 我们在 attachSkyOffice 中创建 transport 后立即把这个 listener "摘"出来，
 * 让主后端 app.ts 的统一 dispatcher 在第五路（非 /ws /ws/speech /agent-ws）
 * 主动调用它，从而避免三个 upgrade listener 争抢同一个事件。
 */
let colyseusUpgradeHandler: ((req: http.IncomingMessage, socket: any, head: Buffer) => void) | null = null

export function getColyseusUpgradeHandler() {
  return colyseusUpgradeHandler
}

export interface AttachOptions {
  app: Application
  server: http.Server
}

/**
 * 挂载 SkyOffice 的 HTTP 路由（Colyseus 监控 + 房间/地图 API）。
 * 必须在主后端 app.use('/api', authMiddleware) 之前调用，
 * 这样 /api/skyoffice/* 由 SkyOffice 自管 per-room token 鉴权，绕开主全局 Bearer。
 */
export function mountSkyOfficeRoutes(app: Application): void {
  // 类型断言：Express 5 的 @types/express v5 对 Application.use(path, Router) 重载推断不全
  app.use('/api/skyoffice', roomRoutes as any)
  app.use('/api/skyoffice', mapRoutes as any)
  app.use('/skyoffice/colyseus', monitor() as any)
}

/**
 * 把 SkyOffice 实时部分（Colyseus 房间服务 + Agent 广播 WS）接入主后端单进程。
 *
 * - 不自建 http server，复用主后端的 server
 * - Colyseus 不自己 listen，而是 attach 到主 server，并让出 upgrade 事件给统一 dispatcher
 * - Agent WS 由主 dispatcher 在 /agent-ws 路径上分流到 broadcastServer.handleUpgrade
 *
 * 必须在主后端 server.listen 之前、且在主后端注册自己的 server.on('upgrade') 之前调用。
 */
export function attachSkyOffice({ server }: AttachOptions): void {
  // 1) 创建 Colyseus transport 并 attach 到主 server
  //    WebSocketTransport 构造时会 server.on('upgrade', ...)，我们立即摘出该 listener，
  //    避免它和主后端的统一 dispatcher 冲突。
  const transport = new WebSocketTransport({ server })
  const handlers = server.listeners('upgrade') as Array<(req: http.IncomingMessage, socket: any, head: Buffer) => void>
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

  // 4) Agent 广播 WS：只创建 wss + 注册 connection handler，不碰 server.on('upgrade')
  //    实际的 upgrade 由主后端统一 dispatcher 在 /agent-ws 路径上调用 broadcastServer.handleUpgrade
  broadcastServer.attach(server)

  console.log('[skyoffice] realtime attached to main server')
  console.log('  Agent WS:   /agent-ws?roomId=xxx&token=yyy')
  console.log('  Colyseus:   ws://<host>/<roomId> (viewer)')
}
