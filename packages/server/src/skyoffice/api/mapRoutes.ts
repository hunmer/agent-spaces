import { Router, Response } from 'express'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'node:url'

/**
 * map.json 的内存缓存 + 懒加载。
 * 服务端启动时不读，首次请求时才加载，写回时更新缓存。
 *
 * 路径定位：优先用环境变量 SKYOFFICE_MAP_JSON 覆盖；
 * 否则从当前文件向上查找 skyoffice-web 包的 map.json。
 *   - ESM 产物：packages/server/dist/skyoffice/api/ → 上溯到 packages/ → skyoffice-web/...
 *   - dev（tsx）：packages/server/src/skyoffice/api/ → 同样上溯
 */
function resolveMapJsonPath(): string {
  if (process.env.SKYOFFICE_MAP_JSON) return process.env.SKYOFFICE_MAP_JSON
  // ESM 下无 __dirname，用 import.meta.url 推导当前文件所在目录
  const base = path.dirname(fileURLToPath(import.meta.url))
  const candidates = [
    path.resolve(base, '../../../../skyoffice-web/public/assets/map/map.json'),
    path.resolve(base, '../../../skyoffice-web/public/assets/map/map.json'),
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return candidates[0]
}

const MAP_JSON_PATH = resolveMapJsonPath()
let mapCache: any = null
let mapLoadPromise: Promise<any> | null = null

async function loadMap(): Promise<any> {
  if (mapCache) return mapCache
  if (mapLoadPromise) return mapLoadPromise
  mapLoadPromise = (async () => {
    const raw = await fs.promises.readFile(MAP_JSON_PATH, 'utf8')
    mapCache = JSON.parse(raw)
    return mapCache
  })()
  return mapLoadPromise
}

async function saveMap(map: any): Promise<void> {
  mapCache = map
  await fs.promises.writeFile(MAP_JSON_PATH, JSON.stringify(map, null, 2), 'utf8')
}

/** 拿到 Chair 对象层 */
function getChairLayer(map: any): any[] {
  const layer = map.layers.find((l: any) => l.name === 'Chair')
  return layer ? layer.objects : []
}

/** 读取或创建某椅子的 zone 属性 */
function getChairZone(chairObj: any): string {
  const props = chairObj.properties || []
  const z = props.find((p: any) => p.name === 'zone')
  return z ? z.value : ''
}

/** 设置某椅子的 zone 属性（zone 为空字符串时移除） */
function setChairZone(chairObj: any, zone: string): void {
  if (!chairObj.properties) chairObj.properties = []
  const idx = chairObj.properties.findIndex((p: any) => p.name === 'zone')
  if (zone === '' || zone === 'none') {
    // 移除标记
    if (idx >= 0) chairObj.properties.splice(idx, 1)
  } else {
    const prop = { name: 'zone', type: 'string', value: zone }
    if (idx >= 0) {
      chairObj.properties[idx] = prop
    } else {
      chairObj.properties.push(prop)
    }
  }
}

export const mapRoutes: import('express').Router = Router()

/**
 * GET /api/map/chairs
 * 返回所有椅子的标记状态。
 * 无需鉴权（地图配置是公开信息）。
 */
mapRoutes.get('/map/chairs', async (_req, res) => {
  try {
    const map = await loadMap()
    const chairs = getChairLayer(map)
    const result = chairs.map((c: any, i: number) => ({
      index: i,
      id: c.id,
      name: c.name || '',
      x: c.x,
      y: c.y,
      width: c.width,
      height: c.height,
      direction: (c.properties || []).find((p: any) => p.name === 'direction')?.value || '',
      zone: getChairZone(c),
    }))
    res.json({ chairs: result })
  } catch (err) {
    console.error('[api] get chairs failed:', err)
    res.status(500).json({ error: 'failed to read map', detail: String(err) })
  }
})

/**
 * POST /api/map/chairs/:index/zone
 * 设置某把椅子的 zone。body: { zone: 'working' | 'meeting' | 'relaxing' | '' }
 * 无需鉴权（开发工具，本地用）。
 */
mapRoutes.post('/map/chairs/:index/zone', async (req, res) => {
  try {
    const idx = parseInt(req.params.index, 10)
    const zone = String(req.body?.zone || '')
    const valid = ['', 'none', 'working', 'meeting', 'relaxing']
    if (!valid.includes(zone)) {
      res.status(400).json({ error: `invalid zone: ${zone}` })
      return
    }
    const map = await loadMap()
    const chairs = getChairLayer(map)
    if (idx < 0 || idx >= chairs.length) {
      res.status(404).json({ error: 'chair index out of range' })
      return
    }
    setChairZone(chairs[idx], zone)
    await saveMap(map)
    invalidateZoneChairCache() // 写回后清空 pickChair 缓存
    res.json({ ok: true, index: idx, zone: zone === 'none' ? '' : zone })
  } catch (err) {
    console.error('[api] set chair zone failed:', err)
    res.status(500).json({ error: 'failed to write map', detail: String(err) })
  }
})

/**
 * 给 Bridge 用的导出：从 map.json 加载所有标记了 zone 的椅子。
 * 返回 { working: [...], meeting: [...], relaxing: [...] }
 */
let zoneChairCache: { working: any[]; meeting: any[]; relaxing: any[] } | null = null

export async function loadZoneChairs(): Promise<{
  working: Array<{ x: number; y: number; dir: string; key: string }>
  meeting: Array<{ x: number; y: number; dir: string; key: string }>
  relaxing: Array<{ x: number; y: number; dir: string; key: string }>
}> {
  if (zoneChairCache) return zoneChairCache
  const map = await loadMap()
  const chairs = getChairLayer(map)
  const result: any = { working: [], meeting: [], relaxing: [] }
  chairs.forEach((c: any, i: number) => {
    const zone = getChairZone(c)
    if (zone === 'working' || zone === 'meeting' || zone === 'relaxing') {
      const dir =
        (c.properties || []).find((p: any) => p.name === 'direction')?.value || 'down'
      // 中心坐标（与 Phaser addObjectFromTiled 一致）
      const cx = c.x + c.width * 0.5
      const cy = c.y - c.height * 0.5
      result[zone].push({ x: cx, y: cy, dir, key: `map:${i}` })
    }
  })
  zoneChairCache = result
  return result
}

/** 写回后清空缓存，下次读取重新加载 */
export function invalidateZoneChairCache(): void {
  zoneChairCache = null
}
