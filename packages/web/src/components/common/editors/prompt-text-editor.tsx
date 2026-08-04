'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { forwardRef, useImperativeHandle } from 'react';
import { Extension, type Editor } from '@tiptap/core';
import { useEditor, EditorContent, ReactRenderer, type JSONContent } from '@tiptap/react';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Mention from '@tiptap/extension-mention';
import { Trash2 } from 'lucide-react';
import tippy, { delegate, type Instance } from 'tippy.js';
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

export type PromptVariableConnection = {
  edgeId: string;
  color: string;
  label?: string;
};

export type PromptVariableBinding = {
  key: string;
  value?: string;
  connections?: PromptVariableConnection[];
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
  /** 文本变量及其连线状态；文档中的字面量 {key} 会按对应 edge 颜色高亮。 */
  variables?: PromptVariableBinding[];
  /** 未连线变量的手动 fallback 变化。 */
  onVariableValueChange?: (key: string, value: string) => void;
  /** 删除变量对应的输入 edge。 */
  onVariableDisconnect?: (edgeId: string) => void;
  /** 默认 html 兼容图生图；text 模式保持普通节点 params 为纯文本。 */
  valueFormat?: 'html' | 'text';
  /** 单行字段禁止 Enter。 */
  singleLine?: boolean;
};

const PROMPT_VARIABLE_PATTERN = /\{([A-Za-z0-9_.\-\u3400-\u9fff]+)\}/g;
const promptVariablePluginKey = new PluginKey('promptVariableHighlight');

function createTextContent(value: string): JSONContent {
  return {
    type: 'doc',
    content: String(value || '').split('\n').map((line) => ({
      type: 'paragraph',
      content: line ? [{ type: 'text', text: line }] : undefined,
    })),
  };
}

function getEditorText(editor: Editor): string {
  return editor.state.doc.textBetween(0, editor.state.doc.content.size, '\n');
}

function variableDecorationStyle(binding?: PromptVariableBinding) {
  const colors = Array.from(new Set((binding?.connections || []).map((item) => item.color).filter(Boolean)));
  const color = colors[0] || '#64748b';
  const line = colors.length > 1
    ? `linear-gradient(90deg, ${colors.join(', ')})`
    : `linear-gradient(90deg, ${color}, ${color})`;
  return [
    'border-radius:4px',
    `color:${color}`,
    `background-color:color-mix(in srgb, ${color} 12%, transparent)`,
    `background-image:${line}`,
    'background-repeat:no-repeat',
    'background-position:left bottom',
    'background-size:100% 2px',
    'cursor:help',
    'font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace',
    'padding:0 2px',
  ].join(';');
}

function createStableReferenceClientRect(reference: Element) {
  const snapshot = reference.getBoundingClientRect();
  return () => (reference.isConnected ? reference.getBoundingClientRect() : snapshot);
}

function PromptVariablePopover({
  binding,
  onValueChange,
  onDisconnect,
}: {
  binding: PromptVariableBinding;
  onValueChange?: (key: string, value: string) => void;
  onDisconnect?: (edgeId: string) => void;
}) {
  const [connections, setConnections] = React.useState(binding.connections || []);
  const [value, setValue] = React.useState(binding.value || '');
  const connected = connections.length > 0;

  return (
    <div className="flex w-64 flex-col gap-2 rounded-md border border-border bg-popover p-2.5 text-popover-foreground shadow-lg">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-semibold">{`{${binding.key}}`}</span>
        <span className="text-[10px] text-muted-foreground">{connected ? `${connections.length} 条连线` : '手动值'}</span>
      </div>
      {connected ? <div className="flex flex-col gap-1.5">
        {connections.map((connection) => <div key={connection.edgeId} className="flex items-center gap-2 rounded border border-border px-2 py-1.5">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: connection.color }} />
          <span className="min-w-0 flex-1 truncate text-xs">{connection.label || '文本连线'}</span>
          <button
            type="button"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            title="删除连线"
            onClick={() => {
              onDisconnect?.(connection.edgeId);
              setConnections((current) => current.filter((item) => item.edgeId !== connection.edgeId));
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>)}
      </div> : <input
        type="text"
        value={value}
        placeholder="输入变量文本"
        className="h-8 w-full rounded border border-border bg-background px-2 text-xs outline-none focus:border-primary"
        onChange={(event) => {
          const next = event.target.value;
          setValue(next);
          onValueChange?.(binding.key, next);
        }}
      />}
    </div>
  );
}

type PromptVariableRuntime = {
  bindings: PromptVariableBinding[];
  onValueChange?: PromptTextEditorProps['onVariableValueChange'];
  onDisconnect?: PromptTextEditorProps['onVariableDisconnect'];
};

function createPromptVariableExtension(runtimeRef: React.RefObject<PromptVariableRuntime>) {
  return Extension.create({
    name: 'promptVariableHighlight',
    addProseMirrorPlugins() {
      const renderers = new Map<Instance, ReactRenderer>();
      const destroyRenderer = (instance: Instance) => {
        renderers.get(instance)?.destroy();
        renderers.delete(instance);
      };

      return [new Plugin({
        key: promptVariablePluginKey,
        props: {
          decorations(state) {
            const decorations: Decoration[] = [];
            const bindings = runtimeRef.current.bindings || [];
            state.doc.descendants((node, pos) => {
              if (!node.isText || !node.text) return;
              for (const match of node.text.matchAll(PROMPT_VARIABLE_PATTERN)) {
                if (match.index === undefined) continue;
                const key = match[1];
                const binding = bindings.find((item) => item.key === key);
                decorations.push(Decoration.inline(
                  pos + match.index,
                  pos + match.index + match[0].length,
                  {
                    'data-prompt-variable': key,
                    'data-connected': binding?.connections?.length ? 'true' : 'false',
                    style: variableDecorationStyle(binding),
                  },
                ));
              }
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
        view: (view) => {
          const delegated = delegate(view.dom, {
            target: '[data-prompt-variable]',
            trigger: 'mouseenter focus',
            interactive: true,
            delay: [150, 100],
            appendTo: () => document.body,
            placement: 'bottom-start',
            onTrigger: (instance) => {
              instance.setProps({
                getReferenceClientRect: createStableReferenceClientRect(instance.reference),
              });
            },
            onShow: (instance) => {
              const key = instance.reference.getAttribute('data-prompt-variable');
              if (!key) return false;
              destroyRenderer(instance);
              const runtime = runtimeRef.current;
              const binding = runtime.bindings.find((item) => item.key === key) || { key };
              const renderer = new ReactRenderer(PromptVariablePopover, {
                editor: this.editor,
                props: {
                  binding,
                  onValueChange: runtime.onValueChange,
                  onDisconnect: runtime.onDisconnect,
                },
              });
              renderers.set(instance, renderer);
              instance.setContent(renderer.element);
              return undefined;
            },
            onMount: (instance) => {
              instance.popperInstance?.update();
            },
            onHidden: destroyRenderer,
            onDestroy: destroyRenderer,
          });
          const instances = Array.isArray(delegated) ? delegated : [delegated];
          return {
            destroy() {
              for (const instance of instances) instance.destroy();
              for (const renderer of renderers.values()) renderer.destroy();
              renderers.clear();
            },
          };
        },
      })];
    },
  });
}

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
  variables = [],
  onVariableValueChange,
  onVariableDisconnect,
  valueFormat = 'html',
  singleLine = false,
}: PromptTextEditorProps) {
  // 用 ref 存最新 references：tiptap useEditor 的 extensions 只在首次挂载时构建一次，
  // suggestion.items 闭包若直接捕获 references 会定格在首次值，导致「上传新图后 @ 列表还是旧的」。
  // 改为 items 内部读 referencesRef.current，editor 实例无需重建即可拿到最新列表。
  const referencesRef = useRef(references);
  referencesRef.current = references;
  const variableRuntimeRef = useRef<PromptVariableRuntime>({ bindings: [] });
  variableRuntimeRef.current = {
    bindings: variables,
    onValueChange: onVariableValueChange,
    onDisconnect: onVariableDisconnect,
  };
  const singleLineRef = useRef(singleLine);
  singleLineRef.current = singleLine;

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
        renderLabel: ({ node }) => `@${node.attrs?.label ?? '参考图'}`,
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
            const reference = props as unknown as PromptReference;
            editor
              .chain()
              .focus()
              .insertContentAt(range, [
                {
                  type: 'mention',
                  attrs: {
                    id: reference.url,
                    label: reference.label,
                    url: reference.url,
                    key: reference.key || '',
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
  const variableExt = useMemo(() => createPromptVariableExtension(variableRuntimeRef), []);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder }),
      mentionExt,
      variableExt,
    ],
    editorProps: {
      attributes: {
        class: cn(
          'prompt-editor-body max-h-[300px] overflow-y-auto [&_p]:m-0',
          singleLine ? 'min-h-8 whitespace-nowrap' : 'min-h-[64px]',
          className,
        ),
      },
      handleKeyDown: (_view, event) => {
        if (singleLineRef.current && event.key === 'Enter') {
          event.preventDefault();
          return true;
        }
        return false;
      },
    },
    content: valueFormat === 'text' ? createTextContent(value || '') : (value || ''),
    onUpdate: ({ editor }) => {
      onChange?.(valueFormat === 'text' ? getEditorText(editor) : editor.getHTML());
    },
  });

  // 受控同步：外部 value 变化且与当前不一致时覆盖（避免光标抖动，仅不同才 set）
  useEffect(() => {
    if (!editor) return;
    const current = valueFormat === 'text' ? getEditorText(editor) : editor.getHTML();
    if (value !== undefined && current !== value) {
      editor.commands.setContent(
        valueFormat === 'text' ? createTextContent(value || '') : (value || ''),
        { emitUpdate: false },
      );
    }
  }, [value, valueFormat, editor]);

  useEffect(() => {
    if (!editor) return;
    editor.view.dispatch(editor.state.tr.setMeta(promptVariablePluginKey, { refreshedAt: Date.now() }));
  }, [editor, variables]);

  return <EditorContent editor={editor} />;
}

export default PromptTextEditor;
