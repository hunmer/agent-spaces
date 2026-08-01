import { useCallback, useMemo, useState } from 'react';

/**
 * 跨节点图片多选状态 hook。
 *
 * 选中项用 { nodeId, url } 表示，保持选中顺序。
 * 同一张图（同 nodeId + 同 url）只算一项；不同节点的相同 url 视为不同项（应对工作流可能产出重复 URL）。
 *
 * toggle 语义：
 * - ctrl/meta 按下：增删切换（已选则移除，未选则追加）
 * - 普通点击：若当前项已是唯一选中 → 清空；否则设为唯一选中（替换）
 *
 * @returns {{ selected, isSelected, toggle, clear, selectedCount, selectedUrls }}
 */
export default function useImageSelection() {
  const [selected, setSelected] = useState([]);

  const sameItem = (a, nodeId, url) => a.nodeId === nodeId && a.url === url;

  const isSelected = useCallback((nodeId, url) => {
    if (!nodeId || !url) return false;
    return selected.some((it) => sameItem(it, nodeId, url));
  }, [selected]);

  const toggle = useCallback((nodeId, url, ctrlKey) => {
    if (!nodeId || !url) return;
    setSelected((prev) => {
      const exists = prev.some((it) => sameItem(it, nodeId, url));
      // ctrl/meta：增删切换
      if (ctrlKey) {
        return exists
          ? prev.filter((it) => !sameItem(it, nodeId, url))
          : [...prev, { nodeId, url }];
      }
      // 普通点击：已选中且唯一 → 清空；否则设为唯一选中
      if (exists && prev.length === 1) return [];
      return [{ nodeId, url }];
    });
  }, []);

  const clear = useCallback(() => setSelected([]), []);

  // 去重 url 数组（同 url 只算一份，喂给编辑/抠图/放大操作）
  const selectedUrls = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const it of selected) {
      if (it.url && !seen.has(it.url)) {
        seen.add(it.url);
        out.push(it.url);
      }
    }
    return out;
  }, [selected]);

  const selectedCount = selected.length;

  return useMemo(() => ({
    selected, isSelected, toggle, clear, selectedCount, selectedUrls,
  }), [selected, isSelected, toggle, clear, selectedCount, selectedUrls]);
}
