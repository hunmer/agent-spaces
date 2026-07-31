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
}

export default function MarkdownEditor({ contentMarkdown, onChange, theme = 'sans' }: MarkdownEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit, Highlight, Typography],
    content: markdownToHtml(contentMarkdown),
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  return (
    <div className={cn(
      'w-full flex flex-col h-[550px] lg:h-[650px] bg-background border border-border rounded-xl overflow-hidden',
      theme === 'serif' && 'font-serif',
      theme === 'mono' && 'font-mono',
    )}>
      <EditorContent editor={editor} className="flex-1 min-h-0 overflow-y-auto px-6 py-6" />
    </div>
  );
}
