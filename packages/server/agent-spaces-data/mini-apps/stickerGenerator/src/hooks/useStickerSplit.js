// 贴纸集合一键拆分：浏览器端 Canvas 处理 → 子贴纸落库
import { splitStickerCollection } from '../utils/imageSplit';

export function useStickerSplit() {
  const AS = window.AgentSpaces;
  const [splittingIds, setSplittingIds] = React.useState(new Set());
  const [error, setError] = React.useState('');
  const [lastResult, setLastResult] = React.useState(null); // { sourceId, count }

  // 拆分单张贴纸集合图，返回是否成功
  // item: 历史记录项 { id, url, prompt, model, styleName }
  const split = React.useCallback(async (item) => {
    if (!item?.url) { setError('图片无效'); return false; }
    setError('');
    setSplittingIds((prev) => new Set(prev).add(item.id));
    try {
      const { pieces } = await splitStickerCollection(item.url, {
        expectedCount: 6,
        backgroundColor: 'white',
        hasStickerBorder: false,
      });
      if (!pieces.length) {
        setError('未检测到可拆分的贴纸，请尝试用其他集合图');
        return false;
      }
      await AS.invokeService('add_split_pieces', {
        items: pieces.map((p) => ({ url: p.dataUrl })),
        sourceId: item.id,
        prompt: item.prompt,
        model: item.model,
        styleName: item.styleName,
      });
      setLastResult({ sourceId: item.id, count: pieces.length });
      return true;
    } catch (err) {
      setError(`拆分失败：${err?.message || err}`);
      return false;
    } finally {
      setSplittingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  }, [AS]);

  const clearError = React.useCallback(() => setError(''), []);

  return { splittingIds, error, lastResult, split, clearError };
}
