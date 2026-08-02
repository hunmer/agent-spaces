/**
 * 画布图片全屏预览的统一入口（包装宿主 openMediaGallery）。
 *
 * 为什么需要这层包装：
 *  - 宿主 openMediaGallery 已支持「右上角自定义按钮」(actions)，见 media-gallery.tsx。
 *  - 但「收藏到素材库 / 导入到画布」两个动作的底层能力（handleAddToAssets 走分组选择器、
 *    addImageNodesFromUrls 走节点 setter）都住在 Canvas.jsx 的 React 状态里，纯工具函数拿不到。
 *  - 所以用 Context：Canvas 装配阶段用真实回调构造一个带 actions 的 openCanvasGallery，
 *    经 Provider 注入，各组件用 useCanvasGallery() 取用，替换原 openMediaGallery 调用。
 *
 * 调用方约定：openCanvasGallery(items, startIndex) 与原 openMediaGallery(items, startIndex) 签名一致，
 * 第三个 actions 参数由本层固定注入，调用方无需关心。
 */
import { openMediaGallery } from '@agent-spaces/ui';

const CanvasGalleryContext = React.createContext(null);

/**
 * 取当前画布的图片预览入口。
 * 返回 (items, startIndex) => void；items 是 MediaItem[]（同宿主 openMediaGallery）。
 * 必须在 <CanvasGalleryContext.Provider> 内调用。
 */
export function useCanvasGallery() {
  const fn = React.useContext(CanvasGalleryContext);
  // 兜底：若意外在 Provider 外调用，退化为无 actions 的原生预览（不阻断功能）。
  return React.useCallback(
    (items, startIndex = 0) => {
      if (fn) return fn(items, startIndex);
      return openMediaGallery(items, startIndex);
    },
    [fn],
  );
}

export const CanvasGalleryContextProvider = CanvasGalleryContext.Provider;
