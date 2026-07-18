import { Router, Response } from 'express'
import colyseus from 'colyseus'
const { matchMaker } = colyseus
import { roomRegistry } from '../rooms/RoomRegistry.js'
import { bridge } from '../broadcast/Bridge.js'
import { broadcastServer } from '../broadcast/BroadcastServer.js'
import { AuthedRequest, requireRoomToken } from './auth.js'
import { createSkyOfficeRoom, ensureTeamRoom } from '../team-room.js'

export const roomRoutes: import('express').Router = Router()

/**
 * POST /api/rooms
 * 创建一个房间。body 可选：{ name, description, autoDispose }
 * 返回：{ roomId, token, wsUrl, name, description, createdAt }
 */
roomRoutes.post('/rooms', async (req: AuthedRequest, res: Response) => {
  const name = (req.body?.name as string) || 'Agent Team Room'
  const description = (req.body?.description as string) || ''
  const autoDispose = req.body?.autoDispose !== false

  try {
    const room = await createSkyOfficeRoom({ name, description, autoDispose })

    const host = req.get('host') || `localhost:${process.env.PORT || 2567}`
    const proto = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'wss' : 'ws'

    res.json({
      roomId: room.roomId,
      token: room.roomToken,
      wsUrl: `${proto}://${host}/agent-ws?roomId=${room.roomId}&token=${room.roomToken}`,
      colyseusRoomId: room.colyseusRoomId,
      name: room.name,
      description: room.description,
      createdAt: room.createdAt,
    })
  } catch (err) {
    console.error('[api] create room failed:', err)
    res.status(500).json({ error: 'failed to create room', detail: String(err) })
  }
})

roomRoutes.post('/team-rooms/:teamId', async (req, res) => {
  try {
    const room = await ensureTeamRoom(String(req.params.teamId ?? ''))
    res.json({ roomId: room.roomId })
  } catch (error) {
    res.status(404).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

/**
 * GET /api/rooms/:roomId/join
 * 公开端点（不需要 token）—— 给前端 viewer 用。
 * 用业务 roomId 解析出 Colyseus 内部 roomId + 房间名/描述，
 * 前端拿到后再用 client.joinById(colyseusRoomId) 加入。
 */
roomRoutes.get('/rooms/:roomId/join', (req, res) => {
  const entry = roomRegistry.get(req.params.roomId)
  if (!entry) {
    res.status(404).json({ error: 'room not found' })
    return
  }
  res.json({
    roomId: entry.roomId,
    colyseusRoomId: entry.colyseusRoomId,
    name: entry.name,
    description: entry.description,
  })
})

/**
 * GET /api/rooms
 * 列出所有房间（不含 token）。
 */
roomRoutes.get('/rooms', (_req, res) => {
  const list = roomRegistry.list().map((r) => ({
    roomId: r.roomId,
    name: r.name,
    description: r.description,
    createdAt: r.createdAt,
    agentCount: bridge.listAgents(r.roomId).length,
    subscribers: broadcastServer.getSubscriberCount(r.roomId),
  }))
  res.json({ rooms: list })
})

/**
 * GET /api/rooms/:roomId
 * 查询单个房间信息（需 token）。
 */
roomRoutes.get('/rooms/:roomId', requireRoomToken, (req: AuthedRequest, res) => {
  const entry = req.roomEntry!
  res.json({
    roomId: entry.roomId,
    name: entry.name,
    description: entry.description,
    createdAt: entry.createdAt,
    agents: bridge.listAgents(entry.roomId),
    subscribers: broadcastServer.getSubscriberCount(entry.roomId),
  })
})

/**
 * DELETE /api/rooms/:roomId
 * 解散房间：通知所有 WS 连接关闭、销毁 Colyseus room、清理注册表。
 */
roomRoutes.delete('/rooms/:roomId', requireRoomToken, async (req: AuthedRequest, res) => {
  const entry = req.roomEntry!
  // 通知所有 agent 连接
  broadcastServer.notifyRoomClosed(entry.roomId)
  // 销毁 Colyseus 房间（disconnect 所有 viewer）
  try {
    const room = matchMaker.getRoomById(entry.colyseusRoomId)
    if (room) {
      room.disconnect()
    }
  } catch (err) {
    console.warn('[api] disconnect room failed:', err)
  }
  roomRegistry.delete(entry.roomId)
  res.json({ ok: true, roomId: entry.roomId })
})

/**
 * GET /api/rooms/:roomId/agents
 * 列出房间内所有 agent。
 */
roomRoutes.get('/rooms/:roomId/agents', requireRoomToken, (req: AuthedRequest, res) => {
  res.json({ agents: bridge.listAgents(req.roomId!) })
})

/**
 * POST /api/rooms/:roomId/agents
 * spawn 一个 agent。body: { agentId, name?, texture?, x?, y?, anim?, action? }
 */
roomRoutes.post('/rooms/:roomId/agents', requireRoomToken, (req: AuthedRequest, res) => {
  const agentId = req.body?.agentId
  if (!agentId || typeof agentId !== 'string') {
    res.status(400).json({ error: 'agentId required' })
    return
  }
  const ok = bridge.spawnAgent(req.roomId!, agentId, {
    name: req.body?.name,
    texture: req.body?.texture,
    x: req.body?.x,
    y: req.body?.y,
    anim: req.body?.anim,
    action: req.body?.action,
  })
  if (!ok) {
    res.status(404).json({ error: 'room not active' })
    return
  }
  res.json({ ok: true, agentId })
})

/**
 * DELETE /api/rooms/:roomId/agents/:agentId
 * despawn agent。
 */
roomRoutes.delete(
  '/rooms/:roomId/agents/:agentId',
  requireRoomToken,
  (req: AuthedRequest, res) => {
    const ok = bridge.despawnAgent(req.roomId!, String(req.params.agentId ?? ''))
    if (!ok) {
      res.status(404).json({ error: 'agent or room not found' })
      return
    }
    res.json({ ok: true })
  }
)

/**
 * POST /api/rooms/:roomId/broadcast
 * 直接通过 HTTP 推送一条广播消息（适合一次性事件，不适合高频移动）。
 * body: 任意合法的 AgentBroadcastType payload。
 */
roomRoutes.post('/rooms/:roomId/broadcast', requireRoomToken, (req: AuthedRequest, res) => {
  const result = bridge.dispatch(req.roomId!, req.body)
  if (!result.ok) {
    res.status(400).json(result)
    return
  }
  res.json(result)
})
