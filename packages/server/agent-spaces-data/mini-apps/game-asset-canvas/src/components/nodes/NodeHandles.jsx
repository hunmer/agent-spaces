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
            style={{ top: -HANDLE_OFFSET, left: '50%', zIndex: 50 }}
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
