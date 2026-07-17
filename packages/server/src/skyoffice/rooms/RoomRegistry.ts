/**
 * 房间注册表：内存存储 roomId ↔ 鉴权信息 + Colyseus 房间句柄。
 *
 * 用途：
 *   - HTTP API 创建房间时写入
 *   - HTTP API 解散房间 / WS 鉴权时读取
 *   - Bridge 桥接广播消息时通过 colyseusRoomId 找到目标房间
 *
 * 不持久化：进程重启即丢失（与原项目一致）。
 */
export interface RegisteredRoom {
  /** 业务层房间 ID（外部使用） */
  roomId: string
  /** 房间级 token，用于 Agent WS / 管理 API 鉴权 */
  roomToken: string
  /** Colyseus 内部 roomId（matchMaker.createRoom 返回） */
  colyseusRoomId: string
  /** 显示名 */
  name: string
  /** 描述 */
  description: string
  /** 创建时间戳 */
  createdAt: number
}

class RoomRegistryImpl {
  private rooms = new Map<string, RegisteredRoom>()
  /** colyseusRoomId → roomId 的反向索引，便于从 room 实例反查 */
  private reverseIndex = new Map<string, string>()

  register(entry: RegisteredRoom): void {
    this.rooms.set(entry.roomId, entry)
    this.reverseIndex.set(entry.colyseusRoomId, entry.roomId)
  }

  get(roomId: string): RegisteredRoom | undefined {
    return this.rooms.get(roomId)
  }

  getByColyseusRoomId(colyseusRoomId: string): RegisteredRoom | undefined {
    const roomId = this.reverseIndex.get(colyseusRoomId)
    if (!roomId) return undefined
    return this.rooms.get(roomId)
  }

  delete(roomId: string): RegisteredRoom | undefined {
    const entry = this.rooms.get(roomId)
    if (!entry) return undefined
    this.rooms.delete(roomId)
    this.reverseIndex.delete(entry.colyseusRoomId)
    return entry
  }

  list(): RegisteredRoom[] {
    return Array.from(this.rooms.values())
  }

  /**
   * 校验 roomId + token 是否匹配。
   * 返回 true 表示鉴权通过。
   */
  verify(roomId: string, token: string): boolean {
    const entry = this.rooms.get(roomId)
    if (!entry) return false
    return entry.roomToken === token
  }
}

export const roomRegistry = new RoomRegistryImpl()
