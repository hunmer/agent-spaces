'use client';

import { useState, useEffect } from 'react';
import { Library } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { sdk } from '@/lib/sdk';
import { useTranslations } from 'next-intl';
import { workspaceIdFromLocation } from '@/lib/routes';
import { usePathname } from 'next/navigation';
import { KnowledgeBaseListDialog } from './knowledge-base-list-dialog';

export function KnowledgeBasePicker({ value, workspaceId: providedWorkspaceId, onChange }: {
  value: string;
  workspaceId?: string;
  onChange: (v: string) => void;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [kbName, setKbName] = useState('');
  const pathname = usePathname();
  const workspaceId = providedWorkspaceId?.trim() || workspaceIdFromLocation(pathname, typeof window !== 'undefined' ? window.location.search : '');

  useEffect(() => {
    let active = true;
    if (!value || !workspaceId) { setKbName(''); return; }
    sdk.knowledgeBase.list(workspaceId).then((list) => {
      if (!active) return;
      setKbName(list.find((k) => k.id === value)?.name ?? value);
    }).catch(() => { if (active) setKbName(value); });
    return () => { active = false; };
  }, [value, workspaceId]);

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex h-7 flex-1 items-center rounded-md border bg-muted/40 px-2 text-xs">
        <Library className="mr-1.5 size-3.5 text-muted-foreground" />
        <span className="truncate">{kbName || t('knowledgeBase.pickerEmpty')}</span>
      </div>
      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setOpen(true)}>
        {t('knowledgeBase.select')}
      </Button>
      <KnowledgeBaseListDialog
        open={open}
        onOpenChange={setOpen}
        workspaceId={workspaceId ?? ''}
        mode="pick"
        onPicked={(id) => { onChange(id); setOpen(false); }}
      />
    </div>
  );
}
