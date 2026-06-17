'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import {
  Bold, Italic, Strikethrough, Heading1, Heading2, Heading3,
  List, ListOrdered, CheckSquare, Code, Quote, Minus,
  Undo, Redo, Plus, Keyboard
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NotionEditorProps {
  content: string;
  onChange: (html: string) => void;
  theme?: 'sans' | 'serif' | 'mono';
}

export default function NotionEditor({ content, onChange, theme = 'sans' }: NotionEditorProps) {
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashSearch, setSlashSearch] = useState('');
  const [menuIndex, setMenuIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: { HTMLAttributes: { class: 'bg-card text-foreground rounded-lg p-4 font-mono text-sm my-4 overflow-x-auto border border-border' } },
        blockquote: { HTMLAttributes: { class: 'border-l-4 border-muted-foreground/40 pl-4 py-1.5 italic my-4 text-muted-foreground bg-card/80 rounded-r-md' } },
        bulletList: { HTMLAttributes: { class: 'list-disc pl-6 my-4 space-y-1 text-foreground' } },
        orderedList: { HTMLAttributes: { class: 'list-decimal pl-6 my-4 space-y-1 text-foreground' } },
        horizontalRule: { HTMLAttributes: { class: 'border-t-2 border-border my-6' } },
      }),
      Placeholder.configure({ placeholder: "点击此处或输入 '/' 唤起快速块级排版样式..." }),
      TaskList.configure({ HTMLAttributes: { class: 'space-y-1.5 my-4 pl-1 list-none' } }),
      TaskItem.configure({ nested: true, HTMLAttributes: { class: 'flex items-start gap-3' } }),
    ],
    content,
    onUpdate: ({ editor: e }) => {
      onChange(e.getHTML());
      const { selection } = e.state;
      const textBefore = e.state.doc.textBetween(Math.max(0, selection.from - 10), selection.from, '\n', '\n');
      const si = textBefore.lastIndexOf('/');
      if (si !== -1 && si === textBefore.length - 1) { setSlashOpen(true); setSlashSearch(''); setMenuIndex(0); }
      else if (slashOpen) {
        const q = textBefore.slice(si + 1);
        if (q.includes(' ') || !textBefore.includes('/')) setSlashOpen(false);
        else setSlashSearch(q);
      }
    },
    editorProps: {
      attributes: {
        class: cn(
          'focus:outline-none min-h-[500px] w-full py-6 px-1 prose max-w-none',
          'prose-h1:text-3xl prose-h1:font-bold prose-h1:text-foreground prose-h1:mb-4 prose-h1:mt-6',
          'prose-h2:text-2xl prose-h2:font-semibold prose-h2:text-foreground prose-h2:mb-3 prose-h2:mt-5',
          'prose-h3:text-xl prose-h3:font-medium prose-h3:text-foreground prose-h3:mb-2 prose-h3:mt-4',
          'prose-p:text-base prose-p:leading-relaxed prose-p:text-foreground/80 prose-p:my-2.5',
          'prose-strong:text-foreground',
          theme === 'serif' && 'font-serif', theme === 'mono' && 'font-mono', theme === 'sans' && 'font-sans'
        ),
      },
    },
  });

  useEffect(() => { if (editor && content !== editor.getHTML()) editor.commands.setContent(content, { emitUpdate: false }); }, [content, editor]);

  const commands = [
    { title: '一级标题', icon: <Heading1 className="w-4 h-4 text-muted-foreground" />, action: () => { editor?.commands.deleteRange({ from: editor.state.selection.from - slashSearch.length - 1, to: editor.state.selection.from }); editor?.chain().focus().toggleHeading({ level: 1 }).run(); }, keywords: ['h1'] },
    { title: '二级标题', icon: <Heading2 className="w-4 h-4 text-muted-foreground" />, action: () => { editor?.commands.deleteRange({ from: editor.state.selection.from - slashSearch.length - 1, to: editor.state.selection.from }); editor?.chain().focus().toggleHeading({ level: 2 }).run(); }, keywords: ['h2'] },
    { title: '三级标题', icon: <Heading3 className="w-4 h-4 text-muted-foreground" />, action: () => { editor?.commands.deleteRange({ from: editor.state.selection.from - slashSearch.length - 1, to: editor.state.selection.from }); editor?.chain().focus().toggleHeading({ level: 3 }).run(); }, keywords: ['h3'] },
    { title: '无序列表', icon: <List className="w-4 h-4 text-muted-foreground" />, action: () => { editor?.commands.deleteRange({ from: editor.state.selection.from - slashSearch.length - 1, to: editor.state.selection.from }); editor?.chain().focus().toggleBulletList().run(); }, keywords: ['list'] },
    { title: '有序列表', icon: <ListOrdered className="w-4 h-4 text-muted-foreground" />, action: () => { editor?.commands.deleteRange({ from: editor.state.selection.from - slashSearch.length - 1, to: editor.state.selection.from }); editor?.chain().focus().toggleOrderedList().run(); }, keywords: ['ol'] },
    { title: '待办清单', icon: <CheckSquare className="w-4 h-4 text-muted-foreground" />, action: () => { editor?.commands.deleteRange({ from: editor.state.selection.from - slashSearch.length - 1, to: editor.state.selection.from }); editor?.chain().focus().toggleTaskList().run(); }, keywords: ['todo'] },
    { title: '代码块', icon: <Code className="w-4 h-4 text-muted-foreground" />, action: () => { editor?.commands.deleteRange({ from: editor.state.selection.from - slashSearch.length - 1, to: editor.state.selection.from }); editor?.chain().focus().toggleCodeBlock().run(); }, keywords: ['code'] },
    { title: '引用', icon: <Quote className="w-4 h-4 text-muted-foreground" />, action: () => { editor?.commands.deleteRange({ from: editor.state.selection.from - slashSearch.length - 1, to: editor.state.selection.from }); editor?.chain().focus().toggleBlockquote().run(); }, keywords: ['quote'] },
    { title: '分割线', icon: <Minus className="w-4 h-4 text-muted-foreground" />, action: () => { editor?.commands.deleteRange({ from: editor.state.selection.from - slashSearch.length - 1, to: editor.state.selection.from }); editor?.chain().focus().setHorizontalRule().run(); }, keywords: ['hr'] },
  ];

  const filtered = commands.filter(c => {
    const t = slashSearch.toLowerCase();
    return c.title.toLowerCase().includes(t) || c.keywords.some(k => k.includes(t));
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!slashOpen || filtered.length === 0) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); setMenuIndex(p => (p + 1) % filtered.length); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setMenuIndex(p => (p - 1 + filtered.length) % filtered.length); }
      else if (e.key === 'Enter') { e.preventDefault(); filtered[menuIndex].action(); setSlashOpen(false); }
      else if (e.key === 'Escape') { e.preventDefault(); setSlashOpen(false); editor?.commands.focus(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [slashOpen, menuIndex, filtered, editor]);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setSlashOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!editor) return null;

  const fmtBtn = (onClick: () => void, active: boolean, title: string, icon: React.ReactNode, disabled?: boolean) => (
    <button onClick={onClick} disabled={disabled}
      className={cn("p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-all cursor-pointer",
        active && "bg-accent text-foreground", disabled && "opacity-20")} title={title}>{icon}</button>
  );

  return (
    <div className="relative w-full z-10 flex flex-col h-full bg-background rounded-xl select-text">
      <div className="flex flex-wrap items-center justify-between border-b border-border gap-1 pb-3 mb-2 px-1">
        <div className="flex flex-wrap items-center gap-1">
          {fmtBtn(() => editor.chain().focus().toggleBold().run(), editor.isActive('bold'), '加粗', <Bold className="w-4 h-4" />, !editor.can().toggleBold())}
          {fmtBtn(() => editor.chain().focus().toggleItalic().run(), editor.isActive('italic'), '斜体', <Italic className="w-4 h-4" />, !editor.can().toggleItalic())}
          {fmtBtn(() => editor.chain().focus().toggleStrike().run(), editor.isActive('strike'), '删除线', <Strikethrough className="w-4 h-4" />, !editor.can().toggleStrike())}
          {fmtBtn(() => editor.chain().focus().toggleCode().run(), editor.isActive('code'), '行内代码', <Code className="w-4 h-4" />, !editor.can().toggleCode())}
          <div className="w-[1px] h-4 bg-border mx-1" />
          {fmtBtn(() => editor.chain().focus().toggleHeading({ level: 1 }).run(), editor.isActive('heading', { level: 1 }), 'H1', <span className="text-xs font-semibold">H1</span>)}
          {fmtBtn(() => editor.chain().focus().toggleHeading({ level: 2 }).run(), editor.isActive('heading', { level: 2 }), 'H2', <span className="text-xs font-semibold">H2</span>)}
          {fmtBtn(() => editor.chain().focus().toggleHeading({ level: 3 }).run(), editor.isActive('heading', { level: 3 }), 'H3', <span className="text-xs font-semibold">H3</span>)}
          <div className="w-[1px] h-4 bg-border mx-1" />
          {fmtBtn(() => editor.chain().focus().toggleBulletList().run(), editor.isActive('bulletList'), '无序列表', <List className="w-4 h-4" />)}
          {fmtBtn(() => editor.chain().focus().toggleOrderedList().run(), editor.isActive('orderedList'), '有序列表', <ListOrdered className="w-4 h-4" />)}
          {fmtBtn(() => editor.chain().focus().toggleTaskList().run(), editor.isActive('taskList'), '待办', <CheckSquare className="w-4 h-4" />)}
          <div className="w-[1px] h-4 bg-border mx-1" />
          {fmtBtn(() => editor.chain().focus().toggleCodeBlock().run(), editor.isActive('codeBlock'), '代码块', <Code className="w-4 h-4" />)}
          {fmtBtn(() => editor.chain().focus().toggleBlockquote().run(), editor.isActive('blockquote'), '引用', <Quote className="w-4 h-4" />)}
          {fmtBtn(() => editor.chain().focus().setHorizontalRule().run(), false, '分割线', <Minus className="w-4 h-4" />)}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-20 cursor-pointer" title="撤销"><Undo className="w-4 h-4" /></button>
          <button onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-20 cursor-pointer" title="重做"><Redo className="w-4 h-4" /></button>
          <button onClick={() => { editor.commands.focus(); setSlashOpen(true); setSlashSearch(''); setMenuIndex(0); }}
            className="p-1.5 rounded-lg hover:bg-muted text-foreground ml-1 border border-border cursor-pointer" title="/ 快捷键">
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="relative min-h-[500px]">
        <EditorContent editor={editor} />
        {slashOpen && (
          <div ref={menuRef} className="absolute left-8 -mt-2 w-72 bg-popover border border-border rounded-xl shadow-2xl overflow-hidden py-1.5 z-50" style={{ maxHeight: '300px', overflowY: 'auto' }}>
            <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border bg-muted/50 text-muted-foreground text-xs font-medium">
              <Keyboard className="w-3.5 h-3.5" /><span>搜索块命令</span>
              {slashSearch && <span className="ml-auto bg-muted text-foreground px-1.5 py-0.2 rounded-md font-mono">/{slashSearch}</span>}
            </div>
            {filtered.length === 0 ? (
              <div className="px-4 py-3 text-sm text-muted-foreground italic text-center">未找到对应块选项</div>
            ) : (
              <div className="max-h-[240px] overflow-y-auto">
                {filtered.map((item, i) => (
                  <button key={i} onClick={() => { item.action(); setSlashOpen(false); }}
                    className={cn("w-full text-left px-3.5 py-2.5 flex items-center gap-3 transition-colors text-sm cursor-pointer",
                      i === menuIndex ? "bg-accent text-foreground border-l-2 border-foreground" : "text-muted-foreground hover:bg-accent/50")}>
                    <div className="p-1.5 rounded-lg bg-muted text-muted-foreground">{item.icon}</div>
                    <span className="font-medium">{item.title}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
