'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AgentIcon } from '@/components/common/agent-icon';
import { Star, FileText, Folder } from 'lucide-react';
import type { AgentCandidate, FilterMode } from './types';

interface SkillFilterSidebarProps {
  agents: AgentCandidate[];
  groups: string[];
  hasUngrouped: boolean;
  filterMode: FilterMode;
  filterAgentId: string;
  filterGroup: string;
  onFilterChange: (mode: FilterMode, agentId: string, group: string) => void;
}

export function SkillFilterSidebar({
  agents,
  groups,
  hasUngrouped,
  filterMode,
  filterAgentId,
  filterGroup,
  onFilterChange,
}: SkillFilterSidebarProps) {
  const t = useTranslations('skills');

  return (
    <ScrollArea className="hidden md:block w-44 shrink-0">
      <div className="flex flex-col gap-3 pr-2">
        <div className="space-y-1">
          <Button
            variant={filterMode === 'all' && !filterGroup ? 'secondary' : 'ghost'}
            size="sm"
            className="w-full justify-start"
            onClick={() => onFilterChange('all', '', '')}
          >
            <FileText className="size-3.5 mr-1.5" />
            {t('filterAll')}
          </Button>
          <Button
            variant={filterMode === 'favorites' ? 'secondary' : 'ghost'}
            size="sm"
            className="w-full justify-start"
            onClick={() => onFilterChange('favorites', '', '')}
          >
            <Star className="size-3.5 mr-1.5" />
            {t('filterFavorites')}
          </Button>
        </div>

        {agents.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground px-2">{t('filterByAgent')}</p>
            {agents.map((agent) => (
              <Button
                key={agent.id}
                variant={filterMode === 'agent' && filterAgentId === agent.id ? 'secondary' : 'ghost'}
                size="sm"
                className="w-full justify-start"
                onClick={() => onFilterChange('agent', agent.id, '')}
              >
                <AgentIcon agentId={agent.id} name={agent.name} avatarUrl={agent.avatarUrl} apiBase={agent.apiBase} className="size-4 mr-1.5 rounded-full" />
                <span className="truncate">{agent.name}</span>
              </Button>
            ))} 
          </div>
        )}

        {groups.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground px-2">{t('filterGroups')}</p>
            {groups.map((group) => (
              <Button
                key={group}
                variant={filterGroup === group ? 'secondary' : 'ghost'}
                size="sm"
                className="w-full justify-start"
                onClick={() => onFilterChange('all', '', filterGroup === group ? '' : group)}
              >
                <Folder className="size-3.5 mr-1.5" />
                <span className="truncate">{group}</span>
              </Button>
            ))}
            {hasUngrouped && (
              <Button
                variant={filterGroup === '__none__' ? 'secondary' : 'ghost'}
                size="sm"
                className="w-full justify-start"
                onClick={() => onFilterChange('all', '', filterGroup === '__none__' ? '' : '__none__')}
              >
                <FileText className="size-3.5 mr-1.5" />
                {t('filterNoGroup')}
              </Button>
            )}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
