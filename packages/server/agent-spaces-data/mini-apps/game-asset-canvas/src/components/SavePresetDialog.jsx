import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Button, Input, ScrollArea,
} from '@agent-spaces/ui';
import { NODE_META } from '../utils/constants';

/**
 * 保存为预设对话框。
 * 展示标题输入框 + 待保存的节点列表（图标 + label）+ 涉及的分组数。
 *
 * 由底部多选工具栏【保存预设】按钮触发：传入待保存的选中节点快照（nodes/edges/groups），
 * 确认后回调把快照交给调用方序列化入库。
 *
 * @param {{
 *   open: boolean,
 *   onClose: ()=>void,
 *   pendingNodes: Array,     // 待保存的选中节点（含完整 data，用于展示）
 *   groupCount?: number,     // 涉及的分组数（展示提示）
 *   onConfirm: (name: string)=>void,
 * }} props
 */
export default function SavePresetDialog({ open, onClose, pendingNodes, groupCount = 0, onConfirm }) {
  const [name, setName] = useState('');

  useEffect(() => { if (open) setName(''); }, [open]);

  const count = pendingNodes?.length || 0;

  const handleConfirm = () => {
    const trimmed = name.trim() || `预设 ${new Date().toLocaleString('zh-CN', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    })}`;
    onConfirm?.(trimmed);
    setName('');
    onClose?.();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose?.(); }}>
      <DialogContent className="p-5" style={{ width: '420px', maxWidth: '92vw' }}>
        <DialogHeader>
          <DialogTitle className="text-sm">保存为预设</DialogTitle>
          <DialogDescription className="text-[12px] leading-relaxed text-muted-foreground">
            将选中的 {count} 个节点{groupCount > 0 ? `（含 ${groupCount} 个分组）` : ''}保存为可复用预设，可拖拽到画布快速还原。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5 py-1">
          <span className="text-[11px] font-medium text-muted-foreground">预设名称</span>
          <Input
            value={name}
            placeholder="输入预设名称（如：角色生成工作流）"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm(); }}
            className="h-9"
            autoFocus
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium text-muted-foreground">
            包含节点（{count}）
          </span>
          <ScrollArea className="max-h-48 rounded-md border border-border">
            <div className="flex flex-wrap gap-1.5 p-2">
              {pendingNodes?.map((n) => {
                const meta = NODE_META[n.type] || {};
                return (
                  <span
                    key={n.id}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-1.5 py-1 text-[11px] text-foreground"
                  >
                    <span className="text-sm leading-none">{meta.icon || '🔷'}</span>
                    <span className="max-w-24 truncate">{meta.label || n.type}</span>
                  </span>
                );
              })}
              {count === 0 && (
                <span className="px-1 py-2 text-[11px] text-muted-foreground">没有选中节点</span>
              )}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={handleConfirm} disabled={count === 0}>保存预设</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
