'use client';

import './styles.css';

import Highlight from '@tiptap/extension-highlight';
import Typography from '@tiptap/extension-typography';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import React from 'react';
import { cn } from '@/lib/utils';
import { markdownToHtml } from '@/lib/converter';

interface MarkdownEditorProps {
  /** 初始内容，按 markdown 解析后注入 tiptap（与 notion-editor 一致，仅在挂载时生效） */
  contentMarkdown: string;
  /** 内容变更回调，回吐 tiptap 产出的 HTML */
  onChange: (html: string) => void;
  theme?: 'sans' | 'serif' | 'mono';
  /** 外壳高度：数字按 px，字符串原样传入（如 '100%'/'320px'）。默认 '100%' 撑满父容器。 */
  height?: number | string;
  /** 外壳附加 className（可覆盖默认圆角/边框等） */
  className?: string;
}

export default function MarkdownEditor({
  contentMarkdown, onChange, theme = 'sans', height = '100%', className,
}: MarkdownEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit, Highlight, Typography],
    content: markdownToHtml(contentMarkdown),
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  const heightStyle = typeof height === 'number' ? `${height}px` : height;

  return (
    <div
      className={cn(
        'w-full flex flex-col bg-background border border-border rounded-xl overflow-hidden',
        theme === 'serif' && 'font-serif',
        theme === 'mono' && 'font-mono',
        className,
      )}
      style={{ height: heightStyle }}
    >
      <EditorContent editor={editor} className="flex-1 min-h-0 overflow-y-auto px-6 py-6" />
    </div>
  );
}
