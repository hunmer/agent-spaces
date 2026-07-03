'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { SkillFilterSidebar } from './skill-filter-sidebar';
import { SkillCardGrid } from './skill-card-grid';
import { useImport } from '../import-panel/use-import';
import { ImportPreviewPanel } from '../import-panel/import-preview-panel';
import { ImportGitDialog } from '../import-panel/import-git-dialog';
import { ImportFileInputs } from '../import-panel/import-file-inputs';
import type { AgentCandidate, FilterMode, SkillInfo } from './types';
import type { ImportItem } from '../import-panel/types';

interface SkillListProps {
  skills: SkillInfo[];
  agents: AgentCandidate[];
  loading: boolean;
  onToggleFavorite: (skill: SkillInfo) => void;
  onDelete: (skill: SkillInfo) => void;
  onEdit: (skill: SkillInfo) => void;
  onBind: (skill: SkillInfo) => void;
  onImportBatch: (items: ImportItem[]) => void;
  onImportFromGit: (url: string) => Promise<{ name: string; content: string }[] | null>;
  onBindAll: () => void;
}

export function SkillList({
  skills,
  agents,
  loading,
  onToggleFavorite,
  onDelete,
  onEdit,
  onBind,
  onImportBatch,
  onImportFromGit,
  onBindAll,
}: SkillListProps) {
  const t = useTranslations('skills');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [filterAgentId, setFilterAgentId] = useState('');
  const [filterGroup, setFilterGroup] = useState('');

  const importState = useImport({ onImportBatch, onImportFromGit });

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
    <>
      {/* Hidden file inputs */}
      <ImportFileInputs
        mdInputRef={importState.mdInputRef}
        folderInputRef={importState.folderInputRef}
        zipInputRef={importState.zipInputRef}
        handleMdSelect={importState.handleMdSelect}
        handleFolderSelect={importState.handleFolderSelect}
        handleZipSelect={importState.handleZipSelect}
      />


      {importState.importDialogOpen ? (
        <ImportPreviewPanel
          items={importState.importItems}
          onItemsChange={importState.setImportItems}
          onConfirm={importState.handleImportConfirm}
          onCancel={importState.handleImportCancel}
          defaultGroup={importState.importDefaultGroup}
        />
      ) : (
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
            onImportMd={importState.openMdPicker}
            onImportFolder={importState.openFolderPicker}
            onImportZip={importState.openZipPicker}
            onImportGit={importState.openGitDialog}
            gitLoading={importState.gitLoading}
          />
        </div>
      )}

      <ImportGitDialog
        open={importState.gitDialogOpen}
        onOpenChange={importState.setGitDialogOpen}
        gitUrl={importState.gitUrl}
        onGitUrlChange={importState.setGitUrl}
        loading={importState.gitLoading}
        onImport={importState.handleGitImport}
        confirmLabel={t('import')}
      />
    </>
  );
}
