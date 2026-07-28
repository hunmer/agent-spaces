import { useState } from 'react';
import { Handle } from '@xyflow/react';

const HANDLE_SIZE = 24;
const HOVER_SIZE = 32;

export default function FloatingHandle({ style, ...props }) {
  const [hovered, setHovered] = useState(false);
  const size = hovered ? HOVER_SIZE : HANDLE_SIZE;

  return (
    <Handle
      {...props}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...style,
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        cursor: 'crosshair',
        zIndex: 50,
        border: `2px solid ${hovered ? 'var(--primary)' : 'var(--muted-foreground)'}`,
        background: 'var(--background)',
        boxShadow: hovered
          ? '0 4px 12px rgb(0 0 0 / 0.24)'
          : '0 1px 4px rgb(0 0 0 / 0.18)',
        transition: 'width 150ms ease, height 150ms ease, min-width 150ms ease, min-height 150ms ease, border-color 150ms ease, box-shadow 150ms ease',
      }}
    />
  );
}
