import { useEffect, useState } from 'react';
import {
  Button, Checkbox,
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@agent-spaces/ui';

/**
 * 删除分组确认框。默认只删除分组；用户可选择同时删除组内节点。
 */
export default function DeleteGroupDialog({ open, group, nodeCount = 0, onClose, onConfirm }) {
  const [deleteElements, setDeleteElements] = useState(false);

  useEffect(() => {
    setDeleteElements(false);
  }, [open, group?.id]);

  const handleConfirm = () => {
    if (!group?.id) return;
    onConfirm(deleteElements);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>删除分组</DialogTitle>
          <DialogDescription>
            确认删除分组「{group?.name || '未命名分组'}」？
          </DialogDescription>
        </DialogHeader>

        <label className="flex cursor-pointer items-center gap-2 py-2 text-sm text-foreground">
          <Checkbox
            checked={deleteElements}
            onCheckedChange={(value) => setDeleteElements(Boolean(value))}
          />
          <span>同时删除分组内的元素（{nodeCount} 个节点）</span>
        </label>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button variant="destructive" disabled={!group?.id} onClick={handleConfirm}>删除</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
