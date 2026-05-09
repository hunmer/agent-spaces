'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { UserPlus } from 'lucide-react';
import { MemberPicker } from '@/components/common/member-picker';

import type { MemberCandidate } from '@/components/common/member-picker';

export type { MemberCandidate as AddMemberCandidate };

interface AddMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidates: MemberCandidate[];
  onAdd: (members: string[]) => void;
}

export function AddMemberDialog({ open, onOpenChange, candidates, onAdd }: AddMemberDialogProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [dialogKey, setDialogKey] = useState(0);

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id],
    );
  };

  const handleConfirm = () => {
    if (selected.length === 0) return;
    onAdd(selected);
    handleClose(false);
  };

  const handleClose = (val: boolean) => {
    if (!val) {
      setSelected([]);
      setDialogKey((k) => k + 1);
    }
    onOpenChange(val);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>添加成员</DialogTitle>
          <DialogDescription>选择要添加到频道的成员</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <MemberPicker
            key={dialogKey}
            candidates={candidates}
            selected={selected}
            onToggle={toggle}
            searchPlaceholder="搜索成员..."
            emptyText="无可用成员"
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => handleClose(false)}>取消</Button>
            <Button onClick={handleConfirm} disabled={selected.length === 0}>
              <UserPlus className="size-3.5 mr-1" />添加 ({selected.length})
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
