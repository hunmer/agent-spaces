import React, { useCallback, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Palette } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { NODE_COLORS, NODE_COLOR_MAP } from './workflow-node-types';
import { getHandleStyle, type HandleContext } from './workflow-node-handles';

export type DispatchNodeUpdate = (updates: Record<string, unknown>) => void;
export type TranslationFn = (key: string) => string;

/**
 * source handle 颜色菜单 + popover 渲染 + source handle 样式计算。
 *
 * 把主组件里围绕 handleColors / handleColorMenuId 的一组 useCallback 与状态收敛到此 hook，
 * 行为与原内联实现完全一致。
 */
export function useWorkflowNodeHandles(params: {
  isCanvasLocked: boolean;
  handleColors: Record<string, string>;
  handleCtx: HandleContext;
  dispatchNodeUpdate: DispatchNodeUpdate;
  t: TranslationFn;
}) {
  const { isCanvasLocked, handleColors, handleCtx, dispatchNodeUpdate, t } = params;
  const [handleColorMenuId, setHandleColorMenuId] = useState<string | null>(null);

  const getSourceHandleColor = useCallback((handleId: string, fallback: string) => {
    const colorKey = handleColors[handleId];
    return colorKey ? NODE_COLOR_MAP[colorKey] ?? fallback : fallback;
  }, [handleColors]);

  const getSourceHandleStyle = useCallback((
    handleId: string,
    fallback: string,
    position: Position,
    index: number,
    total: number,
  ): React.CSSProperties => {
    const color = getSourceHandleColor(handleId, fallback);
    return {
      ...getHandleStyle(position, index, total, handleCtx),
      backgroundColor: color,
      borderColor: color,
      borderWidth: '2px',
    };
  }, [getSourceHandleColor, handleCtx]);

  const openHandleColorMenu = useCallback((event: React.MouseEvent, handleId: string) => {
    if (isCanvasLocked) return;
    event.preventDefault();
    event.stopPropagation();
    setHandleColorMenuId(handleId);
  }, [isCanvasLocked]);

  const setHandleColor = useCallback((handleId: string, color: string | null) => {
    const nextColors = { ...handleColors };
    if (color) {
      nextColors[handleId] = color;
    } else {
      delete nextColors[handleId];
    }
    dispatchNodeUpdate({ handleColors: nextColors });
    setHandleColorMenuId(null);
  }, [dispatchNodeUpdate, handleColors]);

  const renderHandleColorPopover = useCallback((handleId: string, trigger: React.ReactElement) => (
    <Popover
      open={handleColorMenuId === handleId}
      onOpenChange={(open) => {
        if (!open && handleColorMenuId === handleId) setHandleColorMenuId(null);
      }}
    >
      <PopoverTrigger render={trigger} nativeButton={false} />
      <PopoverContent
        side="right"
        align="center"
        sideOffset={8}
        className="nodrag nopan w-40 gap-0 p-1"
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        <div className="flex items-center gap-1.5 px-1.5 py-1 text-xs font-medium text-muted-foreground">
          <Palette className="h-3 w-3" />
          颜色
        </div>
        {NODE_COLORS.map(color => (
          <button
            key={color.value ?? 'default'}
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs hover:bg-accent hover:text-accent-foreground"
            onClick={(event) => {
              event.stopPropagation();
              setHandleColor(handleId, color.value);
            }}
          >
            <span className={cn('h-3.5 w-3.5 shrink-0 rounded-sm', color.className)} />
            {t(color.label)}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  ), [handleColorMenuId, setHandleColor, t]);

  return {
    handleColorMenuId,
    setHandleColorMenuId,
    getSourceHandleColor,
    getSourceHandleStyle,
    openHandleColorMenu,
    setHandleColor,
    renderHandleColorPopover,
  };
}

/**
 * 兼容性占位 handle：不可见、不可连，仅用于让 React Flow 注册 handle id 以保证连线对齐。
 */
export function CompatibilityHandle(props: {
  handleId: string;
  handleType: 'target' | 'source';
  position: Position;
  index: number;
  total: number;
  handleCtx: HandleContext;
}) {
  const { handleId, handleType, position, index, total, handleCtx } = props;
  return (
    <Handle
      key={`${handleType}-${handleId}`}
      id={handleId}
      type={handleType}
      position={position}
      isConnectable={false}
      className="!pointer-events-none !opacity-0 !border-0 !bg-transparent"
      style={{
        ...getHandleStyle(position, index, total, handleCtx),
        width: 1,
        height: 1,
      }}
    />
  );
}
