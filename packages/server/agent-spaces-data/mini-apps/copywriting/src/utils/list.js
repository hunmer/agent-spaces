// 列表展示与前端分页：筛选默认值、分页窗口、按 id 去重。

// 侧边栏筛选默认值（keyword / type / tag / 时长排序）
export const DEFAULT_FILTER = { keyword: '', type: '', tag: '', durationSort: '' };

// 每页条数（前端切片）
export const PAGE_SIZE = 50;

// 分页器：当前页附近的数字窗口（页数多时只显示一段，避免按钮过多）
export function pageWindow(current, total, size = 5) {
  if (total <= size) return Array.from({ length: total }, (_, i) => i + 1);
  let start = Math.max(1, current - Math.floor(size / 2));
  let end = start + size - 1;
  if (end > total) { end = total; start = end - size + 1; }
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

// 按 id 去重（后者覆盖前者）
export function uniqById(items) {
  const map = new Map();
  for (const item of items) map.set(item.id, item);
  return [...map.values()];
}
