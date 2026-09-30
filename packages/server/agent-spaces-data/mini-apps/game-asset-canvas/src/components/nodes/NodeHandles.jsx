import { Position } from '@xyflow/react';
import FloatingHandle from './FloatingHandle';

const HANDLE_OFFSET = 18;
const INPUT_COLOR = '#3b82f6';
const OUTPUT_COLOR = '#10b981';

export default function NodeHandles({
  target = false,
  source = false,
  targetLeft = target,
  targetTop = target,
  sourceRight = source,
  sourceBottom = source,
  // 顶部 handle 默认悬在顶边上方 18px；带上方名称徽标的节点可上移避开徽标
  targetTopOffset = -HANDLE_OFFSET,
}) {
  return (
    <>
      {targetLeft && (
          <FloatingHandle
            type="target"
            position={Position.Left}
            accentColor={INPUT_COLOR}
            aria-label="节点输入"
            style={{ left: -HANDLE_OFFSET, zIndex: 50 }}
          />
      )}
      {targetTop && (
          <FloatingHandle
            id="target-top"
            type="target"
            position={Position.Top}
            accentColor={INPUT_COLOR}
            aria-label="节点输入（顶部）"
            style={{ top: targetTopOffset, left: '50%', zIndex: 50 }}
          />
      )}
      {sourceRight && (
          <FloatingHandle
            type="source"
            position={Position.Right}
            accentColor={OUTPUT_COLOR}
            aria-label="节点输出"
            style={{ right: -HANDLE_OFFSET, zIndex: 50 }}
          />
      )}
      {sourceBottom && (
          <FloatingHandle
            id="source-bottom"
            type="source"
            position={Position.Bottom}
            accentColor={OUTPUT_COLOR}
            aria-label="节点输出（底部）"
            style={{ bottom: -HANDLE_OFFSET, left: '50%', zIndex: 50 }}
          />
      )}
    </>
  );
}
