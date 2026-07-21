'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { FolderOpen, Hash, ListChecks, Loader2, Database } from 'lucide-react';
import type { Workspace } from '@agent-spaces/shared';
import { sdk } from '@/lib/sdk';

function InfoRow({ icon, label, value, onClick }: { icon: React.ReactNode; label: string; value: string; onClick?: () => void }) {
  const clickable = !!onClick;
  return (
    <div
      className={`flex items-center gap-2 text-sm ${clickable ? 'cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5 -mx-1 transition-colors' : ''}`}
      onClick={onClick}
      title={clickable ? value : undefined}
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="truncate text-foreground ml-auto" title={!clickable ? value : undefined}>{value}</span>
    </div>
  );
}

interface WorkspaceInfoSectionProps {
  workspace: Workspace;
  channelCount: number;
  issueCount: number;
}

export function WorkspaceInfoSection({ workspace, channelCount, issueCount }: WorkspaceInfoSectionProps) {
  const t = useTranslations('projectSettings');
  const [autoProcess, setAutoProcess] = useState(workspace.autoProcessIssues === true);
  const [hooksEnabled, setHooksEnabled] = useState(workspace.hooksEnabled !== false);
  const [saving, setSaving] = useState(false);

  const handleReveal = async (target?: string) => {
    if (target) {
      await sdk.http.postVoid(`/api/workspaces/${workspace.id}/reveal?target=${target}`);
    } else {
      await sdk.workspace.reveal(workspace.id);
    }
  };

  const handleToggleAutoProcess = async (checked: boolean) => {
    if (saving) return;
    setSaving(true);
    try {
      const updated = await sdk.workspace.update(workspace.id, { autoProcessIssues: checked } as any);
      setAutoProcess(updated.autoProcessIssues === true);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleHooks = async (checked: boolean) => {
    if (saving) return;
    setSaving(true);
    try {
      const updated = await sdk.workspace.update(workspace.id, { hooksEnabled: checked } as any);
      setHooksEnabled(updated.hooksEnabled !== false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="space-y-3">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('info.title')}</h4>
        <InfoRow icon={<FolderOpen size={14} />} label={t('info.path')} value={workspace.boundDirs[0] ?? '-'} onClick={workspace.boundDirs[0] ? () => handleReveal() : undefined} />
        <InfoRow icon={<Database size={14} />} label={t('info.workspace')} value={`workspaces/${workspace.id}`} onClick={() => handleReveal('data')} />
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2 rounded-md border px-3 py-2">
            <Hash size={14} className="text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">{t('info.channels')}</div>
              <div className="text-sm font-medium dark:!text-gray-200">{channelCount}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-md border px-3 py-2">
            <ListChecks size={14} className="text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">{t('info.issues')}</div>
              <div className="text-sm font-medium dark:!text-gray-200">{issueCount}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('automation.title')}</h4>
        <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
          <div className="space-y-0.5 pr-4">
            <Label htmlFor="auto-process" className="text-sm font-medium dark:!text-gray-200">
              {t('automation.autoProcess')}
            </Label>
            <p className="text-xs text-muted-foreground">
              {t('automation.autoProcessDescription')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
            <Switch
              id="auto-process"
              checked={autoProcess}
              onCheckedChange={handleToggleAutoProcess}
              disabled={saving}
            />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('hooks.title')}</h4>
        <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
          <div className="space-y-0.5 pr-4">
            <Label htmlFor="hooks-enabled" className="text-sm font-medium dark:!text-gray-200">
              {t('hooks.enableHooks')}
            </Label>
            <p className="text-xs text-muted-foreground">
              {t('hooks.enableHooksDescription')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
            <Switch
              id="hooks-enabled"
              checked={hooksEnabled}
              onCheckedChange={handleToggleHooks}
              disabled={saving}
            />
          </div>
        </div>
      </div>
    </>
  );
}
