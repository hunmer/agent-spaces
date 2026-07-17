import type { IAgent, DataChange } from './IAgent.js'

/**
 * IPlayer / IChatMessage / IOfficeState 是前后端共用的纯结构描述。
 * 服务端用 @colyseus/schema 的 Schema 子类（带装饰器），运行时实例满足此处 interface。
 * 前端用 colyseus.js 读取 room.state，state 上的 players/agents 是 MapSchema（类 Map），
 * chatMessages 是 ArraySchema（类 Array）。
 *
 * 这里用最小结构描述：Map<V> / V[] 而非 MapSchema<V> / ArraySchema<V>，
 * 避免前端为类型而依赖 @colyseus/schema。运行时 colyseus.js 的 MapSchema/ArraySchema
 * 均实现 Map / Array 接口（forEach/onAdd 等仍可用）。
 */
export interface IPlayer {
  name: string
  x: number
  y: number
  anim: string
  /** Colyseus schema 实例回调（前端 Network 赋值监听字段变更） */
  onChange?: (changes: DataChange[]) => void
}

export interface IChatMessage {
  author: string
  createdAt: number
  content: string
}

/** 房间状态结构（只描述前端读取的字段） */
export interface IOfficeState {
  /** 人类玩家（浏览器键盘控制），key 是 Colyseus sessionId */
  players: Map<string, IPlayer> & {
    onAdd?: (cb: (item: IPlayer, key: string) => void) => void
    onRemove?: (cb: (item: IPlayer, key: string) => void) => void
  }
  /** 外部 Agent（广播 WS 推送），key 是外部 agentId */
  agents: Map<string, IAgent> & {
    onAdd?: (cb: (item: IAgent, key: string) => void) => void
    onRemove?: (cb: (item: IAgent, key: string) => void) => void
  }
  /** 历史事件流（用于 UI 的 AgentFeed 面板，限制最多 100 条） */
  chatMessages: IChatMessage[] & {
    onAdd?: (cb: (item: IChatMessage, key: number) => void) => void
  }
}
