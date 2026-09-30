import { useCallback, useState } from 'react';
import { NodeResizer } from '@xyflow/react';
import { ClipboardCopy, MarkdownEditor, toast } from '@agent-spaces/ui';
import NodeHandles from './NodeHandles';
import NodeHoverMenu from './NodeHoverMenu';
import NodeTopBadge from './NodeTopBadge';
import { NODE_TYPES } from '../../utils/constants';

/**
 * 文字节点：无边框铺满式（结构对标图片/视频/音频展示节点）。
 *
 * - 顶部一条窄的自定义拖拽 handle（.text-drag-handle，配合 useDecoratedNodes 的 dragHandle 映射）
 * - Markdown 编辑器铺满节点（rounded + ring 同音频节点），内容存 data.output.text（可连线文本产物）
 * - 上方名称徽标：显示/编辑节点名称（拖入 txt 时为文件名）
 */
export default function TextNode({ id, data, selected }) {
  const text = typeof data?.output?.text === 'string' ? data.output.text : '';
  const onUpdate = data?.onUpdate;
  const [menuOpen, setMenuOpen] = useState(false);
  const [nodeHovered, setNodeHovered] = useState(false);
  const handleChange = useCallback((nextText) => {
    onUpdate?.({ output: { ...(data?.output || {}), text: nextText } });
  }, [data?.output, onUpdate]);

  const handleCopyNodeInfo = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(data?.nodeJson || JSON.stringify({ id, type: NODE_TYPES.text, data }, null, 2));
      toast.success('已复制节点信息');
    } catch {
      toast.error('复制节点信息失败');
    } finally {
      setMenuOpen(false);
    }
  }, [data, id]);

  return (
    <div
      className="group relative h-full w-full overflow-visible"
      onMouseEnter={() => setNodeHovered(true)}
      onMouseLeave={() => setNodeHovered(false)}
    >
      <NodeTopBadge
        title={data?.title}
        fallback={data?.label || '文字'}
        onRename={(title) => onUpdate?.({ title })}
      />

      <NodeHoverMenu
        actions={[{
          key: 'copy-node-info',
          label: '复制节点信息',
          icon: <ClipboardCopy className="h-3.5 w-3.5" />,
          onClick: handleCopyNodeInfo,
        }]}
        visible={nodeHovered || menuOpen}
        open={menuOpen}
        onOpenChange={setMenuOpen}
        onDelete={data?.onDeleteNode}
      />

      <NodeResizer
        isVisible={!!selected}
        minWidth={220}
        minHeight={120}
        color="#6366f1"
        handleClassName="!w-2.5 !h-2.5 !rounded-sm !border-2 !border-background"
        lineClassName="!border-primary/40"
      />

      <NodeHandles sourceRight sourceBottom />

      {/* 顶部自定义拖拽 handle（同媒体节点：透明窄条，hover 显现） */}
      <div
        className="text-drag-handle absolute left-0 right-0 top-0 z-10 h-5 cursor-move opacity-0 transition group-hover:opacity-100"
        title="拖拽移动"
      >
        <div className="mx-auto mt-1 h-1 w-8 rounded-full bg-foreground/30" />
      </div>

      {/* 编辑主体：铺满节点。宿主 MarkdownEditor 自带卡片外壳（bg-background + border + rounded-xl），
          用 className 中和为无边框透明（border-0/rounded-none/bg-transparent 均已存在于宿主 Tailwind 编译产物），
          只保留这一层 bg-card 平面，避免双层卡片观感。 */}
      <div className="text-drag-handle absolute inset-0 overflow-hidden rounded-lg bg-card">
        <MarkdownEditor
          contentMarkdown={text}
          onChange={handleChange}
          height="100%"
          className="nodrag nopan nowheel h-full border-0 rounded-none bg-transparent"
        />
      </div>

      {data?.error && (
        <p className="absolute bottom-1.5 left-1.5 right-1.5 z-30 rounded bg-red-500/90 px-2 py-1 text-xs text-white">{data.error}</p>
      )}
    </div>
  );
}
