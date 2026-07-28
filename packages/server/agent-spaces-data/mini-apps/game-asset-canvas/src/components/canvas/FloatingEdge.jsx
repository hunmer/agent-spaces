import { getBezierPath } from '@xyflow/react';

export default function FloatingEdge({
  id,
  sourceX, sourceY, sourcePosition,
  targetX, targetY, targetPosition,
  markerStart, markerEnd, style, className, interactionWidth,
}) {
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  return (
    <>
      <path
        id={id}
        d={path}
        fill="none"
        markerStart={markerStart}
        markerEnd={markerEnd}
        style={style}
        className={`react-flow__edge-path${className ? ` ${className}` : ''}`}
      />
      <path
        d={path}
        fill="none"
        strokeOpacity={0}
        strokeWidth={interactionWidth ?? 20}
        className="react-flow__edge-interaction"
      />
    </>
  );
}
