import { Request, Response, NextFunction } from 'express'
import { roomRegistry } from '../rooms/RoomRegistry.js'

/**
 * 解析 token：优先 Authorization: Bearer xxx，其次 query ?token=xxx
 */
export function extractToken(req: Request): string {
  const auth = req.headers.authorization
  if (auth && auth.startsWith('Bearer ')) {
    return auth.slice('Bearer '.length).trim()
  }
  const q = req.query.token
  if (typeof q === 'string') return q
  return ''
}

/**
 * 校验 roomId + token 的中间件。
 * 通过则把 (roomId, roomEntry) 挂到 req 上。
 */
export interface AuthedRequest extends Request {
  roomId?: string
  roomEntry?: ReturnType<typeof roomRegistry.get>
}

export function requireRoomToken(req: AuthedRequest, res: Response, next: NextFunction): void {
  const roomId = String(req.params.roomId ?? '')
  const token = extractToken(req)
  if (!roomId) {
    res.status(400).json({ error: 'roomId required' })
    return
  }
  const entry = roomRegistry.get(roomId)
  if (!entry) {
    res.status(404).json({ error: 'room not found' })
    return
  }
  if (entry.roomToken !== token) {
    res.status(403).json({ error: 'invalid token' })
    return
  }
  req.roomId = roomId
  req.roomEntry = entry
  next()
}
