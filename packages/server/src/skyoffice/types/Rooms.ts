export enum RoomType {
  /** 公共房间（人类 viewer 默认加入） */
  PUBLIC = 'skyoffice',
  /** 自定义房间（HTTP API 创建的房间） */
  CUSTOM = 'custom',
}

/**
 * 创建房间时的参数。
 * - 由 HTTP API 创建时传入：name / description / roomToken
 * - 人类玩家不再直接创建房间（移除 LobbyRoom 后没有 client.create 流程）
 */
export interface IRoomData {
  name: string
  description: string
  /** 房间级 token，用于 Agent WS / 管理 API 鉴权 */
  roomToken: string
  /** 房间无人时是否自动销毁，默认 true */
  autoDispose: boolean
}
