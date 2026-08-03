'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { forwardRef, useImperativeHandle } from 'react';
import { useEditor, EditorContent, ReactRenderer } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Mention from '@tiptap/extension-mention';
import tippy, { type Instance } from 'tippy.js';
import type { SuggestionProps } from '@tiptap/suggestion';
import { cn } from '@/lib/utils';

/**
 * 面向「编辑图片指令」的轻量 tiptap 编辑器：支持 @ 唤起参考图列表。
 *
 * - @ 弹出参考图缩略图列表（references 提供），键盘上下选 / 回车确认 / Esc 关闭。
 * - 选中后插入高亮 mention 节点，data-key 存参考图关键字（由父组件传入，如 'R0'），
 *   data-url 存参考图 URL。
 * - onChange 回传当前 HTML，由调用方在提交时把 mention 节点转换为对应关键字、其余转纯文本。
 *
 * 不带工具栏，纯指令输入场景；继承节点画布 nodrag/nopan/nowheel 需由外层 className 控制（透传 className 到编辑区）。
 */

export type PromptReference = {
  /** 参考图 URL（用于 @ 列表缩略图 + 提交时纳入 images） */
  url: string;
  /** 显示名（如「参考图1」「RpgMaker R0」） */
  label: string;
  /** 提交时替换 mention 的关键字（如 'R0'/'R1'）；为空则用 label */
  key?: string;
};

export type PromptTextEditorProps = {
  /** 受控 HTML 内容 */
  value?: string;
  /** 内容变化回调（回传 HTML） */
  onChange?: (html: string) => void;
  /** @ 可选参考图列表；为空时 @ 不弹层 */
  references?: PromptReference[];
  placeholder?: string;
  /** 透传到编辑区的 className（节点画布需 nodrag nopan nowheel 防误触） */
  className?: string;
};

/** @ suggestion 浮层：参考图缩略图 + 名，键盘导航。 */
const RefSuggestionList = forwardRef<
  { onKeyDown: (p: { event: KeyboardEvent }) => boolean },
  { items: PromptReference[]; command: (item: PromptReference) => void }
>(function RefSuggestionList({ items, command }, ref) {
  const [selected, setSelected] = React.useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => setSelected(0), [items]);
  useEffect(() => {
    listRef.current?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (!items.length) return false;
      if (event.key === 'ArrowUp') { event.preventDefault(); setSelected((p) => (p + items.length - 1) % items.length); return true; }
      if (event.key === 'ArrowDown' || event.key === 'Tab') { event.preventDefault(); setSelected((p) => (p + 1) % items.length); return true; }
      if (event.key === 'Enter') { event.preventDefault(); command(items[selected]); return true; }
      return false;
    },
  }));

  if (!items.length) {
    return (
      <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs text-muted-foreground shadow-md">
        无参考图
      </div>
    );
  }
  return (
    <div ref={listRef} className="flex max-h-60 w-56 flex-col gap-0.5 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-lg">
      {items.map((item, i) => (
        <button
          key={item.url + i}
          type="button"
          data-selected={i === selected}
          onMouseEnter={() => setSelected(i)}
          onClick={() => command(item)}
          className={cn(
            'flex items-center gap-2 rounded px-1.5 py-1 text-left text-xs transition',
            i === selected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60',
          )}
        >
          <img src={item.url} alt="" className="h-8 w-8 shrink-0 rounded border border-border object-cover" />
          <span className="flex flex-col gap-0.5 overflow-hidden">
            <span className="truncate font-medium">{item.label}</span>
            {item.key && <span className="text-[10px] text-muted-foreground">{item.key}</span>}
          </span>
        </button>
      ))}
    </div>
  );
});

/** 创建 tippy 浮层 suggestion renderer（参考 composer/create-suggestion-renderer） */
function refSuggestionRenderer() {
  let component: ReactRenderer | null = null;
  let popup: Instance[] | null = null;
  return {
    onStart(props: SuggestionProps<PromptReference>) {
      component = new ReactRenderer(RefSuggestionList, { props, editor: props.editor });
      if (!props.clientRect) return;
      popup = tippy('body', {
        getReferenceClientRect: () => props.clientRect?.() ?? new DOMRect(),
        appendTo: () => document.body,
        content: component.element,
        showOnCreate: true,
        interactive: true,
        trigger: 'manual',
        placement: 'bottom-start',
      });
    },
    onUpdate(props: SuggestionProps<PromptReference>) {
      component?.updateProps(props);
      if (popup?.[0] && props.clientRect) {
        popup[0].setProps({ getReferenceClientRect: () => props.clientRect?.() ?? new DOMRect() });
      }
    },
    onKeyDown(props: { event: KeyboardEvent }) {
      if (component?.ref && typeof component.ref === 'object' && 'onKeyDown' in component.ref) {
        return (component.ref as { onKeyDown: (p: { event: KeyboardEvent }) => boolean }).onKeyDown(props);
      }
      return false;
    },
    onExit() {
      popup?.[0]?.destroy();
      component?.destroy();
      popup = null;
      component = null;
    },
  };
}

export function PromptTextEditor({
  value,
  onChange,
  references = [],
  placeholder = '描述如何编辑图片…（输入 @ 插入参考图）',
  className,
}: PromptTextEditorProps) {
  // 用 ref 存最新 references：tiptap useEditor 的 extensions 只在首次挂载时构建一次，
  // suggestion.items 闭包若直接捕获 references 会定格在首次值，导致「上传新图后 @ 列表还是旧的」。
  // 改为 items 内部读 referencesRef.current，editor 实例无需重建即可拿到最新列表。
  const referencesRef = useRef(references);
  referencesRef.current = references;

  // mention 扩展：扩展默认 Mention schema（加 url/key attrs + 改写 renderHTML 输出 data-*），
  // suggestion.items 从 referencesRef 动态读取。扩展本身只构建一次（deps=[]），靠 ref 拿最新数据。
  const mentionExt = useMemo(
    () => {
      const ext = Mention.extend({
        addAttributes() {
          return {
            ...(this.parent?.() || {}),
            url: { default: null, parseHTML: (el) => el.getAttribute('data-url') },
            key: { default: '', parseHTML: (el) => el.getAttribute('data-key') || '' },
          };
        },
        renderHTML({ node, HTMLAttributes }) {
          const merged = {
            ...HTMLAttributes,
            'data-url': node.attrs.url || '',
            'data-key': node.attrs.key || '',
            'data-label': node.attrs.label || '',
          };
          return ['span', merged, `@${node.attrs.label || '参考图'}`];
        },
      });
      return ext.configure({
        renderLabel: (node) => `@${node.attrs?.label ?? '参考图'}`,
        HTMLAttributes: { class: 'prompt-mention' },
        suggestion: {
          char: '@',
          // 关键：从 ref 读最新 references，而非闭包捕获
          items: ({ query }: { query: string }) => {
            const kw = query.toLowerCase();
            const list = referencesRef.current || [];
            return list
              .filter((r) => r.label.toLowerCase().includes(kw) || (r.key || '').toLowerCase().includes(kw))
              .slice(0, 30);
          },
          command: ({ editor, range, props }) => {
            editor
              .chain()
              .focus()
              .insertContentAt(range, [
                {
                  type: 'mention',
                  attrs: {
                    id: props.url,
                    label: props.label,
                    url: props.url,
                    key: props.key || '',
                  },
                },
              ])
              .run();
          },
          render: () => refSuggestionRenderer(),
        },
      });
    },
    [],
  );

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder }),
      mentionExt,
    ],
    editorProps: {
      attributes: {
        class: cn('prompt-editor-body min-h-[64px] max-h-[300px] overflow-y-auto', className),
      },
    },
    content: value || '',
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML());
    },
  });

  // 受控同步：外部 value 变化且与当前不一致时覆盖（避免光标抖动，仅不同才 set）
  useEffect(() => {
    if (!editor) return;
    if (value !== undefined && editor.getHTML() !== value) {
      editor.commands.setContent(value || '', { emitUpdate: false });
    }
  }, [value, editor]);

  return <EditorContent editor={editor} />;
}

export default PromptTextEditor;
