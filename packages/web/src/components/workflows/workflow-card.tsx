'use client';

import { useMemo } from 'react';
import type { WorkflowTemplate } from '@agent-spaces/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Pencil, Copy, Trash2, MoreVertical, Download, Globe, Lock, Eye } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { nativeNavigate } from '@/lib/navigate';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Checkbox } from '@/components/ui/checkbox';
import { AvatarGroup } from '@/components/ui/avatar-group';
import { resolveServerAssetUrl } from '@/lib/server';

interface WorkflowCardProps {
  workflow: WorkflowTemplate;
  onEdit: (wf: WorkflowTemplate) => void;
  onDuplicate: (wf: WorkflowTemplate) => void;
  onDelete: (wf: WorkflowTemplate) => void;
  onExport: (wf: WorkflowTemplate) => void;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  /** 全部插件清单（由父组件加载，用于展示已启用插件的图标） */
  allPlugins?: { id: string; name: string; iconPath?: string }[];
}

export function WorkflowCard({ workflow, onEdit, onDuplicate, onDelete, onExport, selectionMode, selected, onToggleSelect, allPlugins }: WorkflowCardProps) {
  const router = useRouter();
  const t = useTranslations('workflows');

  const enabledPluginAvatars = useMemo(() => {
    const ids = workflow.enabledPlugins;
    if (!ids?.length || !allPlugins?.length) return [];
    const enabledSet = new Set(ids);
    return allPlugins
      .filter(p => enabledSet.has(p.id))
      .map(p => ({
        imageUrl: p.iconPath ? resolveServerAssetUrl(`/api/plugins/${p.id}/icon`) : '',
        name: p.name,
      }));
  }, [workflow.enabledPlugins, allPlugins]);

  const createdText = useMemo(() => {
    if (!workflow.createdAt) return '';
    return new Date(workflow.createdAt).toLocaleString();
  }, [workflow.createdAt]);

  return (
    <Card
      className={`group overflow-hidden hover:shadow-md transition-shadow relative ${selectionMode ? 'cursor-pointer' : 'cursor-pointer'} ${selectionMode && selected ? 'ring-2 ring-primary' : ''}`}
      onClick={() => {
        if (selectionMode) {
          onToggleSelect?.();
        } else {
          onEdit(workflow);
        }
      }}
    >
      {selectionMode && (
        <div className="absolute top-2 right-2 z-10" onClick={(e) => { e.stopPropagation(); onToggleSelect?.(); }}>
          <Checkbox checked={selected} className="h-4 w-4" />
        </div>
      )}
      {!selectionMode && (
        <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground h-7 w-7 cursor-pointer">
              <MoreVertical className="h-3.5 w-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(workflow)}>
                <Pencil className="h-3.5 w-3.5 mr-2" /> {t('card.edit')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDuplicate(workflow)}>
                <Copy className="h-3.5 w-3.5 mr-2" /> {t('card.duplicate')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onExport(workflow)}>
                <Download className="h-3.5 w-3.5 mr-2" /> {t('card.export')}
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onDelete(workflow)}>
                <Trash2 className="h-3.5 w-3.5 mr-2" /> {t('card.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          {workflow.icon ? (
            <span className="text-xl leading-none">{workflow.icon}</span>
          ) : (
            <span className="w-6 h-6 rounded bg-primary/10 text-xs font-bold flex items-center justify-center text-primary shrink-0">
              {(workflow.name || t('card.defaultInitial')).charAt(0).toUpperCase()}
            </span>
          )}
          <CardTitle className="text-sm truncate">{workflow.name}</CardTitle>
          {workflow.published ? (
            <Badge variant="secondary" className="shrink-0 gap-1 text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10">
              <Globe className="h-3 w-3" />
              {t('card.published')}
            </Badge>
          ) : (
            <Badge variant="secondary" className="shrink-0 gap-1 text-[10px] text-muted-foreground" title={t('card.unpublished')}>
              <Lock className="h-3 w-3" />
              {t('card.unpublished')}
            </Badge>
          )}
        </div>
        {workflow.description && (
          <CardDescription className="text-xs line-clamp-2">{workflow.description}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        {/* Tags + Plugin icons — always render row for consistent height */}
        <div className="flex items-center gap-2 flex-wrap min-h-[22px]">
          {workflow.tags && workflow.tags.length > 0 ? (
            <div className="flex gap-1">
              {workflow.tags.slice(0, 2).map(tag => (
                <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{tag}</span>
              ))}
              {workflow.tags.length > 2 && (
                <span className="text-[10px] text-muted-foreground">+{workflow.tags.length - 2}</span>
              )}
            </div>
          ) : (
            <span className="text-[10px] text-muted-foreground/50">—</span>
          )}
          {enabledPluginAvatars.length > 0 && (
            <AvatarGroup avatarUrls={enabledPluginAvatars} size="sm" />
          )}
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-muted-foreground">
            {t('card.nodes', { count: workflow.nodes.length })}
            {createdText && (
              <span className="ml-2 text-[10px] text-muted-foreground/70">{createdText}</span>
            )}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
            title={t('card.preview')}
            onClick={(e) => { e.stopPropagation(); nativeNavigate(router, `/workflows/share?workflow_id=${workflow.id}`); }}
          >
            <Eye className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
