// 合并自 packages/web/src/components/database/database-sidebar.tsx + database-sidebar-panel.tsx
// 沙箱化：剥离 store / sdk / next-intl / @/lib/cn / lucide / workspaces / import-file-dialog，
// 数据经 props（nodes/prefs/activeId）传入，节点操作走 utils/db.js + invokeService('node_changed')。
// workspace 切换、markdown 导入、回收站/向量设置对话框 —— 这些在 mini-app 中不需要或后续 Task 接入，
// 此处先放占位 alert。
import { useState, useMemo } from 'react';
import { NestedTree } from './nested-tree.jsx';
import { DatabaseTreeNode } from './database-tree-node.jsx';
import { DatabaseVectorDialog } from './database-vector-dialog.jsx';
import { TrashBinModal } from './trash-bin-modal.jsx';
import * as dbApi from '../utils/db.js';
import { genId, renameNode as dbRenameNode, updateIcon as dbUpdateIcon, moveNode as dbMoveNode, trashNode as dbTrashNode } from '../utils/db.js';
import { T, NODE_TYPE } from '../utils/constants.js';

const cn = (...a) => a.filter(Boolean).join(' ');
const { Button, Input } = window.AgentSpacesUI;

const UNTITLED = '未命名文档';
const NEW_FOLDER_TITLE = '新文件夹';

export function DatabaseSidebar({ nodes, prefs, activeId, onSelect, onToggle, onNodeChanged }) {
  const [search, setSearch] = useState(prefs.sidebarSearch || '');
  const [vectorOpen, setVectorOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);

  const notify = (payload) => window.AgentSpaces.invokeService('node_changed', payload).then(() => onNodeChanged && onNodeChanged());

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = nodes.filter((n) => !n.isTrash);
    if (!q) return list;
    return list.filter((n) => String(n.title || '').toLowerCase().includes(q));
  }, [nodes, search]);

  const handleCreate = async (parentId = null, type = NODE_TYPE.DOCUMENT) => {
    const title = type === NODE_TYPE.FOLDER ? NEW_FOLDER_TITLE : UNTITLED;
    const node = await dbApi.createNode({ id: genId(), parentId, type, title });
    await notify({ kind: 'create', nodeId: node.id, parentId });
    onSelect && onSelect(node.id);
    return node;
  };

  // 剥离原逻辑：若 title 前缀与现有 icon 相同则去重（避免编辑 span 文本里带 emoji）
  const handleRename = async (id, rawTitle) => {
    const cur = nodes.find((n) => n.id === id);
    let title = rawTitle;
    if (cur && cur.icon && title.trim().startsWith(cur.icon)) title = title.trim().substring(cur.icon.length).trim();
    if (!title) title = UNTITLED;
    await dbRenameNode(id, title);
    await notify({ kind: 'update', nodeId: id });
  };

  const handleUpdateIcon = async (id, icon) => {
    await dbUpdateIcon(id, icon);
    await notify({ kind: 'update', nodeId: id });
  };

  const handleDelete = async (id) => {
    await dbTrashNode(id);
    await notify({ kind: 'delete', nodeId: id });
    if (activeId === id) onSelect && onSelect(null);
  };

  const handleReorder = async (parentId, ids) => {
    for (const id of ids) await dbMoveNode(id, parentId);
    await notify({ kind: 'move', nodeId: ids[0], parentId });
  };

  const openFolders = prefs.openFolders || {};
  const rootCount = visible.filter((n) => !n.parentId).length;

  return (
    <div className="flex flex-col h-full">
      {/* 搜索 + 新建 */}
      <div className="p-2 flex items-center gap-1">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={T.search} className="h-8 text-xs" />
        <Button size="sm" variant="default" onClick={() => handleCreate(null, NODE_TYPE.DOCUMENT)} title={T.newDoc}>+</Button>
        <Button size="sm" variant="ghost" onClick={() => handleCreate(null, NODE_TYPE.FOLDER)} title={T.newFolder}>📁</Button>
      </div>

      {/* 树 */}
      <div className="flex-1 overflow-auto px-1">
        <div className="flex items-center justify-between text-[11px] font-bold text-muted-foreground px-2 py-1 uppercase tracking-wider">
          <span>{T.newDoc}</span>
          <span>({visible.length})</span>
        </div>
        {rootCount === 0 ? (
          <div className="px-2 py-6 text-center text-xs text-muted-foreground italic">
            {search ? '无匹配' : T.empty}
          </div>
        ) : (
          <NestedTree
            nodes={visible}
            activeId={activeId}
            openFolders={openFolders}
            onSelect={(n) => onSelect && onSelect(n.id)}
            onToggle={(id) => onToggle && onToggle(id)}
            onReorder={handleReorder}
            renderNode={({ node, isOpen, onToggle, children }) => {
              const hasChildren = visible.some((n) => n.parentId === node.id);
              return (
                <DatabaseTreeNode
                  node={node}
                  isOpen={isOpen}
                  isActive={node.id === activeId}
                  hasChildren={hasChildren}
                  onToggle={onToggle}
                  onSelect={(id) => onSelect && onSelect(id)}
                  onRename={handleRename}
                  onDelete={handleDelete}
                  onAddChild={(parentId, type) => handleCreate(parentId, type)}
                  onUpdateIcon={handleUpdateIcon}
                >
                  {children}
                </DatabaseTreeNode>
              );
            }}
          />
        )}
      </div>

      {/* 向量索引 / 回收站入口（Task 8 接入真实对话框）*/}
      <div className="p-2 border-t border-border flex gap-1">
        <Button size="sm" variant="ghost" className="flex-1" onClick={() => setVectorOpen(true)}>{T.vector}</Button>
        <Button size="sm" variant="ghost" className="flex-1" onClick={() => setTrashOpen(true)}>{T.toTrash}</Button>
      </div>

      {/* 对话框挂载（受 open 控制）*/}
      <DatabaseVectorDialog
        open={vectorOpen}
        onClose={() => setVectorOpen(false)}
        onSelect={(nodeId) => {
          onSelect && onSelect(nodeId);
          setVectorOpen(false);
        }}
      />
      <TrashBinModal
        open={trashOpen}
        onClose={() => setTrashOpen(false)}
        onNodeChanged={onNodeChanged}
      />
    </div>
  );
}
