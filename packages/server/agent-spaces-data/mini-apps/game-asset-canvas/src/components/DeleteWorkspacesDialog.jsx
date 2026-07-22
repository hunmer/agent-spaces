// 批量删除工作区确认弹窗：替换原生 window.confirm。
// 可多选工作区批量删除，至少保留一个工作区；当前激活工作区不可删除（避免清空当前视图）。
import { useEffect, useMemo, useState } from 'react';

const {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Button,
} = window.AgentSpacesUI;

/**
 * @param {{
 *   open: boolean,
 *   workspaces: Array<{id,name,createdAt}>,
 *   activeId: string,
 *   onClose: ()=>void,
 *   onConfirm:(ids:string[])=>void, // 传入待删除 id 数组
 * }} props
 */
export default function DeleteWorkspacesDialog({ open, workspaces, activeId, onClose, onConfirm }) {
  const [selected, setSelected] = useState([]);

  useEffect(() => {
    if (open) setSelected([]);
  }, [open]);

  // 可删除项：非当前激活（删激活会清空当前视图，体验差，单独走 switch 后再删）
  const deletable = useMemo(
    () => workspaces.filter((ws) => ws.id !== activeId),
    [workspaces, activeId],
  );

  const toggle = (id) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };
  const allChecked = deletable.length > 0 && selected.length === deletable.length;
  const toggleAll = () => setSelected(allChecked ? [] : deletable.map((ws) => ws.id));

  const handleConfirm = () => {
    if (!selected.length) return;
    onConfirm(selected);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>删除工作区</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-2">
          <p className="text-xs text-muted-foreground">
            删除后，该工作区的节点和生成记录将一并清除，且不可恢复。至少保留一个工作区。
          </p>

          {deletable.length === 0 ? (
            <div className="rounded-md bg-muted px-3 py-4 text-center text-sm text-muted-foreground">
              没有可删除的工作区（当前只剩当前工作区）
            </div>
          ) : (
            <>
              <label className="flex items-center gap-2 border-b border-border pb-2 text-xs font-medium">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={toggleAll}
                  className="h-3.5 w-3.5"
                />
                全选（{selected.length}/{deletable.length}）
              </label>
              <div className="flex max-h-60 flex-col gap-1 overflow-auto">
                {deletable.map((ws) => (
                  <label
                    key={ws.id}
                    className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition hover:bg-muted ${
                      selected.includes(ws.id) ? 'bg-red-500/5' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(ws.id)}
                      onChange={() => toggle(ws.id)}
                      className="h-3.5 w-3.5"
                    />
                    <span className="flex-1 truncate">{ws.name}</span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button
            variant="destructive"
            disabled={!selected.length}
            onClick={handleConfirm}
          >
            删除{selected.length > 0 ? `（${selected.length}）` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
