// 注意：client 已迁移为独立包 @agent-spaces/skyoffice-web（packages/skyoffice-web）。
// 本测试脚本需手动运行（不在 tsc 编译范围），import 路径指向 monorepo 内的前端源码。
// 运行：cd packages/server && npx tsx src/skyoffice/examples/pathfinding-test.ts
import { findGridPath, tilesCoveredByRect } from '../../../../skyoffice-web/src/utils/pathfinding'

const walls = new Set(['2,0', '2,1', '2,2', '2,3'])
const path = findGridPath(5, 5, { x: 0, y: 1 }, { x: 4, y: 1 }, (x, y) => walls.has(`${x},${y}`))

if (!path.length) throw new Error('expected a path around the wall')
if (path.some(({ x, y }) => walls.has(`${x},${y}`))) throw new Error('path crosses a wall')
if (path.some((point, index) => index > 0 && Math.abs(point.x - path[index - 1].x) + Math.abs(point.y - path[index - 1].y) !== 1)) {
  throw new Error('path contains a non-adjacent step')
}
const furnitureTiles = tilesCoveredByRect(32, 32, 64, 32, 32, 32)
if (JSON.stringify(furnitureTiles) !== JSON.stringify([{ x: 1, y: 1 }, { x: 2, y: 1 }])) {
  throw new Error('furniture rectangle was not mapped to the correct tiles')
}

console.log('pathfinding check passed')
