import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger, ScrollArea } from '@agent-spaces/ui';
import DeleteWorkspacesDialog from './DeleteWorkspacesDialog';
import CreateWorkspaceDialog from './CreateWorkspaceDialog';

/**
 * 顶部工作区切换 popover：展示工作区列表，支持【切换/重命名/删除】，底部【创建】【批量删除】。
 * 创建/批量删除用独立 Dialog（避免 Radix Popover focus trap 与内联 input 竞争）。
 * 当前激活工作区高亮。每个工作区隔离节点和生成记录。
 *
 * @param {{
 *   workspaces: Array<{id,name,createdAt}>,
 *   activeId: string,
 *   onSwitch:(id)=>void,
 *   onCreate:(name)=>void,
 *   onDelete:(id|id[])=>void,
 *   onRename:(id,name)=>void,
 * }} props
 */
export default function WorkspaceSwitcher({ workspaces, activeId, onSwitch, onCreate, onDelete, onRename }) {
  const [open, setOpen] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null); // null | [ids]
  const [createOpen, setCreateOpen] = useState(false);

  const active = workspaces.find((ws) => ws.id === activeId) || workspaces[0];

  const commitRename = (id) => {
    const name = renameValue.trim();
    if (name) onRename(id, name);
    setRenamingId(null);
    setRenameValue('');
  };

  const startRename = (ws) => {
    setRenamingId(ws.id);
    setRenameValue(ws.name);
  };

  // 单个删除：打开弹窗预选该项
  const requestDelete = (ws) => {
    setDeleteTarget([ws.id]);
    setOpen(false);
  };

  // 批量删除：打开弹窗空选
  const requestBatchDelete = () => {
    setDeleteTarget([]);
    setOpen(false);
  };

  const confirmDelete = (ids) => {
    onDelete(ids);
    setDeleteTarget(null);
  };

  const requestCreate = () => {
    setCreateOpen(true);
    setOpen(false);
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium transition hover:border-primary"
            title="切换工作区"
          >
            <span>🗂️</span>
            <span className="max-w-[120px] truncate">{active?.name || '工作区'}</span>
            <span className="text-muted-foreground">▾</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-sm font-semibold">工作区</span>
            <span className="text-xs text-muted-foreground">{workspaces.length} 个</span>
          </div>

          <ScrollArea className="max-h-72">
            <div className="flex flex-col gap-0.5 p-1.5">
              {workspaces.map((ws) => {
                const isActive = ws.id === activeId;
                const isRenaming = renamingId === ws.id;
                return (
                  <div
                    key={ws.id}
                    className={`group flex items-center gap-1 rounded-md px-2 py-1.5 text-xs ${
                      isActive ? 'bg-primary/10 text-primary' : 'hover:bg-muted'
                    }`}
                  >
                    {isRenaming ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => commitRename(ws.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitRename(ws.id);
                          if (e.key === 'Escape') { setRenamingId(null); setRenameValue(''); }
                        }}
                        className="min-w-0 flex-1 rounded border border-primary bg-background px-1.5 py-0.5 text-xs outline-none"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => { onSwitch(ws.id); setOpen(false); }}
                        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                        title={isActive ? '当前工作区' : '点击切换'}
                      >
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${isActive ? 'bg-primary' : 'bg-transparent'}`} />
                        <span className="truncate">{ws.name}</span>
                      </button>
                    )}

                    {!isRenaming && (
                      <div className="flex shrink-0 items-center opacity-0 transition group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); startRename(ws); }}
                          className="rounded px-1 py-0.5 text-[10px] text-muted-foreground hover:bg-background hover:text-primary"
                          title="重命名"
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); requestDelete(ws); }}
                          disabled={workspaces.length <= 1}
                          className="rounded px-1 py-0.5 text-[10px] text-muted-foreground hover:bg-red-500/10 hover:text-red-500 disabled:opacity-30"
                          title={workspaces.length <= 1 ? '至少保留一个工作区' : '删除'}
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          <div className="flex flex-col gap-1.5 border-t border-border p-2">
            <button
              type="button"
              onClick={requestCreate}
              className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-border px-2 py-1.5 text-xs text-muted-foreground transition hover:border-primary hover:text-primary"
            >
              <span>＋</span>
              <span>新建工作区</span>
            </button>
            {workspaces.length > 1 && (
              <button
                type="button"
                onClick={requestBatchDelete}
                className="flex w-full items-center justify-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-red-500/10 hover:text-red-500"
              >
                批量删除工作区
              </button>
            )}
          </div>
        </PopoverContent>
      </Popover>

      <CreateWorkspaceDialog
        open={createOpen}
        defaultName={`新建工作区 ${workspaces.length + 1}`}
        onClose={() => setCreateOpen(false)}
        onConfirm={onCreate}
      />

      <DeleteWorkspacesDialog
        open={!!deleteTarget}
        workspaces={workspaces}
        activeId={activeId}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </>
  );
}


