'use client';

import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';

interface ImportGitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gitUrl: string;
  onGitUrlChange: (url: string) => void;
  loading: boolean;
  onImport: () => void;
  confirmLabel: string;
}

export function ImportGitDialog({
  open,
  onOpenChange,
  gitUrl,
  onGitUrlChange,
  loading,
  onImport,
  confirmLabel,
}: ImportGitDialogProps) {
  const t = useTranslations('import');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('importFromGit')}</DialogTitle>
          <DialogDescription>{t('importFromGitDesc')}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Input
            value={gitUrl}
            onChange={(e) => onGitUrlChange(e.target.value)}
            placeholder={t('importPlaceholder')}
            onKeyDown={(e) => { if (e.key === 'Enter') onImport(); }}
            disabled={loading}
            autoFocus
          />
          <Button onClick={onImport} disabled={loading || !gitUrl.trim()}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
