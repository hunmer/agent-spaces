'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Users } from 'lucide-react';
import type { TeamView } from '@agent-spaces/sdk';
import { AgentIcon } from '@/components/common/agent-icon';
import { Badge } from '@/components/ui/badge';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';

interface TeamHoverCardProps {
  team: TeamView;
  children: ReactNode;
}

export function TeamHoverCard({ team, children }: TeamHoverCardProps) {
  const t = useTranslations('teams');

  return (
    <HoverCard>
      <HoverCardTrigger render={<div className="inline-flex items-center" />}>{children}</HoverCardTrigger>
      <HoverCardContent side="top" align="start" className="w-72">
        <div className="flex items-start gap-3">
          <AgentIcon
            name={team.name}
            avatarUrl={team.avatarUrl ?? team.avatar_url}
            icon={team.icon}
            className="size-10 shrink-0 rounded-md"
            bordered
            rounded="rounded-md"
          />
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{team.name}</div>
            <div className="mt-1 flex flex-wrap gap-1">
              <Badge variant="outline">{t(`status.${team.status}`)}</Badge>
              <Badge variant="outline">{t(`visibility.${team.visibility}`)}</Badge>
            </div>
          </div>
        </div>
        {team.description ? <p className="mt-3 text-sm text-muted-foreground">{team.description}</p> : null}
        <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="size-3.5" />
          {t('list.memberCount', { count: team.member_count })}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
