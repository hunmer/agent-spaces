import { AgentActivity } from './IAgent.js'

/**
 * 椅子定义 —— 与 Phaser Chair sprite 的 x/y 对齐（中心坐标）。
 *
 * 坐标来源：从 Tiled map.json 的 Chair object 层计算得出。
 * 原始 object 的 (x, y) 是左上角，sprite 尺寸 32×64，
 * 所以中心坐标 = (x + 16, y - 32)，与 Game.ts 中 addObjectFromTiled 一致。
 *
 * 朝向 dir 决定坐下时的动画（sit_up / sit_down / sit_left / sit_right）。
 */
export interface ChairSpot {
  /** 中心 x */
  x: number
  /** 中心 y */
  y: number
  /** 朝向：up | down | left | right */
  dir: 'up' | 'down' | 'left' | 'right'
}

/**
 * 三个活动区域对应的椅子池。
 * - working: 左侧工位区（10 把，两排面向办公桌）
 * - meeting: 右上会议室（5 把围桌会议椅）
 * - relaxing: 右下酒馆 + 左下沙发区（10 把）
 *
 * 数值已从 Tiled 原始坐标转换为 Phaser 中心坐标。
 * 如果地图更新了椅子位置，重新生成此表即可。
 */
export const AGENT_ZONE_CHAIRS: Record<Exclude<AgentActivity, 'idle'>, ChairSpot[]> = {
  working: [
    // 主工位排（y=384，面向下，背对办公桌）
    { x: 240, y: 384, dir: 'down' },
    { x: 272, y: 384, dir: 'down' },
    { x: 304, y: 384, dir: 'down' },
    { x: 496, y: 384, dir: 'down' },
    { x: 528, y: 384, dir: 'down' },
    { x: 560, y: 384, dir: 'down' },
    { x: 592, y: 384, dir: 'down' },
    // 次工位排（y=608，面向下）
    { x: 336, y: 608, dir: 'down' },
    { x: 400, y: 608, dir: 'down' },
    { x: 464, y: 608, dir: 'down' },
  ],
  meeting: [
    // 会议室围桌椅（右上角）
    { x: 1008, y: 448, dir: 'down' },
    { x: 1104, y: 448, dir: 'down' },
    { x: 1200, y: 448, dir: 'down' },
    { x: 1008, y: 544, dir: 'up' },
    { x: 1104, y: 544, dir: 'up' },
    { x: 1200, y: 544, dir: 'up' },
  ],
  relaxing: [
    // 右下酒馆/休闲区
    { x: 1008, y: 704, dir: 'down' },
    { x: 1104, y: 704, dir: 'down' },
    { x: 1200, y: 704, dir: 'down' },
    { x: 1008, y: 800, dir: 'up' },
    { x: 1200, y: 800, dir: 'up' },
    // 左下沙发/茶几区
    { x: 272, y: 672, dir: 'right' },
    { x: 528, y: 672, dir: 'left' },
    { x: 336, y: 704, dir: 'up' },
    { x: 400, y: 704, dir: 'up' },
    { x: 464, y: 704, dir: 'up' },
  ],
}

/**
 * 给指定活动随机选一把椅子。可排除已被占用的椅子 key。
 *
 * @param activity 目标活动
 * @param occupiedKeys 当前已被占用的椅子 key 集合（格式：`<activity>:<index>`）
 * @returns { key, spot } 或 null（区域无可用椅子）
 */
export function pickChair(
  activity: Exclude<AgentActivity, 'idle'>,
  occupiedKeys: Set<string> = new Set()
): { key: string; spot: ChairSpot } | null {
  const pool = AGENT_ZONE_CHAIRS[activity]
  if (!pool || pool.length === 0) return null

  // 收集可用椅子的索引
  const available: number[] = []
  pool.forEach((_, i) => {
    const key = `${activity}:${i}`
    if (!occupiedKeys.has(key)) available.push(i)
  })

  // 全被占用就允许复用（随机取）
  const candidates = available.length > 0 ? available : pool.map((_, i) => i)
  const idx = candidates[Math.floor(Math.random() * candidates.length)]
  return {
    key: `${activity}:${idx}`,
    spot: pool[idx],
  }
}
