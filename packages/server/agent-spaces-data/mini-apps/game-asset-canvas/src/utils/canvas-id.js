/**
 * 画布节点 id / 自动错落位置生成器（模块级单例）。
 *
 * 从 Canvas.jsx 抽出。seq / positionIndex 是模块级可变状态，
 * 保证连续建节点（如 add_node RPC 批量、循环创建）时 id 唯一、位置不撞车，
 * 不依赖 React state 的过期闭包值。
 */

// id 自增计数器（模块级单例）
let seq = 0;

/**
 * 生成唯一 id：prefix + base36 时间戳 + 自增序号。
 * @param {string} prefix 如 'node' / 'hist' / 'group'
 * @returns {string}
 */
export function genId(prefix) {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
}

// 自动错落位置计数器（模块级单例，同步自增）。
// 解决连续 add_node 时 nodes.length 是过期闭包值导致位置重复的问题：
// 每次创建节点都让 positionIndex 自增，即使 React state 还没更新，
// 算出的网格位置也不会撞车。
let positionIndex = 0;

const AUTO_GAP_X = 320; // 列间距（大于最大节点宽 290）
const AUTO_GAP_Y = 160; // 行间距
const AUTO_COLS = 3;    // 每行 3 个
const AUTO_ORIGIN_X = 120;
const AUTO_ORIGIN_Y = 120;

/**
 * 计算下一个自动错落位置（3 列网格）。
 * @param {number} baseLen 当前节点数（作为起始偏移，与 positionIndex 累加）
 * @returns {{x:number, y:number}}
 */
export function autoPosition(baseLen = 0) {
  const idx = baseLen + positionIndex;
  positionIndex += 1;
  const col = idx % AUTO_COLS;
  const row = Math.floor(idx / AUTO_COLS);
  return {
    x: AUTO_ORIGIN_X + col * AUTO_GAP_X,
    y: AUTO_ORIGIN_Y + row * AUTO_GAP_Y,
  };
}
