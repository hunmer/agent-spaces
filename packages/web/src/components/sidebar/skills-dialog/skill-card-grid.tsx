'use client';

import { useTranslations } from 'next-intl';
import { sdk } from '@/lib/sdk';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AgentIcon } from '@/components/common/agent-icon';
import {
  Star,
  StarOff,
  Search,
  Rocket,
  Trash2,
  MoreVertical,
  FolderOpen,
  FileText,
  FileArchive,
  GitBranch,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ImportButton } from '../import-button';
import type { FilterMode, SkillInfo } from './types';

interface SkillCardGridProps {
  skills: SkillInfo[];
  loading: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  filterMode: FilterMode;
  filterGroup: string;
  onFilterModeChange: (mode: FilterMode, group: string) => void;
  onToggleFavorite: (skill: SkillInfo) => void;
  onDelete: (skill: SkillInfo) => void;
  onEdit: (skill: SkillInfo) => void;
  onBind: (skill: SkillInfo) => void;
  onBindAll: () => void;
  onImportMd: () => void;
  onImportFolder: () => void;
  onImportZip: () => void;
  onImportGit: () => void;
  gitLoading: boolean;
}

export function SkillCardGrid({
  skills,
  loading,
  searchQuery,
  onSearchChange,
  filterMode,
  filterGroup,
  onFilterModeChange,
  onToggleFavorite,
  onDelete,
  onEdit,
  onBind,
  onBindAll,
  onImportMd,
  onImportFolder,
  onImportZip,
  onImportGit,
  gitLoading,
}: SkillCardGridProps) {
  const t = useTranslations('skills');
  const tc = useTranslations('common');

  return (
    <div className="flex-1 min-w-0 flex flex-col gap-3 min-h-0">
      {/* Mobile: Top filters */}
      <div className="flex md:hidden flex-col gap-2">
        <div className="relative">
          <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('search')}
            className="pl-8"
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-input p-0.5">
            <button
              type="button"
              className={cn(
                'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                filterMode === 'all' && !filterGroup ? 'bg-muted' : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => onFilterModeChange('all', '')}
            >
              {t('filterAll')}
            </button>
            <button
              type="button"
              className={cn(
                'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                filterMode === 'favorites' ? 'bg-muted' : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => onFilterModeChange('favorites', '')}
            >
              <Star className="size-3 inline-block mr-0.5 -mt-px" />
              {t('filterFavorites')}
            </button>
          </div>
        </div>
      </div>

      {/* Desktop: Search bar */}
      <div className="hidden md:block relative">
        <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t('search')}
          className="pl-8"
        />
      </div>

      <ScrollArea className="flex-1 min-h-0">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
            {tc('loading')}
          </div>
        ) : skills.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
            {t('empty')}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 pr-2">
            {skills.map((skill) => (
              <SkillCard
                key={skill.name}
                skill={skill}
                onToggleFavorite={onToggleFavorite}
                onDelete={onDelete}
                onEdit={onEdit}
                onBind={onBind}
              />
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Desktop: Footer with import and apply all */}
      <div className="hidden md:flex items-center justify-between gap-3 pt-2 border-t shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<ImportButton label={t('import')} />}
          />
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={onImportMd}>
              <FileText className="size-3.5 mr-1.5" />
              {t('importFromMd')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onImportFolder}>
              <FolderOpen className="size-3.5 mr-1.5" />
              {t('importFromFolder')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onImportZip}>
              <FileArchive className="size-3.5 mr-1.5" />
              {t('importFromZip')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onImportGit} disabled={gitLoading}>
              <GitBranch className="size-3.5 mr-1.5" />
              {t('importFromGit')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="outline"
          size="sm"
          onClick={onBindAll}
          disabled={skills.length === 0}
        >
          <Rocket className="size-3.5 mr-1" />
          {t('applyAllToAgent')}
        </Button>
      </div>
    </div>
  );
}

function SkillCard({
  skill,
  onToggleFavorite,
  onDelete,
  onEdit,
  onBind,
}: {
  skill: SkillInfo;
  onToggleFavorite: (skill: SkillInfo) => void;
  onDelete: (skill: SkillInfo) => void;
  onEdit: (skill: SkillInfo) => void;
  onBind: (skill: SkillInfo) => void;
}) {
  const t = useTranslations('skills');

  return (
    <div
      className="rounded-xl border border-border bg-background p-4 hover:bg-accent/30 transition-colors cursor-pointer"
      onClick={() => onEdit(skill)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-sm">{skill.name}</span>
            {skill.group && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                {skill.group}
              </span>
            )}
            <button
              type="button"
              className="flex items-center justify-center size-5 rounded hover:bg-accent cursor-pointer"
              onClick={(e) => { e.stopPropagation(); onToggleFavorite(skill); }}
            >
              {skill.favorited ? (
                <Star className="size-3.5 text-yellow-500 fill-yellow-500" />
              ) : (
                <StarOff className="size-3.5 text-muted-foreground" />
              )}
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {skill.description || skill.content.slice(0, 120).replace(/^#\s+/, '')}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onBind(skill)}
          >
            <Rocket className="size-3.5 mr-1" />
            {t('apply')}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon" className="size-7" />
              }
            >
              <MoreVertical className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => sdk.skills.reveal(skill.name)}
              >
                <FolderOpen className="size-3.5 mr-1.5" />
                {t('revealFolder')}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => onDelete(skill)}
              >
                <Trash2 className="size-3.5 mr-1.5" />
                {t('delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {skill.boundAgents.length > 0 && (
        <div className="flex items-center gap-1.5 mt-2.5 pt-2.5 border-t border-border/50">
          {skill.boundAgents.map((agent) => (
            <AgentIcon
              key={agent.id}
              agentId={agent.id}
              name={agent.name}
              avatarUrl={agent.avatarUrl}
              className="size-5 rounded-full"
            />
          ))}
          <span className="text-xs text-muted-foreground ml-1">
            {skill.boundAgents.length}
          </span>
        </div>
      )}
    </div>
  );
}
