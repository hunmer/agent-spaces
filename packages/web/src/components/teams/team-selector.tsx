'use client';

import { useEffect, useState } from 'react';
import type { TeamView } from '@agent-spaces/sdk';
import { sdk } from '@/lib/sdk';
import { useAgentStore } from '@/stores/agent';
import { TeamCard } from './team-card';

interface TeamSelectorProps {
  value: string | string[];
  onChange: (value: string | string[]) => void;
  multiple?: boolean;
  label?: string;
  emptyText?: string;
}

export function TeamSelector({ value, onChange, multiple = false, label, emptyText = 'No teams found' }: TeamSelectorProps) {
  const [teams, setTeams] = useState<TeamView[]>([]);
  const agents = useAgentStore((state) => state.agents);
  const selectedIds = Array.isArray(value) ? value : value ? [value] : [];

  useEffect(() => {
    let cancelled = false;
    sdk.team.list({ actor_agent_id: 'admin', page_size: 100, include_members_preview: true })
      .then((result) => { if (!cancelled) setTeams(result.teams.filter((team) => team.status === 'active')); })
      .catch(() => { if (!cancelled) setTeams([]); });
    return () => { cancelled = true; };
  }, []);

  const select = (teamId: string) => {
    if (!multiple) {
      onChange(selectedIds.includes(teamId) ? '' : teamId);
      return;
    }
    onChange(selectedIds.includes(teamId)
      ? selectedIds.filter((id) => id !== teamId)
      : [...selectedIds, teamId]);
  };

  return (
    <div className="space-y-2">
      {label ? <label className="text-sm font-medium">{label}</label> : null}
      {teams.length === 0 ? (
        <div className="rounded-md border border-dashed px-3 py-5 text-center text-sm text-muted-foreground">{emptyText}</div>
      ) : (
        <div className="max-h-72 space-y-2 overflow-y-auto">
          {teams.map((team) => (
            <TeamCard
              key={team.team_id}
              team={team}
              mode="active"
              selected={selectedIds.includes(team.team_id)}
              onSelect={() => select(team.team_id)}
              agents={agents}
            />
          ))}
        </div>
      )}
    </div>
  );
}
