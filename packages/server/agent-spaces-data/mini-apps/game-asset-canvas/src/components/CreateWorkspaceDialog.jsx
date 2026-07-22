// 新建工作区对话框：输入名称后创建。
// 与 DeleteWorkspacesDialog 对称，用 Dialog 组件替代 Popover 内联 input（避开 Radix focus trap 问题）。
import { useEffect, useRef, useState } from 'react';

const {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Button, Input,
} = window.AgentSpacesUI;

/**
 * @param {{
 *   open: boolean,
 *   onClose: ()=>void,
 *   onConfirm:(name:string)=>void,
 *   defaultName?: string, // 默认填充名称（如「新建工作区 N」）
 * }} props
 */
export default function CreateWorkspaceDialog({ open, onClose, onConfirm, defaultName }) {
  const [name, setName] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setName(defaultName || '');
      // 打开时聚焦并全选，方便直接覆盖
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (el) { el.focus(); el.select(); }
      });
    }
  }, [open, defaultName]);

  const handleConfirm = () => {
    const trimmed = name.trim();
    onConfirm(trimmed || defaultName || '新建工作区');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>新建工作区</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-2 py-2">
          <input
            ref={inputRef}
            value={name}
            placeholder="工作区名称"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleConfirm();
              if (e.key === 'Escape') onClose();
            }}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <p className="text-xs text-muted-foreground">新工作区为空画布，创建后自动切换。</p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={handleConfirm}>创建</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
