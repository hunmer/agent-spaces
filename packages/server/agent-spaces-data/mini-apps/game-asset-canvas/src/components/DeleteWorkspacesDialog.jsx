// 删除工作区确认弹窗：纯确认框，无需选择，直接删 deleteTarget 指向的单个工作区。
// 替换原生 window.confirm。
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Button } from '@agent-spaces/ui';

/**
 * @param {{
 *   open: boolean,
 *   target?: { id: string, name: string } | null, // 待删除工作区
 *   onClose: ()=>void,
 *   onConfirm:(id:string)=>void,
 * }} props
 */
export default function DeleteWorkspacesDialog({ open, target, onClose, onConfirm }) {
  const handleConfirm = () => {
    if (!target?.id) return;
    onConfirm(target.id);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>删除工作区</DialogTitle>
        </DialogHeader>

        <div className="py-2">
          <p className="text-sm text-muted-foreground">
            确认删除工作区「<span className="font-medium text-foreground">{target?.name || ''}</span>」？该工作区的节点和生成记录将一并清除，且不可恢复。
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button variant="destructive" disabled={!target?.id} onClick={handleConfirm}>
            删除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
