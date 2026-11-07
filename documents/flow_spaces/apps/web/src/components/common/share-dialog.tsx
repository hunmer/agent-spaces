'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CopyButton } from '@/components/ui/copy-button';

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  url: string;
}

export function ShareDialog({ open, onOpenChange, title, url }: ShareDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share &ldquo;{title}&rdquo;</DialogTitle>
        </DialogHeader>
        <CopyButton value={url} />
      </DialogContent>
    </Dialog>
  );
}
