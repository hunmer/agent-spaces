'use client';

import type { WorkflowTemplate } from '@agent-spaces/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Pencil, Copy, Trash2, MoreVertical, Check } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { nativeNavigate } from '@/lib/navigate';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Checkbox } from '@/components/ui/checkbox';

interface WorkflowCardProps {
  workflow: WorkflowTemplate;
  onDuplicate: (wf: WorkflowTemplate) => void;
  onDelete: (wf: WorkflowTemplate) => void;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}

export function WorkflowCard({ workflow, onDuplicate, onDelete, selectionMode, selected, onToggleSelect }: WorkflowCardProps) {
  const router = useRouter();
  const t = useTranslations('workflows');

  return (
    <Card
      className={`group overflow-hidden hover:shadow-md transition-shadow relative ${selectionMode ? 'cursor-pointer' : 'cursor-pointer'} ${selectionMode && selected ? 'ring-2 ring-primary' : ''}`}
      onClick={() => {
        if (selectionMode) {
          onToggleSelect?.();
        } else {
          nativeNavigate(router, `/workflows/share?workflow_id=${workflow.id}`);
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
              <DropdownMenuItem onClick={() => nativeNavigate(router, `/workflows/${workflow.id}`)}>
                <Pencil className="h-3.5 w-3.5 mr-2" /> {t('card.edit')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDuplicate(workflow)}>
                <Copy className="h-3.5 w-3.5 mr-2" /> {t('card.duplicate')}
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
        </div>
        {workflow.description && (
          <CardDescription className="text-xs line-clamp-2">{workflow.description}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {t('card.nodes', { count: workflow.nodes.length })}
            </span>
            {workflow.tags && workflow.tags.length > 0 && (
              <div className="flex gap-1">
                {workflow.tags.slice(0, 2).map(tag => (
                  <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{tag}</span>
                ))}
                {workflow.tags.length > 2 && (
                  <span className="text-[10px] text-muted-foreground">+{workflow.tags.length - 2}</span>
                )}
              </div>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => { e.stopPropagation(); nativeNavigate(router, `/workflows/${workflow.id}`); }}
          >
            <Pencil className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
