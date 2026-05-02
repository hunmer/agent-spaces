> 说明：为了保证“复制就能跑”，我这里先把 `shadcn/ui Dialog` , 实际应用代码换回 shadcn 的 `Dialog/Button
> **Next.js + Tiptap + @mention + `/` 命令面板 + 文件上传 + 对话框**  

---

# 1）先安装依赖

```bash
npm i @tiptap/react @tiptap/starter-kit @tiptap/extension-placeholder @tiptap/extension-mention @tiptap/suggestion @tiptap/core react-dropzone tippy.js
```

---

# 2）文件结构

```bash
app/
  layout.tsx
  page.tsx
  globals.css
  api/
    upload/
      route.ts
components/
  composer/
    composer-dialog.tsx
    composer-editor.tsx
    suggestion-list.tsx
lib/
  users.ts
  commands.ts
```

---

# 3）代码

## `app/layout.tsx`

```tsx
import './globals.css';
import 'tippy.js/dist/tippy.css';

export const metadata = {
  title: 'Composer Demo',
  description: 'Tiptap mention + slash command + upload demo',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
```

---

## `app/page.tsx`

```tsx
import { ComposerDialog } from '@/components/composer/composer-dialog';

export default function Page() {
  return <ComposerDialog />;
}
```

---

## `app/globals.css`

```css
* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  padding: 0;
  background: #f8fafc;
  color: #0f172a;
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI',
    sans-serif;
}

button,
input {
  font: inherit;
}

.page {
  padding: 24px;
}

.btn {
  border: 1px solid #cbd5e1;
  background: white;
  color: #0f172a;
  border-radius: 10px;
  padding: 10px 14px;
  cursor: pointer;
  transition: 0.15s ease;
}

.btn:hover {
  background: #f1f5f9;
}

.btn-primary {
  background: #2563eb;
  color: white;
  border-color: #2563eb;
}

.btn-primary:hover {
  background: #1d4ed8;
}

.btn-danger {
  background: #fee2e2;
  border-color: #fecaca;
  color: #b91c1c;
}

.btn-ghost {
  background: transparent;
  border-color: transparent;
}

.result-box {
  margin-top: 16px;
  padding: 16px;
  background: #0f172a;
  color: #e2e8f0;
  border-radius: 12px;
  overflow: auto;
  white-space: pre-wrap;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  z-index: 50;
}

.modal {
  width: min(900px, 100%);
  background: white;
  border-radius: 16px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.18);
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px;
  border-bottom: 1px solid #e2e8f0;
}

.modal-header h2 {
  margin: 0;
  font-size: 18px;
}

.modal-body {
  padding: 20px;
}

.editor-shell {
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  overflow: hidden;
  background: #fff;
}

.editor-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px;
  border-bottom: 1px solid #e2e8f0;
  background: #f8fafc;
}

.editor-area {
  padding: 14px;
}

.tiptap {
  min-height: 160px;
  outline: none;
}

.tiptap p {
  margin: 0 0 10px;
  line-height: 1.7;
}

.tiptap h1,
.tiptap h2,
.tiptap h3 {
  margin: 0 0 10px;
  line-height: 1.3;
}

.tiptap blockquote {
  border-left: 4px solid #cbd5e1;
  margin: 0 0 10px;
  padding-left: 12px;
  color: #475569;
}

.tiptap hr {
  border: none;
  border-top: 1px solid #e2e8f0;
  margin: 14px 0;
}

.tiptap ul,
.tiptap ol {
  padding-left: 1.5rem;
  margin: 0 0 10px;
}

.tiptap p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  color: #94a3b8;
  float: left;
  height: 0;
  pointer-events: none;
}

.mention {
  display: inline-block;
  padding: 0 6px;
  border-radius: 999px;
  background: #dbeafe;
  color: #1d4ed8;
  font-weight: 600;
}

.suggestion-menu {
  width: 320px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: white;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.14);
  overflow: hidden;
}

.suggestion-header {
  padding: 10px 12px;
  border-bottom: 1px solid #e2e8f0;
  font-size: 12px;
  color: #64748b;
  background: #f8fafc;
}

.suggestion-list {
  max-height: 280px;
  overflow: auto;
}

.suggestion-item {
  padding: 10px 12px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.suggestion-item:hover,
.suggestion-item[data-selected='true'] {
  background: #eff6ff;
}

.suggestion-title {
  font-size: 14px;
  color: #0f172a;
}

.suggestion-desc {
  font-size: 12px;
  color: #64748b;
}

.attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0 20px 20px;
}

.attachment-chip {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  border: 1px solid #e2e8f0;
  border-radius: 999px;
  padding: 8px 12px;
  background: #f8fafc;
}

.attachment-chip img {
  width: 28px;
  height: 28px;
  object-fit: cover;
  border-radius: 8px;
}

.footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 20px 20px;
}

.footer-left,
.footer-right {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.dropzone-hint {
  margin-top: 10px;
  color: #64748b;
  font-size: 12px;
}
```

---

## `lib/users.ts`

```ts
export type User = {
  id: string;
  name: string;
  email: string;
};

export const USERS: User[] = [
  { id: '1', name: '张三', email: 'zhangsan@example.com' },
  { id: '2', name: '李四', email: 'lisi@example.com' },
  { id: '3', name: '王五', email: 'wangwu@example.com' },
  { id: '4', name: '赵六', email: 'zhaoliu@example.com' },
  { id: '5', name: 'Alice', email: 'alice@example.com' },
  { id: '6', name: 'Bob', email: 'bob@example.com' },
];
```

---

## `lib/commands.ts`

```ts
export type SlashCommandItem = {
  id: string;
  title: string;
  description: string;
};

export const COMMANDS: SlashCommandItem[] = [
  {
    id: 'heading1',
    title: '标题 1',
    description: '切换为一级标题',
  },
  {
    id: 'blockquote',
    title: '引用',
    description: '切换为引用块',
  },
  {
    id: 'divider',
    title: '分割线',
    description: '插入一条分割线',
  },
  {
    id: 'attach',
    title: '添加附件',
    description: '打开文件选择器',
  },
];
```

---

## `components/composer/suggestion-list.tsx`

```tsx
'use client';

import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';

type Item = {
  id: string;
  label?: string;
  name?: string;
  title?: string;
  description?: string;
  email?: string;
  [key: string]: any;
};

export type SuggestionListRef = {
  onKeyDown: ({ event }: { event: KeyboardEvent }) => boolean;
};

export type SuggestionListProps = {
  items: Item[];
  command: (item: Item) => void;
};

function getTitle(item: Item) {
  return item.label ?? item.name ?? item.title ?? item.id;
}

function getDesc(item: Item) {
  return item.description ?? item.email ?? '';
}

export const SuggestionList = forwardRef<SuggestionListRef, SuggestionListProps>(
  function SuggestionList(props, ref) {
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => {
      setSelectedIndex(0);
    }, [props.items]);

    const selectItem = (index: number) => {
      const item = props.items[index];
      if (item) props.command(item);
    };

    useImperativeHandle(
      ref,
      () => ({
        onKeyDown: ({ event }) => {
          if (!props.items.length) return false;

          if (event.key === 'ArrowUp') {
            event.preventDefault();
            setSelectedIndex(
              (prev) => (prev + props.items.length - 1) % props.items.length,
            );
            return true;
          }

          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setSelectedIndex((prev) => (prev + 1) % props.items.length);
            return true;
          }

          if (event.key === 'Enter') {
            event.preventDefault();
            selectItem(selectedIndex);
            return true;
          }

          return false;
        },
      }),
      [props.items, selectedIndex],
    );

    if (!props.items.length) return null;

    return (
      <div className="suggestion-menu">
        <div className="suggestion-header">选择一个选项</div>
        <div className="suggestion-list">
          {props.items.map((item, index) => {
            const selected = index === selectedIndex;
            return (
              <div
                key={item.id}
                className="suggestion-item"
                data-selected={selected ? 'true' : 'false'}
                onMouseEnter={() => setSelectedIndex(index)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  props.command(item);
                }}
              >
                <div className="suggestion-title">{getTitle(item)}</div>
                {getDesc(item) ? (
                  <div className="suggestion-desc">{getDesc(item)}</div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    );
  },
);
```

---

## `components/composer/composer-editor.tsx`

```tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { EditorContent, ReactRenderer, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Mention from '@tiptap/extension-mention';
import { Extension } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import tippy from 'tippy.js';

import { USERS } from '@/lib/users';
import { COMMANDS } from '@/lib/commands';
import { SuggestionList } from './suggestion-list';

type Attachment = {
  file: File;
  preview: string;
};

function createSuggestionRenderer() {
  let component: ReactRenderer | null = null;
  let popup: any = null;

  return {
    onStart(props: any) {
      component = new ReactRenderer(SuggestionList, {
        props,
        editor: props.editor,
      });

      if (!props.clientRect) return;

      popup = tippy('body', {
        getReferenceClientRect: props.clientRect,
        appendTo: () => document.body,
        content: component.element,
        showOnCreate: true,
        interactive: true,
        trigger: 'manual',
        placement: 'bottom-start',
      });
    },

    onUpdate(props: any) {
      component?.updateProps(props);
      if (popup?.[0] && props.clientRect) {
        popup[0].setProps({
          getReferenceClientRect: props.clientRect,
        });
      }
    },

    onKeyDown(props: any) {
      return component?.ref?.onKeyDown(props) ?? false;
    },

    onExit() {
      popup?.[0]?.destroy();
      component?.destroy();
    },
  };
}

function createSlashExtension(openFilePicker: () => void) {
  return Extension.create({
    name: 'slashCommand',

    addOptions() {
      return {
        suggestion: {
          char: '/',
          items: ({ query }: { query: string }) => {
            const keyword = query.toLowerCase();

            return COMMANDS.filter((item) =>
              `${item.title} ${item.description}`.toLowerCase().includes(keyword),
            ).map((item) => ({
              id: item.id,
              title: item.title,
              description: item.description,
            }));
          },

          command: ({
            editor,
            range,
            props,
          }: {
            editor: any;
            range: { from: number; to: number };
            props: { id: string; title: string; description: string };
          }) => {
            editor.chain().focus().deleteRange(range).run();

            switch (props.id) {
              case 'heading1':
                editor.chain().focus().toggleHeading({ level: 1 }).run();
                break;
              case 'blockquote':
                editor.chain().focus().toggleBlockquote().run();
                break;
              case 'divider':
                editor.chain().focus().setHorizontalRule().run();
                break;
              case 'attach':
                openFilePicker();
                break;
              default:
                break;
            }
          },

          render: () => createSuggestionRenderer(),
        },
      };
    },

    addProseMirrorPlugins() {
      return [
        Suggestion({
          editor: this.editor,
          ...this.options.suggestion,
        }),
      ];
    },
  });
}

export function ComposerEditor({
  onSubmit,
  onClose,
}: {
  onSubmit: (payload: {
    content: string;
    attachments: {
      name: string;
      size: number;
      type: string;
      url: string;
    }[];
  }) => Promise<void> | void;
  onClose: () => void;
}) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const { getRootProps, getInputProps, open: openFilePicker } = useDropzone({
    noClick: true,
    noKeyboard: true,
    multiple: true,
    onDrop: (files) => {
      setAttachments((prev) => [
        ...prev,
        ...files.map((file) => ({
          file,
          preview: URL.createObjectURL(file),
        })),
      ]);
    },
  });

  useEffect(() => {
    return () => {
      attachments.forEach((item) => URL.revokeObjectURL(item.preview));
    };
  }, [attachments]);

  const mentionExtension = useMemo(() => {
    return Mention.configure({
      HTMLAttributes: {
        class: 'mention',
      },
      suggestion: {
        char: '@',
        items: ({ query }: { query: string }) => {
          const keyword = query.toLowerCase();

          return USERS.filter((user) =>
            `${user.name} ${user.email}`.toLowerCase().includes(keyword),
          )
            .slice(0, 6)
            .map((user) => ({
              id: user.id,
              label: user.name,
              email: user.email,
            }));
        },
        command: ({
          editor,
          range,
          props,
        }: {
          editor: any;
          range: { from: number; to: number };
          props: { id: string; label: string; email: string };
        }) => {
          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              {
                type: 'mention',
                attrs: props,
              },
            ])
            .run();
        },
        render: () => createSuggestionRenderer(),
      },
    });
  }, []);

  const slashExtension = useMemo(() => {
    return createSlashExtension(openFilePicker);
  }, [openFilePicker]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: '输入内容，支持 @ 艾特人，输入 / 打开命令面板',
      }),
      mentionExtension,
      slashExtension,
    ],
    editorProps: {
      attributes: {
        class: 'tiptap',
      },
    },
    content: '',
  });

  const removeAttachment = (index: number) => {
    setAttachments((prev) => {
      const next = [...prev];
      const [removed] = next.splice(index, 1);
      if (removed) URL.revokeObjectURL(removed.preview);
      return next;
    });
  };

  const canSubmit =
    !!editor?.getText().trim() || attachments.length > 0 ? true : false;

  const handleSubmit = async () => {
    if (!editor || submitting) return;

    setSubmitting(true);

    try {
      const uploaded = await Promise.all(
        attachments.map(async (item) => {
          const formData = new FormData();
          formData.append('file', item.file);

          const res = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
          });

          if (!res.ok) {
            throw new Error(`上传失败: ${item.file.name}`);
          }

          return (await res.json()) as {
            name: string;
            size: number;
            type: string;
            url: string;
          };
        }),
      );

      await onSubmit({
        content: editor.getHTML(),
        attachments: uploaded,
      });

      editor.commands.clearContent();
      setAttachments([]);
    } finally {
      setSubmitting(false);
    }
  };

  const handleInsertHeading = () => {
    editor?.chain().focus().toggleHeading({ level: 1 }).run();
  };

  const handleInsertQuote = () => {
    editor?.chain().focus().toggleBlockquote().run();
  };

  const handleInsertDivider = () => {
    editor?.chain().focus().setHorizontalRule().run();
  };

  return (
    <div className="modal-body">
      <div className="editor-shell" {...getRootProps()}>
        <input {...getInputProps()} />
        <div className="editor-toolbar">
          <button className="btn" type="button" onClick={handleInsertHeading}>
            标题
          </button>
          <button className="btn" type="button" onClick={handleInsertQuote}>
            引用
          </button>
          <button className="btn" type="button" onClick={handleInsertDivider}>
            分割线
          </button>
          <button className="btn" type="button" onClick={openFilePicker}>
            添加文件
          </button>
        </div>

        <div className="editor-area">
          <EditorContent editor={editor} />
          <div className="dropzone-hint">提示：拖拽文件到这里，或点击“添加文件”</div>
        </div>

        {attachments.length > 0 ? (
          <div className="attachments">
            {attachments.map((item, index) => {
              const isImage = item.file.type.startsWith('image/');
              return (
                <div className="attachment-chip" key={`${item.file.name}-${index}`}>
                  {isImage ? (
                    <img src={item.preview} alt={item.file.name} />
                  ) : null}
                  <div>
                    <div>{item.file.name}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                      {(item.file.size / 1024).toFixed(1)} KB
                    </div>
                  </div>
                  <button
                    className="btn btn-danger"
                    type="button"
                    onClick={() => removeAttachment(index)}
                  >
                    删除
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}

        <div className="footer">
          <div className="footer-left">
            <button className="btn" type="button" onClick={onClose}>
              取消
            </button>
          </div>

          <div className="footer-right">
            <button
              className="btn btn-primary"
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
            >
              {submitting ? '发送中...' : '发送'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

---

## `components/composer/composer-dialog.tsx`

```tsx
'use client';

import { useState } from 'react';
import { ComposerEditor } from './composer-editor';

export function ComposerDialog() {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<any>(null);

  return (
    <div className="page">
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        打开对话框
      </button>

      {result ? (
        <pre className="result-box">{JSON.stringify(result, null, 2)}</pre>
      ) : null}

      {open ? (
        <div className="modal-overlay" onMouseDown={() => setOpen(false)}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>新建内容</h2>
              <button className="btn btn-ghost" onClick={() => setOpen(false)}>
                关闭
              </button>
            </div>

            <ComposerEditor
              onClose={() => setOpen(false)}
              onSubmit={async (payload) => {
                setResult(payload);
                setOpen(false);
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
```

---

## `app/api/upload/route.ts`

```tsx
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get('file');

  if (!(file instanceof File)) {
    return NextResponse.json(
      { message: 'No file provided' },
      { status: 400 },
    );
  }

  const url = `/mock-upload/${Date.now()}-${encodeURIComponent(file.name)}`;

  return NextResponse.json({
    name: file.name,
    size: file.size,
    type: file.type,
    url,
  });
}
```

---

# 4）运行

```bash
npm run dev
```

打开：

```bash
http://localhost:3000
```

---

# 5）你会得到什么效果

这版已经能做到：

- 打开一个对话框
- 输入内容
- 输入 `@` 弹出可选人列表
- 输入 `/` 弹出命令面板
- 选择命令：
  - 标题
  - 引用
  - 分割线
  - 添加文件
- 支持拖拽文件
- 提交时把：
  - 编辑器 HTML
  - 附件信息
  一起返回给你

---

# 6）如果你下一步要更像 Notion

我建议继续做这 3 个增强：

1. **把 slash 菜单改成真正的块级插入**
2. **把 mention 弹层做成更精致的头像列表**
3. **把附件变成“块”而不是简单 chip**

