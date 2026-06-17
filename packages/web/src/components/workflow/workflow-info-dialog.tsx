'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { TagInput } from '@/components/common/tag-input';
import { AvatarUploader } from '@/components/common/avatar-uploader';
import { Switch } from '@/components/ui/switch';
import type { Workflow } from '@agent-spaces/shared';

interface WorkflowInfoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflow: Workflow | null;
  onSave: (updates: Partial<Workflow>) => void;
}

export function WorkflowInfoDialog({ open, onOpenChange, workflow, onSave }: WorkflowInfoDialogProps) {
  const t = useTranslations('workflows.infoDialog');
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [published, setPublished] = useState(false);

  useEffect(() => {
    if (workflow) {
      setName(workflow.name || '');
      setIcon(workflow.icon || '');
      setAvatarUrl('');
      setDescription(workflow.description || '');
      setTags(workflow.tags || []);
      setPublished(workflow.published ?? false);
    } else {
      setPublished(false);
    }
  }, [workflow, open]);

  const handleSave = () => {
    onSave({
      name: name.trim() || t('untitled'),
      icon: icon || undefined,
      description: description.trim() || undefined,
      tags: tags.length > 0 ? tags : undefined,
      published,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex justify-center">
            <AvatarUploader
              name={name}
              avatarUrl={avatarUrl}
              icon={icon}
              onAvatarUrlChange={setAvatarUrl}
              onIconChange={setIcon}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">{t('nameLabel')}</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('namePlaceholder')}
              className="h-8 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">{t('descriptionLabel')}</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('descriptionPlaceholder')}
              className="text-sm min-h-[60px] resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">{t('tagsLabel')}</label>
            <TagInput
              value={tags}
              onChange={setTags}
              placeholder={t('tagPlaceholder')}
              addLabel={t('addTag')}
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2">
            <div className="min-w-0">
              <div className="text-xs font-medium">{t('publishedLabel')}</div>
              <div className="text-[11px] text-muted-foreground">{t('publishedHint')}</div>
            </div>
            <Switch checked={published} onCheckedChange={setPublished} />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('cancel')}</Button>
          <Button onClick={handleSave}>{t('save')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
