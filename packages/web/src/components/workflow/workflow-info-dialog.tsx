'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';
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
import { workflowFolderApi } from '@/lib/workflow-api';
import { copyToClipboard } from '@/lib/utils';
import type { Workflow, WorkflowFolder, WorkflowNode } from '@agent-spaces/shared';

interface WorkflowInfoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflow: Workflow | null;
  onSave: (updates: Partial<Workflow>) => void;
}

function buildWorkflowFolderPath(
  folders: WorkflowFolder[],
  folderId: string | null | undefined,
  workflowName: string,
): string {
  const folderMap = new Map(folders.map(folder => [folder.id, folder]));
  const segments: string[] = [workflowName];
  const visited = new Set<string>();
  let currentId = folderId ?? null;

  while (currentId) {
    if (visited.has(currentId)) break;
    visited.add(currentId);
    const folder = folderMap.get(currentId);
    if (!folder) break;
    segments.unshift(folder.name);
    currentId = folder.parentId;
  }

  return `/${segments.join('/')}`;
}

function formatNodeJson(nodes: WorkflowNode[]): string {
  if (nodes.length === 0) return '[]';
  return JSON.stringify(
    nodes.map(({ position: _position, ...node }) => node),
    null,
    2,
  );
}

function buildWorkflowInfoText(workflow: Workflow, untitled: string, folders: WorkflowFolder[]): string {
  const startNodes = workflow.nodes.filter(node => node.type === 'start');
  const endNodes = workflow.nodes.filter(node => node.type === 'end');
  const workflowName = workflow.name || untitled;
  const workflowPath = buildWorkflowFolderPath(folders, workflow.folderId, workflowName);

  return [
    '【工作流路径】',
    workflowPath,
    '',
    '【工作流名称】',
    workflowName,
    '',
    '【注释】',
    workflow.description?.trim() || '无',
    '',
    '【开始节点需要的参数】',
    formatNodeJson(startNodes),
    '',
    '【结束节点返回的参数】',
    formatNodeJson(endNodes),
  ].join('\n');
}

export function WorkflowInfoDialog({ open, onOpenChange, workflow, onSave }: WorkflowInfoDialogProps) {
  const t = useTranslations('workflows.infoDialog');
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [published, setPublished] = useState(false);
  const [copied, setCopied] = useState(false);
  const [folders, setFolders] = useState<WorkflowFolder[]>([]);

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

  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  useEffect(() => {
    if (!open || !workflow) return undefined;

    let cancelled = false;
    workflowFolderApi.list()
      .then((nextFolders) => {
        if (!cancelled) setFolders(nextFolders);
      })
      .catch(() => {
        if (!cancelled) setFolders([]);
      });

    return () => {
      cancelled = true;
    };
  }, [open, workflow]);

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

  const handleCopyWorkflowInfo = async () => {
    if (!workflow) return;
    try {
      await copyToClipboard(buildWorkflowInfoText(workflow, t('untitled'), folders));
      setCopied(true);
      toast.success(t('copySuccess'));
    } catch {
      toast.error(t('copyFailed'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <DialogTitle>{t('title')}</DialogTitle>
            {workflow && (
              <Button variant="outline" size="sm" className="h-8 gap-1.5 me-5" onClick={handleCopyWorkflowInfo}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? t('copied') : t('copyInfo')}
              </Button>
            )}
          </div>
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
