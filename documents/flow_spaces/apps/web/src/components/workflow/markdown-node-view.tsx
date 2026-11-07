'use client';

import { Markdown } from '@/components/ui/markdown';

interface MarkdownNodeViewProps {
  nodeId: string;
  data: Record<string, unknown>;
}

export function MarkdownNodeView({ data }: MarkdownNodeViewProps) {
  const content = typeof data.content === 'string' ? data.content : '';

  return (
    <div
      className="nodrag nopan h-full w-full overflow-auto rounded-md border border-border/60 bg-card/80 p-3 text-sm leading-relaxed shadow-sm"
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {content.trim() ? (
        <Markdown content={content} />
      ) : (
        <p className="text-sm text-muted-foreground/50">在属性面板输入 Markdown 内容...</p>
      )}
    </div>
  );
}
