import { useState } from 'react';
import { Handle } from '@xyflow/react';

const DOT_SIZE = 8;
const HOVER_SIZE = 22;

export default function FloatingHandle({ style, accentColor = 'var(--primary)', ...props }) {
  const [hovered, setHovered] = useState(false);
  const size = hovered ? HOVER_SIZE : `var(--floating-handle-size, ${DOT_SIZE}px)`;

  return (
    <Handle
      {...props}
      data-floating-handle
      isConnectableStart={props.type === 'target' ? false : props.isConnectableStart}
      onMouseEnter={(event) => {
        event.stopPropagation();
        setHovered(true);
      }}
      onMouseLeave={(event) => {
        event.stopPropagation();
        setHovered(false);
      }}
      style={{
        ...style,
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        opacity: 'var(--floating-handle-opacity, 1)',
        visibility: 'var(--floating-handle-visibility, visible)',
        pointerEvents: 'var(--floating-handle-pointer-events, auto)',
        border: `2px solid ${hovered ? 'var(--background)' : accentColor}`,
        background: hovered ? accentColor : 'var(--background)',
        boxShadow: hovered
          ? `0 4px 12px ${accentColor}66`
          : `0 1px 5px ${accentColor}55`,
        zIndex: 50,
        cursor: 'crosshair',
        transition: 'width 150ms ease, height 150ms ease, min-width 150ms ease, min-height 150ms ease, border-color 150ms ease, box-shadow 150ms ease',
      }}
    />
  );
}
