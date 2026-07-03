'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Store,
  FileText,
  Download,
  Search,
  Check,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { StoreTabPanel } from '@/components/common/store-tab-panel';
import type { SkillInfo, SkillsDialogProps, StoreSkillItem } from './skills-dialog/types';
import { useSkillsData, useSkillActions } from './skills-dialog/use-skills-data';
import { SkillList } from './skills-dialog/skill-list';
import { SkillEditDialog } from './skills-dialog/skill-edit-dialog';
import { SkillBindDialog } from './skills-dialog/skill-bind-dialog';

type TabType = 'local' | 'store';

export function SkillsDialog({ open, onOpenChange, standalone, selectable, selectedSkills, onSelectedSkillsChange }: SkillsDialogProps) {
  const t = useTranslations('skills');
  const tc = useTranslations('common');

  const [activeTab, setActiveTab] = useState<TabType>('local');

  const { skills, setSkills, agents, loading, fetchSkills, storeSkills, storeLoading, importingPaths, importFromStore } = useSkillsData(open, standalone);
  const actions = useSkillActions(skills, setSkills, fetchSkills);

  const [editSkill, setEditSkill] = useState<SkillInfo | null>(null);
  const [editContent, setEditContent] = useState('');
  const [bindDialogSkill, setBindDialogSkill] = useState<SkillInfo | null>(null);

  // Store state

  const openEditDialog = (skill: SkillInfo) => {
    setEditSkill(skill);
    setEditContent(skill.content);
  };

  const openBindDialog = (skill: SkillInfo) => {
    setBindDialogSkill(skill);
  };

  const BIND_ALL_KEY = '__bind_all__';
  const isBindAllMode = bindDialogSkill?.name === BIND_ALL_KEY;

  const openBindAllDialog = () => {
    setBindDialogSkill({
      name: BIND_ALL_KEY,
      description: '',
      filename: '',
      content: '',
      favorited: false,
      group: '',
      boundAgents: [],
    });
  };

  const handleSaveEdit = async () => {
    if (!editSkill) return;
    const ok = await actions.saveEdit(editSkill.name, editContent);
    if (ok) setEditSkill(null);
  };

  const handleBindConfirm = async (selectedIds: string[]) => {
    if (!bindDialogSkill) return;
    if (isBindAllMode) {
      const skillNames = skills.map((s) => s.name);
      for (const agentId of selectedIds) {
        await actions.applyAllToAgent(agentId, skillNames);
      }
    } else {
      await actions.bindConfirm(bindDialogSkill, selectedIds, agents);
    }
    setBindDialogSkill(null);
  };

  const showMainDialog = (standalone || open) && !bindDialogSkill && !editSkill;

  // Selectable mode
  const [selectableSearch, setSelectableSearch] = useState('');
  const externalSelected = new Set(selectedSkills ?? []);
  const toggleSkill = useCallback((name: string) => {
    if (!onSelectedSkillsChange) return;
    const next = new Set(selectedSkills ?? []);
    if (next.has(name)) next.delete(name); else next.add(name);
    onSelectedSkillsChange([...next]);
  }, [selectedSkills, onSelectedSkillsChange]);

  if (selectable && showMainDialog) {
    const filteredSelectable = skills.filter((s) => {
      if (!selectableSearch) return true;
      const q = selectableSearch.toLowerCase();
      return s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q);
    });
    const allSelected = filteredSelectable.length > 0 && filteredSelectable.every((s) => externalSelected.has(s.name));

    const selectableBody = (
      <>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('selectDescription')}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={selectableSearch}
              onChange={(e) => setSelectableSearch(e.target.value)}
              placeholder={t('search')}
              className="pl-8"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (!onSelectedSkillsChange) return;
              const names = allSelected ? [] : filteredSelectable.map((s) => s.name);
              onSelectedSkillsChange(names);
            }}
          >
            {allSelected ? tc('deselectAll') : tc('selectAll')}
          </Button>
        </div>
        <div className="max-h-[50vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-1 gap-2">
            {filteredSelectable.map((skill) => {
              const checked = externalSelected.has(skill.name);
              return (
                <button
                  key={skill.name}
                  type="button"
                  className={cn(
                    'flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent/30',
                    checked && 'border-primary/50 bg-primary/5',
                  )}
                  onClick={() => toggleSkill(skill.name)}
                >
                  <div className={cn(
                    'flex size-4 shrink-0 items-center justify-center rounded border',
                    checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
                  )}>
                    {checked && <Check className="size-3" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-sm">{skill.name}</span>
                      {skill.group && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                          {skill.group}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                      {skill.description || skill.content.slice(0, 80).replace(/^#\s+/, '')}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex items-center justify-between border-t pt-3 mt-2">
          <span className="text-xs text-muted-foreground">
            {t('selectedCount', { count: (selectedSkills ?? []).length })}
          </span>
          <Button size="sm" onClick={() => onOpenChange(false)}>
            {tc('confirm')}
          </Button>
        </div>
      </>
    );

    return (
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg overflow-hidden">
          {selectableBody}
        </DialogContent>
      </Dialog>
    );
  }

  // Store groups
  const localSkillNames = new Set(skills.map((s) => s.name));

  const tabs = (
    <div className="flex items-center gap-1 border-b border-border px-1">
      {([['local', FileText, t('tabLocal')], ['store', Store, t('tabStore')]] as const).map(([key, Icon, label]) => (
        <button
          key={key}
          onClick={() => setActiveTab(key)}
          className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === key
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Icon className="size-3.5" />
          {label}
        </button>
      ))}
    </div>
  );

  const storeView = (
    <StoreTabPanel<StoreSkillItem>
      items={storeSkills}
      loading={storeLoading}
      getGroup={(s) => s.group}
      getId={(s) => s.path}
      allFilterText={t('filterAll')}
      searchPlaceholder={t('search')}
      emptyText={t('storeEmpty')}
      loadingText={tc('loading')}
      renderItem={(skill) => {
        const isImported = localSkillNames.has(skill.id);
        const isImporting = importingPaths.has(skill.path);
        return (
          <div className="rounded-xl border border-border bg-background p-4 hover:bg-accent/30 transition-colors">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <Store className="size-3.5 text-muted-foreground shrink-0" />
                  <span className="font-medium text-sm">{skill.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                    {skill.group}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{skill.id}</p>
              </div>
              <Button
                variant={isImported ? 'ghost' : 'outline'}
                size="sm"
                className="shrink-0"
                disabled={isImported || isImporting}
                onClick={() => importFromStore(skill)}
              >
                {isImported ? (
                  t('imported')
                ) : isImporting ? (
                  t('importing')
                ) : (
                  <>
                    <Download className="size-3.5 mr-1" />
                    {t('importTo')}
                  </>
                )}
              </Button>
            </div>
          </div>
        );
      }}
    />
  );

  const mainBody = (
    <>
      <DialogHeader>
        <div className="hidden md:block">
          {standalone
            ? <h2 className="text-base font-semibold">{t('title')}</h2>
            : <DialogTitle>{t('title')}</DialogTitle>
          }
          {standalone
            ? <p className="text-xs text-muted-foreground">{t('description')}</p>
            : <DialogDescription>{t('description')}</DialogDescription>
          }
        </div>
      </DialogHeader>

      {tabs}

      <div className="flex flex-1 min-h-0 flex-col">
      {activeTab === 'local' ? (
        <SkillList
          skills={skills}
          agents={agents}
          loading={loading}
          onToggleFavorite={actions.toggleFavorite}
          onDelete={actions.deleteSkill}
          onEdit={openEditDialog}
          onBind={openBindDialog}
          onImportBatch={actions.importBatch}
          onImportFromGit={actions.importFromGit}
          onExternalImported={fetchSkills}
          onBindAll={openBindAllDialog}
        />
      ) : (
        storeView
      )}
      </div>
    </>
  );

  return (
    <>
      {standalone && showMainDialog && (
        <div className="h-full flex flex-col">
          {mainBody}
        </div>
      )}
      {!standalone && (
        <Dialog open={showMainDialog} onOpenChange={onOpenChange}>
          <DialogContent className="!w-[80vw] !max-w-[80vw] !h-[80vh] flex flex-col overflow-hidden">
            {mainBody}
          </DialogContent>
        </Dialog>
      )}

      <SkillEditDialog
        skill={editSkill}
        content={editContent}
        onContentChange={setEditContent}
        onClose={() => setEditSkill(null)}
        onSave={handleSaveEdit}
      />

      <SkillBindDialog
        skill={bindDialogSkill}
        titleOverride={isBindAllMode ? t('applyAllToAgent') : undefined}
        descriptionOverride={isBindAllMode ? t('applyAllToAgentDescription') : undefined}
        agents={agents}
        initialSelected={isBindAllMode ? [] : (bindDialogSkill?.boundAgents.map((a) => a.id) ?? [])}
        onClose={() => setBindDialogSkill(null)}
        onSubmit={handleBindConfirm}
      />
    </>
  );
}
