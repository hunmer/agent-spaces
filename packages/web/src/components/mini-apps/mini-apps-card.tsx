'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { MiniAppProject } from '@agent-spaces/sdk';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Pencil, Copy, Trash2, MoreVertical, Download, Share2, FolderOpen } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ShareDialog } from '@/components/common/share-dialog';
import { WorkflowsUiEditDialog } from './mini-apps-edit-dialog';
import { AgentIcon } from '@/components/common/agent-icon';
import { FeatureCard } from '@/components/ui/feature-card';
import { nativeNavigate } from '@/lib/navigate';
import { useRouter } from 'next/navigation';
import { sdk } from '@/lib/sdk';
import { resolveServerAssetUrl } from '@/lib/server';
import { AvatarGroup } from '@/components/ui/avatar-group';

interface WorkflowsUiCardProps {
  project: MiniAppProject;
  onDelete: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onUpdated?: (project: MiniAppProject) => void;
  /** 全部插件清单（由父组件加载，用于展示已启用插件的图标） */
  allPlugins?: { id: string; name: string; iconPath?: string }[];
}

export function WorkflowsUiCard({ project, onDelete, onDuplicate, onUpdated, allPlugins }: WorkflowsUiCardProps) {
  const t = useTranslations('mini-apps');
  const router = useRouter();
  const [shareOpen, setShareOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/mini-apps-preview/${project.id}`
    : '';

  const handleExportZip = async () => {
    const blob = await sdk.miniApp.exportZip(project.id);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(project.name || 'project').replace(/[^\w\-.]/g, '_')}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRevealFolder = () => sdk.miniApp.revealFolder(project.id);

  const enabledPluginAvatars = useMemo(() => {
    const ids = project.enabledPlugins;
    if (!ids?.length || !allPlugins?.length) return [];
    const enabledSet = new Set(ids);
    return allPlugins
      .filter(p => enabledSet.has(p.id))
      .map(p => ({
        imageUrl: p.iconPath ? resolveServerAssetUrl(`/api/plugins/${p.id}/icon`) : '',
        name: p.name,
      }));
  }, [project.enabledPlugins, allPlugins]);

  const hasBackground = !!project.backgroundUrl;
  const backgroundUrl = project.backgroundUrl
    ? sdk.miniApp.getBackgroundUrl(project.id)
    : undefined;

  return (
    <>
      <FeatureCard
        backgroundImage={backgroundUrl}
        color="blue"
        className="cursor-pointer h-[260px]"
        centerIcon={
          <AgentIcon
            name={project.name}
            avatarUrl={project.avatarUrl ? sdk.miniApp.getAvatarUrl(project.id) : undefined}
            icon={project.icon}
            bordered={false}
            textSize="text-4xl"
            rounded="rounded-2xl"
            className="size-24"
          />
        }
        onClick={() => nativeNavigate(router, `/mini-apps/${project.id}`)}
      >
        {/* Dropdown menu (top-right) */}
        <div className="absolute top-2 right-2 z-20 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger className={cn(
              "inline-flex items-center justify-center rounded-md h-7 w-7 cursor-pointer transition-colors",
              hasBackground ? "hover:bg-black/30 text-white" : "hover:bg-accent text-foreground"
            )}>
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

        {/* Type badge (top-left) */}
        <div className="absolute top-2.5 left-3 z-10">
          <Badge
            variant={project.type === 'react' ? 'default' : 'secondary'}
            className={cn("text-[10px]", hasBackground && "bg-black/50 text-white border-white/20 hover:bg-black/60")}
          >
            {project.type === 'react' ? 'React' : 'HTML'}
          </Badge>
        </div>

        {/* Bottom glass panel */}
        <div className="mt-auto">
          <div className={cn(
            "rounded-t-xl p-3",
            hasBackground
              ? "bg-black/50 backdrop-blur-md text-white"
              : "bg-background/80 dark:bg-background/60 backdrop-blur-sm border-t text-card-foreground"
          )}>
            {/* Name */}
            <p className="text-sm font-medium truncate mb-1">{project.name}</p>

            {/* Tags + Plugin icons — always render row for consistent height */}
            <div className="flex items-center gap-2 flex-wrap min-h-[22px]">
              {project.tags && project.tags.length > 0 ? (
                <div className="flex gap-1">
                  {project.tags.slice(0, 2).map(tag => (
                    <span
                      key={tag}
                      className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded",
                        hasBackground ? "bg-white/20 text-white/90" : "bg-muted text-muted-foreground"
                      )}
                    >
                      {tag}
                    </span>
                  ))}
                  {project.tags.length > 2 && (
                    <span className={cn(
                      "text-[10px]",
                      hasBackground ? "text-white/70" : "text-muted-foreground"
                    )}>
                      +{project.tags.length - 2}
                    </span>
                  )}
                </div>
              ) : (
                <span className={cn(
                  "text-[10px]",
                  hasBackground ? "text-white/50" : "text-muted-foreground/50"
                )}>
                  —
                </span>
              )}
              {enabledPluginAvatars.length > 0 && (
                <AvatarGroup avatarUrls={enabledPluginAvatars} size="sm" />
              )}
            </div>
          </div>
        </div>
      </FeatureCard>

      {/* Dialogs */}
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
    </>
  );
}
