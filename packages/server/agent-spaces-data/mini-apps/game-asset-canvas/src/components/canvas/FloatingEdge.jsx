import { EdgeLabelRenderer, getBezierPath, getSmoothStepPath } from '@xyflow/react';
import { Plus, Trash2 } from '@agent-spaces/ui';

export default function FloatingEdge({
  id,
  sourceX, sourceY, sourcePosition,
  targetX, targetY, targetPosition,
  markerStart, markerEnd, style, className, interactionWidth, data, label,
  selected: edgeSelected,
}) {
  const [path, labelX, labelY] = getAutoEdgePath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  });
  const selected = edgeSelected === true || data?.selected === true;
  const canEdit = data?.canEditEdge !== false;
  const dispatchEdgeAction = (type) => {
    window.dispatchEvent(new CustomEvent(type, {
      detail: { edgeId: id, source: data?.source, target: data?.target, sourceHandle: data?.sourceHandle, x: labelX, y: labelY },
    }));
  };
  const labelWidth = Math.max(42, String(label || '').length * 12 + 10);
  return (
    <>
      <path
        id={id}
        d={path}
        fill="none"
        markerStart={markerStart}
        markerEnd={markerEnd}
        style={{ ...(withoutDash(style) || {}), strokeDasharray: data?.lineStyle === 'dashed' ? '6 4' : 'none' }}
        className={`react-flow__edge-path${className ? ` ${className}` : ''}`}
      />
      <path
        d={path}
        fill="none"
        strokeOpacity={0}
        strokeWidth={interactionWidth ?? 20}
        className="react-flow__edge-interaction"
        onClick={(event) => {
          window.dispatchEvent(new CustomEvent('workflow:select-edge', { detail: { edgeId: id } }));
        }}
      />
      {selected && canEdit && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan flex items-center gap-1 rounded-md border border-border bg-background p-1 shadow-md"
            style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: 'all' }}
          >
            <button type="button" title="添加中间节点" aria-label="添加中间节点" className="flex h-6 items-center gap-1 rounded px-1.5 text-xs hover:bg-accent" onClick={(e) => { e.stopPropagation(); dispatchEdgeAction('workflow:edge-insert-node'); }}>
              <Plus className="h-3.5 w-3.5" />添加中间节点
            </button>
            <button type="button" title="删除连接" aria-label="删除连接" className="flex h-6 items-center gap-1 rounded px-1.5 text-xs text-destructive hover:bg-destructive/10" onClick={(e) => { e.stopPropagation(); dispatchEdgeAction('workflow:delete-edge'); }}>
              <Trash2 className="h-3.5 w-3.5" />删除连接
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
      {label && (
        <g pointerEvents="none">
          <rect
            x={labelX - labelWidth / 2}
            y={labelY - 10}
            width={labelWidth}
            height={20}
            rx={4}
            fill="var(--background)"
            stroke={data?.highlightColor || 'var(--border)'}
          />
          <text
            x={labelX}
            y={labelY}
            dominantBaseline="central"
            textAnchor="middle"
            fill={data?.highlightColor || 'var(--foreground)'}
            fontSize={11}
            fontWeight={600}
          >
            {label}
          </text>
        </g>
      )}
    </>
  );
}

function withoutDash(style) {
  if (!style?.strokeDasharray && !style?.['stroke-dasharray']) return style;
  const next = { ...style };
  delete next.strokeDasharray;
  delete next['stroke-dasharray'];
  return next;
}

export function getAutoEdgePath({
  sourceX, sourceY, sourcePosition,
  targetX, targetY, targetPosition,
}) {
  const isDirect = Math.abs(sourceX - targetX) > 100
    && Math.abs(sourceY - targetY) > 80;
  const options = {
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  };
  return isDirect
    ? getSmoothStepPath({ ...options, borderRadius: 18 })
    : getBezierPath(options);
}
