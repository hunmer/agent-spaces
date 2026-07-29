import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Button, Input,
} from '@agent-spaces/ui';

/**
 * 分组确认对话框（公共组件）。
 * 用于「即将创建多个节点」前询问用户是否把它们归为一个分组，可选填分组名。
 *
 * - 确定：创建分组（分组名可不填，留空时用默认名）
 * - 取消：不分组，节点作为独立节点加入画布
 *
 * 回调约定（二选一由调用方实现，互不耦合）：
 *   onConfirm(groupName | null)  → 创建分组；null 表示用户未填名称，用默认
 *   onCancel()                   → 不分组
 * 也支持结果式回调（更简洁，二选一）：
 *   onResult(result)  → result = { grouped: true, groupName } | { grouped: false }
 *
 * @param {{
 *   open: boolean,
 *   onClose: ()=>void,
 *   defaultGroupName?: string,    // 名称输入框 placeholder/默认提示
 *   title?: string,
 *   description?: string,
 *   count?: number,               // 涉及的节点数（展示在描述里）
 *   onConfirm?: (groupName: string|null)=>void,
 *   onCancel?: ()=>void,
 *   onResult?: (result: {grouped:boolean, groupName?:string|null})=>void,
 * }} props
 */
export default function GroupConfirmDialog({
  open, onClose,
  defaultGroupName = '',
  title,
  description,
  count,
  onConfirm,
  onCancel,
  onResult,
}) {
  const [name, setName] = useState('');

  // 每次打开重置输入
  useEffect(() => { if (open) setName(''); }, [open]);

  const titleText = title || '是否创建分组？';
  const descText = description
    || (count != null
      ? `即将创建 ${count} 个节点，是否将它们归为一个分组？（分组名可不填）`
      : '是否将这些节点归为一个分组？（分组名可不填）');

  const close = () => { setName(''); onClose?.(); };

  const handleConfirm = () => {
    const groupName = name.trim() || null;
    onConfirm?.(groupName);
    onResult?.({ grouped: true, groupName });
    close();
  };

  const handleCancel = () => {
    onCancel?.();
    onResult?.({ grouped: false });
    close();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <DialogContent className="p-5" style={{ width: '420px', maxWidth: '92vw' }}>
        <DialogHeader>
          <DialogTitle className="text-sm">{titleText}</DialogTitle>
          <DialogDescription className="text-[12px] leading-relaxed text-muted-foreground">
            {descText}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5 py-1">
          <span className="text-[11px] font-medium text-muted-foreground">分组名称（可不填）</span>
          <Input
            value={name}
            placeholder={defaultGroupName || '留空使用默认分组名'}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm(); }}
            className="h-9"
            autoFocus
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={handleCancel}>
            不创建分组
          </Button>
          <Button onClick={handleConfirm}>
            创建分组
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
