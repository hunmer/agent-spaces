'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import { useEditorStore } from '@/stores/editor';
import { useCallback } from 'react';

function looksLikeFilePath(href: string): boolean {
  if (!href.startsWith('/')) return false;
  if (href.startsWith('//')) return false;
  if (href.startsWith('/api/')) return false;
  return true;
}

function parseFileRef(href: string): { path: string; line?: number; column?: number } {
  const m = href.match(/^(.+?)(?::(\d+))?(?::(\d+))?$/);
  if (!m) return { path: href };
  return { path: m[1], line: m[2] ? parseInt(m[2]) : undefined, column: m[3] ? parseInt(m[3]) : undefined };
}

const staticComponents: Components = {
  pre: ({ children }) => (
    <pre className="my-2 max-w-full overflow-x-auto rounded-md bg-background/50 p-3 text-xs">{children}</pre>
  ),
  code: ({ className, children, ...props }) => {
    const isInline = !className;
    return isInline ? (
      <code className="bg-background/50 px-1 py-0.5 rounded text-xs font-mono" {...props}>
        {children}
      </code>
    ) : (
      <code className={className} {...props}>{children}</code>
    );
  },
  p: ({ children }) => <p className="mb-2 min-w-0 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-2 min-w-0 list-disc space-y-1 pl-4">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 min-w-0 list-decimal space-y-1 pl-4">{children}</ol>,
  li: ({ children }) => <li className="min-w-0 text-sm">{children}</li>,
  h1: ({ children }) => <h1 className="text-lg font-bold mb-2">{children}</h1>,
  h2: ({ children }) => <h2 className="text-base font-bold mb-2">{children}</h2>,
  h3: ({ children }) => <h3 className="text-sm font-bold mb-1">{children}</h3>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-muted-foreground/30 pl-3 my-2 text-muted-foreground">{children}</blockquote>
  ),
  table: ({ children }) => (
    <div className="my-2 min-w-0 max-w-full overflow-x-auto">
      <table className="w-max min-w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-muted px-2 py-1 bg-muted/50 font-semibold text-left">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border border-muted px-2 py-1">{children}</td>
  ),
};

interface MarkdownProps {
  content: string;
  workspaceId?: string;
}

export function Markdown({ content, workspaceId }: MarkdownProps) {
  const openFile = useEditorStore((s) => s.openFile);
  const jumpToPosition = useEditorStore((s) => s.jumpToPosition);

  const handleFileClick = useCallback(async (e: React.MouseEvent, href: string) => {
    e.preventDefault();
    if (!workspaceId) return;
    const { path, line, column } = parseFileRef(href);
    await openFile(workspaceId, path);
    if (line) await jumpToPosition(workspaceId, path, line, column);
  }, [workspaceId, openFile, jumpToPosition]);

  const components: Components = {
    ...staticComponents,
    a: ({ href, children }) => {
      if (href && workspaceId && looksLikeFilePath(href)) {
        return (
          <a
            href={href}
            onClick={(e) => handleFileClick(e, href)}
            className="text-primary underline hover:no-underline cursor-pointer"
          >
            {children}
          </a>
        );
      }
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:no-underline">
          {children}
        </a>
      );
    },
  };

  return (
    <div className="min-w-0 max-w-full break-all overflow-hidden select-text dark:!text-gray-200" style={{ WebkitUserSelect: 'text', userSelect: 'text' }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
