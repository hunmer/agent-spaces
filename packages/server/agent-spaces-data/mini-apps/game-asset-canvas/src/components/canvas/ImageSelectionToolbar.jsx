import { SquarePen, Scissors, ZoomIn, X } from '@agent-spaces/ui';

/**
 * 画布顶部「图片选中浮出 toolbar」：跨节点选中图片数 > 0 时居中浮出。
 * - 显示选中数量
 * - 编辑：把选中图片 url 并集喂给 EditImage 表单（onEditImages）
 * - 抠图：新建抠图节点并预填选中图（onCutoutCreate）
 * - 放大：对选中图执行 enhance 工作流（onProcessImage）
 * - 取消选择：清空选中
 *
 * 定位顶部居中（与底部 MultiSelectToolbar 错开，两者可同时显示）。
 * 用 nodrag nopan 屏蔽画布交互（点击工具条不触发框选/平移）。
 *
 * @param {object} props
 * @param {number} props.selectedCount 选中图片数
 * @param {string[]} props.selectedUrls 选中图片 url 去重数组
 * @param {(urls:string[])=>void} props.onEditImages 编辑回调
 * @param {(urls:string[])=>void} props.onCutoutCreate 抠图回调
 * @param {(urls:string[], processType:string)=>void} props.onProcessImage 处理回调（放大）
 * @param {()=>void} props.onClear 清空选中
 */
export default function ImageSelectionToolbar({
  selectedCount, selectedUrls, onEditImages, onCutoutCreate, onProcessImage, onClear,
}) {
  if (!(selectedCount > 0)) return null;

  const baseBtn = 'flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition';
  const labelBtn = `${baseBtn} border-border bg-background text-foreground hover:border-primary hover:text-primary`;
  const urls = selectedUrls || [];

  return (
    <div className="nodrag nopan pointer-events-auto absolute left-1/2 top-4 z-20 -translate-x-1/2">
      <div className="flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1.5 text-card-foreground shadow-md">
        <span className="px-1 text-xs text-muted-foreground">已选 {selectedCount} 张</span>
        <div className="mx-1 h-4 w-px bg-border" />

        <button
          type="button"
          onClick={() => onEditImages(urls)}
          className={labelBtn}
          disabled={!urls.length}
        >
          <SquarePen className="h-3.5 w-3.5" />
          编辑
        </button>

        <button
          type="button"
          onClick={() => onCutoutCreate(urls)}
          className={labelBtn}
          disabled={!urls.length}
        >
          <Scissors className="h-3.5 w-3.5" />
          抠图
        </button>

        <button
          type="button"
          onClick={() => onProcessImage(urls, 'enhance')}
          className={labelBtn}
          disabled={!urls.length}
        >
          <ZoomIn className="h-3.5 w-3.5" />
          放大
        </button>

        <div className="mx-1 h-4 w-px bg-border" />
        <button
          type="button"
          onClick={onClear}
          title="取消选择"
          className="flex items-center justify-center rounded-md border border-border bg-background p-1 text-muted-foreground transition hover:border-destructive hover:text-destructive"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
