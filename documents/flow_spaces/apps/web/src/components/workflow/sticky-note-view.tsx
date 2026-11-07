'use client';

import { useCallback, useEffect, useState } from 'react';

interface StickyNoteViewProps {
  nodeId: string;
  data: Record<string, unknown>;
}

export function StickyNoteView({ nodeId, data }: StickyNoteViewProps) {
  const [content, setContent] = useState(
    typeof data.content === 'string' ? data.content : '',
  );

  useEffect(() => {
    const nextContent = typeof data.content === 'string' ? data.content : '';
    setContent(nextContent);
  }, [data.content]);

  const updateContent = useCallback((value: string) => {
    setContent(value);
    window.dispatchEvent(new CustomEvent('workflow:update-node-data', {
      detail: { nodeId, data: { content: value } },
    }));
  }, [nodeId]);

  return (
    <div
      className="nodrag nopan h-full w-full rounded border border-amber-300/60 bg-amber-50/95 p-2 text-sm leading-relaxed shadow-sm dark:border-amber-400/30 dark:bg-amber-950/40"
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <textarea
        value={content}
        onChange={(event) => updateContent(event.target.value)}
        className="h-full w-full resize-none bg-transparent text-sm text-foreground/90 outline-none placeholder:text-foreground/30"
        placeholder="输入备注..."
      />
    </div>
  );
}
