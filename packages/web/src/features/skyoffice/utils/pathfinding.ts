export type Point = { x: number; y: number }

export function tilesCoveredByRect(
  x: number,
  y: number,
  width: number,
  height: number,
  tileWidth: number,
  tileHeight: number
): Point[] {
  const tiles: Point[] = []
  for (let tileY = Math.floor(y / tileHeight); tileY <= Math.floor((y + height - 1) / tileHeight); tileY += 1) {
    for (let tileX = Math.floor(x / tileWidth); tileX <= Math.floor((x + width - 1) / tileWidth); tileX += 1) {
      tiles.push({ x: tileX, y: tileY })
    }
  }
  return tiles
}

export function findGridPath(
  width: number,
  height: number,
  start: Point,
  target: Point,
  isBlocked: (x: number, y: number) => boolean
): Point[] {
  const key = (point: Point) => point.y * width + point.x
  const targetKey = key(target)
  const queue = [start]
  const previous = new Map<number, Point | null>([[key(start), null]])

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]
    if (key(current) === targetKey) break

    for (const next of [
      { x: current.x + 1, y: current.y },
      { x: current.x - 1, y: current.y },
      { x: current.x, y: current.y + 1 },
      { x: current.x, y: current.y - 1 },
    ]) {
      const nextKey = key(next)
      if (
        next.x < 0 || next.y < 0 || next.x >= width || next.y >= height ||
        previous.has(nextKey) || isBlocked(next.x, next.y)
      ) continue
      previous.set(nextKey, current)
      queue.push(next)
    }
  }

  if (!previous.has(targetKey)) return []

  const path: Point[] = []
  for (let current: Point | null = target; current; current = previous.get(key(current))!) {
    path.push(current)
  }
  return path.reverse()
}
