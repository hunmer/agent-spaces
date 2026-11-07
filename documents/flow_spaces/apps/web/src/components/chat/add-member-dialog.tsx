'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { MemberPicker } from '@/components/common/member-picker';

import type { MemberCandidate } from '@/components/common/member-picker';

export type { MemberCandidate as AddMemberCandidate };

interface AddMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidates: MemberCandidate[];
  defaultSelected?: string[];
  onAdd: (members: string[]) => void;
  /** 过滤候选成员，默认只展示 agent 类型 */
  filter?: (candidate: MemberCandidate) => boolean;
}

export function AddMemberDialog({ open, onOpenChange, candidates, defaultSelected, onAdd, filter }: AddMemberDialogProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const t = useTranslations('chat.addMember');
  const [dialogKey, setDialogKey] = useState(0);

  // Track whether we've initialized for this open cycle
  const [initialized, setInitialized] = useState(false);

  // When dialog opens, reset selected to defaultSelected
  if (open && !initialized) {
    setSelected(defaultSelected ?? []);
    setInitialized(true);
  }

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id],
    );
  };

  const handleConfirm = () => {
    onAdd(selected);
    handleClose(false);
  };

  const handleClose = (val: boolean) => {
    if (!val) {
      setSelected([]);
      setInitialized(false);
      setDialogKey((k) => k + 1);
    }
    onOpenChange(val);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[80vw] max-w-[80vw] flex flex-col" style={{ height: '80vh' }}>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <MemberPicker
          key={dialogKey}
          candidates={candidates}
          filter={filter}
          selected={selected}
          onToggle={toggle}
          searchPlaceholder={t('searchPlaceholder')}
          emptyText={t('emptyText')}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>{t('cancel')}</Button>
          <Button onClick={handleConfirm}>
            <UserPlus className="size-3.5 mr-1" />{t('confirm')} ({selected.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
