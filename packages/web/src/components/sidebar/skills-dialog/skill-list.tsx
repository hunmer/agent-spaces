'use client';

import { useState } from 'react';
import { SkillFilterSidebar } from './skill-filter-sidebar';
import { SkillCardGrid } from './skill-card-grid';
import type { AgentCandidate, FilterMode, SkillInfo } from './types';

interface SkillListProps {
  skills: SkillInfo[];
  agents: AgentCandidate[];
  loading: boolean;
  onToggleFavorite: (skill: SkillInfo) => void;
  onDelete: (skill: SkillInfo) => void;
  onEdit: (skill: SkillInfo) => void;
  onBind: (skill: SkillInfo) => void;
  onExternalImported: () => void;
  onBindAll?: () => void;
}

export function SkillList({
  skills,
  agents,
  loading,
  onToggleFavorite,
  onDelete,
  onEdit,
  onBind,
  onExternalImported,
  onBindAll,
}: SkillListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [filterAgentId, setFilterAgentId] = useState('');
  const [filterGroup, setFilterGroup] = useState('');

  const groups = Array.from(new Set(skills.map((s) => s.group).filter(Boolean)));

  const filtered = skills.filter((skill) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!skill.name.toLowerCase().includes(q) && !skill.content.toLowerCase().includes(q)) {
        return false;
      }
    }
    if (filterMode === 'favorites' && !skill.favorited) return false;
    if (filterMode === 'agent' && filterAgentId) {
      if (!skill.boundAgents.some((a) => a.id === filterAgentId)) return false;
    }
    if (filterGroup) {
      if (filterGroup === '__none__') {
        if (skill.group) return false;
      } else if (skill.group !== filterGroup) return false;
    }
    return true;
  });

  return (
    <div className="flex flex-1 min-h-0 gap-4 pt-2">
      <SkillFilterSidebar
        agents={agents}
        groups={groups}
        hasUngrouped={skills.some((s) => !s.group)}
        filterMode={filterMode}
        filterAgentId={filterAgentId}
        filterGroup={filterGroup}
        onFilterChange={(mode, agentId, group) => {
          setFilterMode(mode);
          setFilterAgentId(agentId);
          setFilterGroup(group);
        }}
      />

      <SkillCardGrid
        skills={filtered}
        loading={loading}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        filterMode={filterMode}
        filterGroup={filterGroup}
        onFilterModeChange={(mode, group) => {
          setFilterMode(mode);
          setFilterAgentId('');
          setFilterGroup(group);
        }}
        onToggleFavorite={onToggleFavorite}
        onDelete={onDelete}
        onEdit={onEdit}
        onBind={onBind}
        onBindAll={onBindAll}
      />
    </div>
  );
}
