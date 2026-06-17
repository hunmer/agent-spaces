'use client';

import React, { useState, useRef } from 'react';
import { Split, Eye, Edit3, Heading, Bold, Italic, Strikethrough, List, ListOrdered, CheckSquare, Code, Quote, Table, Link, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { markdownToHtml } from '@/lib/converter';

interface MarkdownEditorProps {
  contentMarkdown: string;
  onChange: (md: string) => void;
  theme?: 'sans' | 'serif' | 'mono';
}

export default function MarkdownEditor({ contentMarkdown, onChange, theme = 'sans' }: MarkdownEditorProps) {
  const [viewMode, setViewMode] = useState<'split' | 'edit' | 'preview'>('split');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const handleScroll = (e: React.UIEvent<HTMLElement>) => {
    if (viewMode !== 'split') return;
    const source = e.currentTarget;
    const target = source.tagName.toLowerCase() === 'textarea' ? previewRef.current : textareaRef.current;
    if (!target) return;
    const pct = source.scrollTop / (source.scrollHeight - source.clientHeight);
    target.scrollTop = pct * (target.scrollHeight - target.clientHeight);
  };

  const insert = (before: string, after = '', placeholder = '') => {
    const ta = textareaRef.current;
    if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd, text = ta.value;
    const sel = text.substring(s, e) || placeholder;
    const nv = text.substring(0, s) + before + sel + after + text.substring(e);
    onChange(nv);
    setTimeout(() => { ta.focus(); ta.setSelectionRange(s + before.length, s + before.length + sel.length); }, 0);
  };

  const btn = (onClick: () => void, title: string, icon: React.ReactNode) => (
    <button type="button" onClick={onClick} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer" title={title}>{icon}</button>
  );

  const previewHtml = markdownToHtml(contentMarkdown);

  return (
    <div className="w-full flex flex-col h-[550px] lg:h-[650px] bg-background border border-border rounded-xl overflow-hidden">
      <div className="bg-background border-b border-border px-3 py-2 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
        {/* eslint-disable react-hooks/refs -- insert() only runs on click, not during render */}
        <div className="flex flex-wrap items-center gap-1">
          {btn(() => insert('### ', '', '小标题'), '标题', <Heading className="w-4 h-4" />)}
          {btn(() => insert('**', '**', '加粗'), '加粗', <Bold className="w-4 h-4" />)}
          {btn(() => insert('*', '*', '斜体'), '斜体', <Italic className="w-4 h-4" />)}
          {btn(() => insert('~~', '~~', '删除线'), '删除线', <Strikethrough className="w-4 h-4" />)}
          <div className="w-[1px] h-4 bg-border mx-1" />
          {btn(() => insert('- ', '', '项目一'), '无序列表', <List className="w-4 h-4" />)}
          {btn(() => insert('1. ', '', '项目一'), '有序列表', <ListOrdered className="w-4 h-4" />)}
          {btn(() => insert('- [ ] ', '', '任务'), '任务列表', <CheckSquare className="w-4 h-4" />)}
          <div className="w-[1px] h-4 bg-border mx-1" />
          {btn(() => insert('`', '`', 'code'), '行内代码', <Code className="w-4 h-4" />)}
          {btn(() => insert('```js\n', '\n```', 'code'), '代码块', <span className="font-mono text-xs font-bold">&lt;/&gt;</span>)}
          {btn(() => insert('> ', '', '引用'), '引用', <Quote className="w-4 h-4" />)}
          {btn(() => insert('| 标题1 | 标题2 |\n| ---- | ---- |\n| 单元格1 | 单元格2 |'), '表格', <Table className="w-4 h-4" />)}
          {btn(() => insert('[', '](url)', '链接'), '链接', <Link className="w-4 h-4" />)}
        </div>
        {/* eslint-enable react-hooks/refs */}
        <div className="flex items-center gap-1 bg-card p-1 rounded-lg shrink-0">
          {(['edit', 'split', 'preview'] as const).map(m => (
            <button key={m} type="button" onClick={() => setViewMode(m)}
              className={cn("flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer",
                viewMode === m ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {m === 'edit' && <><Edit3 className="w-3.5 h-3.5" /><span className="hidden md:inline">编辑</span></>}
              {m === 'split' && <><Split className="w-3.5 h-3.5" /><span className="hidden md:inline">分屏</span></>}
              {m === 'preview' && <><Eye className="w-3.5 h-3.5" /><span className="hidden md:inline">预览</span></>}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 flex w-full min-h-0">
        {(viewMode === 'edit' || viewMode === 'split') && (
          <div className={cn("h-full flex flex-col min-w-0 flex-1 relative border-r border-border", viewMode === 'edit' ? "w-full" : "w-1/2")}>
            <textarea ref={textareaRef} value={contentMarkdown} onChange={(e) => onChange(e.target.value)} onScroll={handleScroll}
              className={cn("w-full h-full p-6 text-foreground font-mono text-sm leading-relaxed focus:outline-none resize-none bg-background overflow-y-auto",
                theme === 'serif' && 'font-serif', theme === 'mono' && 'font-mono text-xs')} />
          </div>
        )}
        {(viewMode === 'preview' || viewMode === 'split') && (
          <div ref={previewRef} onScroll={handleScroll}
            className={cn("h-full overflow-y-auto px-6 py-6 bg-background min-w-0 flex-1 prose max-w-none",
              viewMode === 'preview' ? "w-full" : "w-1/2")}>
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-border text-muted-foreground font-mono text-[10px] uppercase tracking-wider sticky top-0 bg-background z-10">
              <span className="flex items-center gap-1"><BookOpen className="w-3 h-3 text-muted-foreground" /> Live Preview</span>
            </div>
            {previewHtml ? (
              <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: previewHtml }} />
            ) : (
              <div className="h-[90%] flex flex-col items-center justify-center text-muted-foreground/60 italic">预览内容为空</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
