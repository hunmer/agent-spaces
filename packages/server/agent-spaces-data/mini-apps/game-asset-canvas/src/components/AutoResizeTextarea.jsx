import { forwardRef, useCallback, useLayoutEffect, useRef } from 'react';

const AutoResizeTextarea = forwardRef(function AutoResizeTextarea({
  value,
  minHeight = 64,
  maxHeight = 300,
  onChange,
  style,
  ...props
}, forwardedRef) {
  const textareaRef = useRef(null);

  const setRef = useCallback((element) => {
    textareaRef.current = element;
    if (typeof forwardedRef === 'function') forwardedRef(element);
    else if (forwardedRef) forwardedRef.current = element;
  }, [forwardedRef]);

  const resize = useCallback((element) => {
    if (!element) return;
    element.style.height = 'auto';
    const nextHeight = Math.min(maxHeight, Math.max(minHeight, element.scrollHeight));
    element.style.height = `${nextHeight}px`;
    element.style.overflowY = element.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [minHeight, maxHeight]);

  useLayoutEffect(() => {
    resize(textareaRef.current);
  }, [resize, value]);

  return (
    <textarea
      {...props}
      ref={setRef}
      value={value}
      onChange={(event) => {
        resize(event.currentTarget);
        onChange?.(event);
      }}
      style={{ ...style, minHeight, maxHeight, resize: 'none' }}
    />
  );
});

export default AutoResizeTextarea;
