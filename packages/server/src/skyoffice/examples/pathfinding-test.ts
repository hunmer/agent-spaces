import { findGridPath, tilesCoveredByRect } from '../client/src/utils/pathfinding'

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
