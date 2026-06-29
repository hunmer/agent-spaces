// 贴纸集合一键拆分：浏览器端 Canvas 处理 → 返回 pieces 给调用方（不落库）
import { splitStickerCollection } from '../utils/imageSplit';

export function useStickerSplit() {
  const [splittingIds, setSplittingIds] = React.useState(new Set());
  const [error, setError] = React.useState('');
  // 最近一次拆分结果：{ pieces, sourcePrompt }，供 SplitResultDialog 展示
  const [result, setResult] = React.useState(null);

  // 拆分单张贴纸集合图，返回 pieces 数组（同时存入 result 供对话框展示）
  // item: 历史记录项 { id, url, prompt, collectionCount }
  // count: 期望拆分数量，缺省用 item.collectionCount，再缺省 6
  const split = React.useCallback(async (item, count) => {
    if (!item?.url) { setError('图片无效'); return []; }
    const expectedCount = Math.max(2, Math.min(12, Number(count || item.collectionCount) || 6));
    setError('');
    setSplittingIds((prev) => new Set(prev).add(item.id));
    try {
      const { pieces } = await splitStickerCollection(item.url, {
        expectedCount,
        backgroundColor: 'white',
        hasStickerBorder: false,
      });
      if (!pieces.length) {
        setError('未检测到可拆分的贴纸，请尝试用其他集合图');
        return [];
      }
      setResult({ pieces, sourcePrompt: item.prompt || '', sourceId: item.id });
      return pieces;
    } catch (err) {
      setError(`拆分失败：${err?.message || err}`);
      return [];
    } finally {
      setSplittingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  }, []);

  const clearResult = React.useCallback(() => setResult(null), []);
  const clearError = React.useCallback(() => setError(''), []);

  return { splittingIds, error, result, setResult, clearResult, split, clearError };
}
