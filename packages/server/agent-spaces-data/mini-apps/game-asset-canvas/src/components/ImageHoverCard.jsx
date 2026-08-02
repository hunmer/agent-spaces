import { useEffect, useState } from 'react';
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from '@agent-spaces/ui';

/**
 * 通用「缩略图 + HoverCard 大图预览」组件，供右侧栏历史记录、素材库、提示词 references 复用。
 *
 * - trigger 容器：固定 aspect-square + border + rounded；由 children 渲染缩略图本体与右上角操作按钮。
 * - HoverCard：受控 + delay=500ms；内容展示原图（≤320×320），可选 title 副标题。
 * - 拖拽场景下 children 内部自行 setHoverOpen(false)，通过 onHoverOpenChange 透传受控状态。
 *
 * @param {{
 *   url: string,                       // 大图 URL（HoverCard 内容用）
 *   title?: string,                    // HoverCard 内的副标题；空则不渲染
 *   className?: string,                // trigger 容器额外 className（默认 aspect-square）
 *   hoverDelay?: number,               // HoverCard 显示延迟 ms（默认 500）
 *   onDragStart?: (e:Event)=>void,     // 透传到 trigger 容器（便于拖拽时关 HoverCard）
 *   children: React.ReactNode,         // trigger 内部内容（缩略图 + 角标按钮）
 *   onOpenChange?: (open:boolean)=>void,
 *   renderTrigger?: (ctx:{hoverOpen:boolean, setHoverOpen:(v:boolean)=>void}) => React.ReactNode
 * }} props
 *
 * renderTrigger 用法：调用方可拿到受控 hoverOpen 状态（拖拽 handler 里 setHoverOpen(false)）；
 * 不传则直接渲染 children（children 内部无法直接关 HoverCard，适合纯展示场景）。
 */
/**
 * @param {{
 *   url: string,                       // 大图 URL（HoverCard 内容用）
 *   title?: string,                    // HoverCard 内的副标题；空则不渲染
 *   className?: string,                // trigger 容器额外 className
 *   triggerShape?: 'square'|'fixed',   // 'square'(默认 aspect-square) | 'fixed'(不强制形状，配合 className 的 w/h)
 *   hoverDelay?: number,               // HoverCard 显示延迟 ms（默认 500）
 *   closeOnScroll?: boolean,           // 任意祖先滚动时立即关闭
 *   onDragStart?: (e:Event)=>void,
 *   children: React.ReactNode,
 *   onOpenChange?: (open:boolean)=>void,
 *   renderTrigger?: (ctx:{hoverOpen:boolean, setHoverOpen:(v:boolean)=>void}) => React.ReactNode
 * }} props
 */
export default function ImageHoverCard({
  url,
  title,
  className,
  triggerShape = 'square',
  hoverDelay = 500,
  closeOnScroll = false,
  onOpenChange,
  renderTrigger,
  children,
}) {
  const [hoverOpen, setHoverOpen] = useState(false);

  const handleOpenChange = (open) => {
    setHoverOpen(open);
    onOpenChange?.(open);
  };

  useEffect(() => {
    if (!hoverOpen || !closeOnScroll || typeof document === 'undefined') return;
    const handleScroll = () => {
      setHoverOpen(false);
      onOpenChange?.(false);
    };
    document.addEventListener('scroll', handleScroll, true);
    return () => document.removeEventListener('scroll', handleScroll, true);
  }, [closeOnScroll, hoverOpen, onOpenChange]);

  const triggerContent = renderTrigger
    ? renderTrigger({ hoverOpen, setHoverOpen: handleOpenChange })
    : children;

  const shapeClass = triggerShape === 'fixed' ? '' : 'aspect-square ';

  return (
    <HoverCard open={hoverOpen} onOpenChange={handleOpenChange}>
      <HoverCardTrigger
        delay={hoverDelay}
        render={
          <div
            className={
              'group relative overflow-visible rounded border border-border '
              + shapeClass
              + (className || '')
            }
          >
            {triggerContent}
          </div>
        }
      />
      <HoverCardContent className="flex max-w-[500px] w-auto flex-col items-center p-1">
        <img
          src={url}
          alt={title || ''}
          className="max-h-[320px] max-w-[320px] rounded object-contain"
        />
        {title && (
          <p className="mt-1 max-w-[320px] truncate text-[11px] text-muted-foreground">{title}</p>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
