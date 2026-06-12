'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { WorkflowUiProject } from '@agent-spaces/sdk';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Pencil, Copy, Trash2, MoreVertical, Puzzle, Download, Share2, FolderOpen } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ShareDialog } from '@/components/common/share-dialog';
import { WorkflowsUiEditDialog } from './workflows-ui-edit-dialog';
import { AgentIcon } from '@/components/common/agent-icon';
import { nativeNavigate } from '@/lib/navigate';
import { useRouter } from 'next/navigation';
import { sdk } from '@/lib/sdk';

interface WorkflowsUiCardProps {
  project: WorkflowUiProject;
  onDelete: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onUpdated?: (project: WorkflowUiProject) => void;
}

export function WorkflowsUiCard({ project, onDelete, onDuplicate, onUpdated }: WorkflowsUiCardProps) {
  const t = useTranslations('workflows-ui');
  const router = useRouter();
  const [shareOpen, setShareOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/workflows-ui-preview/${project.id}`
    : '';

  const handleExportZip = async () => {
    const blob = await sdk.workflowUi.exportZip(project.id);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(project.name || 'project').replace(/[^\w\-.]/g, '_')}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRevealFolder = () => sdk.workflowUi.revealFolder(project.id);

  const pluginCount = project.enabledPlugins?.length ?? 0;

  return (
    <Card
      className="group overflow-hidden hover:shadow-md transition-shadow cursor-pointer relative"
      onClick={() => nativeNavigate(router, `/workflows-ui/${project.id}`)}
    >
      <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground h-7 w-7 cursor-pointer">
            <MoreVertical className="h-3.5 w-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setEditOpen(true); }}>
              <Pencil className="h-3.5 w-3.5 mr-2" /> {t('card.edit')}
            </DropdownMenuItem>
            {onDuplicate && (
              <DropdownMenuItem onClick={() => onDuplicate(project.id)}>
                <Copy className="h-3.5 w-3.5 mr-2" /> {t('card.duplicate')}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-3.5 w-3.5 mr-2" /> {t('card.delete')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleExportZip}>
              <Download className="h-3.5 w-3.5 mr-2" /> {t('card.exportZip')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleRevealFolder}>
              <FolderOpen className="h-3.5 w-3.5 mr-2" /> {t('card.revealFolder')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setShareOpen(true); }}>
              <Share2 className="h-3.5 w-3.5 mr-2" /> {t('card.share')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div onClick={(e) => e.stopPropagation()}>
        <ShareDialog open={shareOpen} onOpenChange={setShareOpen} title={project.name} url={shareUrl} />
        <WorkflowsUiEditDialog project={project} open={editOpen} onOpenChange={setEditOpen} onUpdated={onUpdated} />
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('card.deleteTitle')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('card.deleteConfirm', { name: project.name })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('card.cancel')}</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => onDelete(project.id)}>
                {t('card.delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <AgentIcon
            name={project.name}
            avatarUrl={project.avatarUrl ? sdk.workflowUi.getAvatarUrl(project.id) : undefined}
            icon={project.icon}
            className="size-6 rounded shrink-0"
          />
          <CardTitle className="text-sm truncate">{project.name}</CardTitle>
          <Badge variant={project.type === 'react' ? 'default' : 'secondary'} className="text-[10px] ml-auto me-6 shrink-0">
            {project.type === 'react' ? 'React' : 'HTML'}
          </Badge>
        </div>
        {project.description && (
          <CardDescription className="text-xs line-clamp-2">{project.description}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center gap-2 flex-wrap">
          {project.tags && project.tags.length > 0 && (
            <div className="flex gap-1">
              {project.tags.slice(0, 2).map(tag => (
                <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{tag}</span>
              ))}
              {project.tags.length > 2 && (
                <span className="text-[10px] text-muted-foreground">+{project.tags.length - 2}</span>
              )}
            </div>
          )}
          {pluginCount > 0 && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
              <Puzzle className="h-3 w-3" /> {pluginCount}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
