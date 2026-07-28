import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger, ScrollArea } from '@agent-spaces/ui';
import DeleteWorkspacesDialog from './DeleteWorkspacesDialog';
import CreateWorkspaceDialog from './CreateWorkspaceDialog';

/**
 * 顶部工作区切换 popover：展示工作区列表，支持【切换/重命名/删除】，底部【创建】。
 * 创建/重命名复用同一个 CreateWorkspaceDialog（mode 区分），删除用独立确认框。
 * 当前激活工作区高亮。每个工作区隔离节点和生成记录。
 *
 * @param {{
 *   workspaces: Array<{id,name,createdAt,directory?}>,
 *   activeId: string,
 *   onSwitch:(id)=>void,
 *   onCreate:(payload:{name:string, directory?:string})=>void,
 *   onDelete:(id:string)=>void,
 *   onRename:(id:string, name:string, directory?:string)=>void,
 * }} props
 */
export default function WorkspaceSwitcher({ workspaces, activeId, onSwitch, onCreate, onDelete, onRename }) {
  const [open, setOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null); // null | {id,name}
  // 编辑器状态：null 关闭；{mode:'create'} 创建；{mode:'rename', target:{id,name}} 重命名
  const [editor, setEditor] = useState(null);

  const active = workspaces.find((ws) => ws.id === activeId) || workspaces[0];

  const requestRename = (ws) => {
    setEditor({ mode: 'rename', target: { id: ws.id, name: ws.name, directory: ws.directory || '' } });
    setOpen(false);
  };

  const requestCreate = () => {
    setEditor({ mode: 'create' });
    setOpen(false);
  };

  const confirmEditor = (payload) => {
    if (editor?.mode === 'rename') {
      onRename(editor.target.id, payload.name, payload.directory);
    } else {
      onCreate(payload);
    }
    setEditor(null);
  };

  // 单个删除：打开确认弹窗，预选该项
  const requestDelete = (ws) => {
    setDeleteTarget({ id: ws.id, name: ws.name });
    setOpen(false);
  };

  const confirmDelete = (id) => {
    onDelete(id);
    setDeleteTarget(null);
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <button
              type="button"
              className="flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium transition hover:border-primary"
              title="切换工作区"
            >
              <span>🗂️</span>
              <span className="max-w-[120px] truncate">{active?.name || '工作区'}</span>
              <span className="text-muted-foreground">▾</span>
            </button>
          }
        />
        <PopoverContent className="w-72 p-0" align="start">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-sm font-semibold">工作区</span>
            <span className="text-xs text-muted-foreground">{workspaces.length} 个</span>
          </div>

          <ScrollArea className="max-h-72">
            <div className="flex flex-col gap-0.5 p-1.5">
              {workspaces.map((ws) => {
                const isActive = ws.id === activeId;
                return (
                  <div
                    key={ws.id}
                    className={`group flex items-center gap-1 rounded-md px-2 py-1.5 text-xs ${
                      isActive ? 'bg-primary/10 text-primary' : 'hover:bg-muted'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => { onSwitch(ws.id); setOpen(false); }}
                      className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                      title={isActive ? '当前工作区' : '点击切换'}
                    >
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${isActive ? 'bg-primary' : 'bg-transparent'}`} />
                      <span className="truncate">{ws.name}</span>
                    </button>

                    <div className="flex shrink-0 items-center opacity-0 transition group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); requestRename(ws); }}
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
          </div>
        </PopoverContent>
      </Popover>

      <CreateWorkspaceDialog
        open={!!editor}
        mode={editor?.mode || 'create'}
        defaultName={editor?.mode === 'create' ? `新建工作区 ${workspaces.length + 1}` : undefined}
        initialName={editor?.mode === 'rename' ? editor.target.name : undefined}
        initialDirectory={editor?.mode === 'rename' ? editor.target.directory : undefined}
        onClose={() => setEditor(null)}
        onConfirm={confirmEditor}
      />

      <DeleteWorkspacesDialog
        open={!!deleteTarget}
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </>
  );
}


