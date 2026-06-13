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
import { ImagePickerDialog } from '@/components/ui/image-picker-dialog';
import { Camera, X, Loader2 } from 'lucide-react';

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
  const [backgroundUrl, setBackgroundUrl] = useState('');
  const [saving, setSaving] = useState(false);

  // Background image picker state
  const [bgPickerSrc, setBgPickerSrc] = useState('');
  const [bgPickerOpen, setBgPickerOpen] = useState(false);

  useEffect(() => {
    if (project) {
      setName(project.name);
      setDescription(project.description ?? '');
      setIcon(project.icon ?? '');
      setAvatarUrl(project.avatarUrl ? `${sdk.miniApp.getAvatarUrl(project.id)}?t=${Date.now()}` : '');
      setBackgroundUrl(project.backgroundUrl ? `${sdk.miniApp.getBackgroundUrl(project.id)}?t=${Date.now()}` : '');
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

  const handleBackgroundCropComplete = async (dataUrl: string) => {
    if (!project) return;
    try {
      await sdk.miniApp.uploadBackground(project.id, dataUrl);
      setBackgroundUrl(`${sdk.miniApp.getBackgroundUrl(project.id)}?t=${Date.now()}`);
    } catch {
      // Upload failed silently
    }
  };

  const handleRemoveBackground = () => {
    if (!project) return;
    // Clear via update API
    sdk.miniApp.update(project.id, { backgroundUrl: '' }).then((updated) => {
      setBackgroundUrl('');
      onUpdated?.(updated);
    });
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
          {/* Background image upload area */}
          <div className="relative h-28 rounded-xl bg-muted overflow-hidden group">
            {backgroundUrl ? (
              <>
                <img
                  src={backgroundUrl}
                  alt="Background"
                  className="size-full object-cover"
                />
                <button
                  type="button"
                  className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer hover:bg-black/70"
                  onClick={handleRemoveBackground}
                >
                  <X className="size-3" />
                </button>
              </>
            ) : (
              <div className="size-full flex items-center justify-center bg-gradient-to-br from-muted to-muted/50">
                <span className="text-xs text-muted-foreground">{t('edit.defaultBackground')}</span>
              </div>
            )}
            {/* Upload background button */}
            <label className="absolute bottom-2 right-2 flex size-6 items-center justify-center rounded-full bg-black/50 text-white cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70">
              <Camera className="size-3" />
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    setBgPickerSrc(reader.result as string);
                    setBgPickerOpen(true);
                  };
                  reader.readAsDataURL(file);
                  e.target.value = '';
                }}
              />
            </label>
          </div>

          {/* Avatar + Name row: avatar overlaps background bottom */}
          <div className="flex items-end gap-3 -mt-5 px-1">
            <div className="relative shrink-0">
              <AvatarUploader
                name={name}
                avatarUrl={avatarUrl}
                icon={icon}
                onAvatarUrlChange={handleAvatarUrlChange}
                onIconChange={setIcon}
                onUploadDataUrl={handleUploadDataUrl}
                hideUploadLabel
              />
            </div>
            <div className="flex-1 pb-0.5">
              <Label className="text-xs text-muted-foreground mb-1">{t('edit.name')}</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={saving}
                autoFocus
                className="h-7 text-sm"
              />
            </div>
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

      {/* Background image picker dialog */}
      <ImagePickerDialog
        src={bgPickerSrc}
        open={bgPickerOpen}
        onOpenChange={setBgPickerOpen}
        onCropComplete={handleBackgroundCropComplete}
        defaultAspect={16 / 9}
      />
    </Dialog>
  );
}
