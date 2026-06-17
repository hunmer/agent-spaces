// 迁移自 packages/web/src/components/database/database-tree-node.tsx
// 沙箱化：剥离 TS 类型 / store / next-intl / @/lib/cn / lucide / file-tree，
// 数据经 props 传入，操作经 onRename/onDelete/onAddChild 回调上抛。
// icon 选择器保留（EMOJIS 来自 constants）；拖拽手柄由 NestedTree 的 useSortable 提供，此处不再渲染。
import React, { useState, useEffect, useRef } from 'react';
import { EMOJIS, NODE_TYPE } from '../utils/constants.js';

const cn = (...a) => a.filter(Boolean).join(' ');
const { ChevronDown, ChevronRight, Edit2, Plus, Trash2 } = window.AgentSpacesUI;

const DEFAULT_ICON = (node) => (node.type === NODE_TYPE.FOLDER ? '📁' : '📄');
const UNTITLED = '未命名文档';

export function DatabaseTreeNode({ node, isOpen, isActive, hasChildren, onToggle, onSelect, onRename, onDelete, onAddChild, onUpdateIcon, children }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editingTitle, setEditingTitle] = useState(node.title);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const emojiRef = useRef(null);

  useEffect(() => { setEditingTitle(node.title); }, [node.title]);

  useEffect(() => {
    const handler = (event) => {
      if (emojiRef.current && !emojiRef.current.contains(event.target)) setEmojiOpen(false);
    };
    if (emojiOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [emojiOpen]);

  const submitRename = () => {
    const title = (editingTitle || '').trim() || UNTITLED;
    onRename && onRename(node.id, title);
    setIsEditing(false);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter') { event.preventDefault(); submitRename(); }
    if (event.key === 'Escape') { setEditingTitle(node.title); setIsEditing(false); }
  };

  const stop = (fn) => (event) => { event.stopPropagation(); fn && fn(); };

  return (
    <div className="flex flex-col select-none">
      <div
        className={cn(
          'group flex items-center h-9 justify-between pr-2 rounded-lg cursor-pointer transition-all gap-1.5 border border-transparent my-0.5',
          isActive ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        )}
        onClick={() => !isEditing && onSelect && onSelect(node.id)}
        onDoubleClick={() => { setEditingTitle(node.title); setIsEditing(true); }}
      >
        <div className="flex items-center min-w-0 flex-1 h-full py-1">
          <button
            onClick={stop(() => hasChildren && onToggle && onToggle(node.id))}
            className={cn('p-1 rounded-sm text-muted-foreground hover:text-foreground transition-colors shrink-0 cursor-pointer', !hasChildren && 'opacity-0 cursor-default')}
            tabIndex={-1}
          >
            {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>

          <div className="relative shrink-0" ref={emojiRef}>
            <button
              onClick={stop(() => setEmojiOpen(!emojiOpen))}
              className="text-base p-1.5 rounded-md hover:bg-accent shrink-0 transition-all select-none cursor-pointer"
              title="修改图标"
            >
              {node.icon || DEFAULT_ICON(node)}
            </button>
            {emojiOpen && (
              <div className="absolute left-1 top-7 bg-popover shadow-2xl rounded-xl border border-border p-2 grid grid-cols-5 gap-1 w-44 z-50">
                {EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={stop(() => { onUpdateIcon && onUpdateIcon(node.id, emoji); setEmojiOpen(false); })}
                    className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-accent text-base cursor-pointer text-foreground"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0 pr-1.5 h-full flex items-center">
            {isEditing ? (
              <input
                type="text"
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                onBlur={submitRename}
                onKeyDown={handleKeyDown}
                onClick={(e) => e.stopPropagation()}
                className="w-full text-xs font-semibold bg-background border border-border rounded-md px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
                autoFocus
              />
            ) : (
              <span className={cn('text-xs truncate font-medium select-none', isActive ? 'text-primary' : 'text-foreground/80')}>
                {node.title || UNTITLED}
              </span>
            )}
          </div>
        </div>

        {!isEditing && (
          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 shrink-0 transition-opacity">
            <button
              onClick={stop(() => { setEditingTitle(node.title); setIsEditing(true); })}
              className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer"
              title="重命名"
            >
              <Edit2 className="w-3 h-3" />
            </button>
            <button
              onClick={stop(() => onAddChild && onAddChild(node.id, NODE_TYPE.DOCUMENT))}
              className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer"
              title="新建子页面"
            >
              <Plus className="w-3 h-3" />
            </button>
            <button
              onClick={stop(() => {
                if (confirm(`要将 "${node.title || UNTITLED}" 移动到回收站吗？`)) onDelete && onDelete(node.id);
              })}
              className="p-1 rounded hover:bg-rose-950/60 text-muted-foreground hover:text-rose-400 cursor-pointer"
              title="删除"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
      {children && <div className="flex flex-col">{children}</div>}
    </div>
  );
}
