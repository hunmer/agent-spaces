const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function resolveFrameSelection(frameCount, selection) {
  const count = Math.max(0, Math.floor(Number(frameCount) || 0));
  if (!count) return { startFrame: 0, endFrame: 0 };
  const maxIndex = count - 1;
  const rawStart = Number(selection?.startFrame);
  const rawEnd = Number(selection?.endFrame);
  return {
    startFrame: clamp(Number.isFinite(rawStart) ? Math.floor(rawStart) : 0, 0, maxIndex),
    endFrame: clamp(Number.isFinite(rawEnd) ? Math.floor(rawEnd) : maxIndex, 0, maxIndex),
  };
}

export function updateFrameSelection(selection, frameIndex, setEnd) {
  const index = Math.max(0, Math.floor(Number(frameIndex) || 0));
  if (setEnd) return { startFrame: selection.startFrame, endFrame: index };
  return {
    startFrame: index,
    endFrame: selection.endFrame < index ? index : selection.endFrame,
  };
}
