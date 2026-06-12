'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { sdk } from '@/lib/sdk';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { nativeNavigate } from '@/lib/navigate';
import { useRouter } from 'next/navigation';

interface WorkflowsUiCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WorkflowsUiCreateDialog({ open, onOpenChange }: WorkflowsUiCreateDialogProps) {
  const t = useTranslations('mini-apps');
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'react' | 'html'>('react');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    try {
      const project = await sdk.miniApp.create({ name: trimmed, type, description: description.trim() || undefined });
      onOpenChange(false);
      setName('');
      setDescription('');
      setType('react');
      nativeNavigate(router, `/mini-apps/${project.id}`);
    } finally {
      setCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleCreate();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('create.title')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t('create.name')}</Label>
            <Input
              placeholder={t('create.namePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={creating}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label>{t('create.description')}</Label>
            <Textarea
              placeholder={t('create.descriptionPlaceholder')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              disabled={creating}
            />
          </div>
          <div className="space-y-2">
            <Label>{t('create.type')}</Label>
            <Select value={type} onValueChange={(v) => setType(v as 'react' | 'html')} disabled={creating}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="react">React</SelectItem>
                <SelectItem value="html">HTML</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleCreate} disabled={!name.trim() || creating}>
            {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t('create.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
