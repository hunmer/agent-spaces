import { Position } from '@xyflow/react';

export const FLOATING_HANDLE_OFFSET = 18;

export function getFloatingHandleProps(direction, type) {
  const vertical = direction !== 'left-right';
  const position = vertical
    ? (type === 'target' ? Position.Top : Position.Bottom)
    : (type === 'target' ? Position.Left : Position.Right);
  return {
    position,
    style: { [position]: -FLOATING_HANDLE_OFFSET, zIndex: 50 },
  };
}
