'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import type { MiniAppProject } from '@agent-spaces/sdk';
import { sdk } from '@/lib/sdk';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AvatarUploader } from '@/components/common/avatar-uploader';
import { Loader2 } from 'lucide-react';

interface WorkflowsUiEditDialogProps {
  project: MiniAppProject | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated?: (project: MiniAppProject) => void;
}

export function WorkflowsUiEditDialog({ project, open, onOpenChange, onUpdated }: WorkflowsUiEditDialogProps) {
  const t = useTranslations('mini-apps');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (project) {
      setName(project.name);
      setDescription(project.description ?? '');
      setIcon(project.icon ?? '');
      setAvatarUrl(project.avatarUrl ? `${sdk.miniApp.getAvatarUrl(project.id)}?t=${Date.now()}` : '');
    }
  }, [project]);

  const handleAvatarUrlChange = async (url: string) => {
    if (!project) return;
    setAvatarUrl(url);
  };

  const handleUploadDataUrl = async (dataUrl: string): Promise<string> => {
    if (!project) return '';
    const { url } = await sdk.miniApp.uploadAvatar(project.id, dataUrl);
    return `${sdk.miniApp.getAvatarUrl(project.id)}?t=${Date.now()}`;
  };

  const handleSave = async () => {
    if (!project || !name.trim() || saving) return;
    setSaving(true);
    try {
      const updated = await sdk.miniApp.update(project.id, {
        name: name.trim(),
        description: description.trim() || undefined,
        icon: icon || undefined,
      });
      onUpdated?.(updated);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('edit.title')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <AvatarUploader
            name={name}
            avatarUrl={avatarUrl}
            icon={icon}
            onAvatarUrlChange={handleAvatarUrlChange}
            onIconChange={setIcon}
            onUploadDataUrl={handleUploadDataUrl}
            hideUploadLabel
          />
          <div className="space-y-2">
            <Label>{t('edit.name')}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label>{t('edit.description')}</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              disabled={saving}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSave} disabled={!name.trim() || saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t('edit.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
