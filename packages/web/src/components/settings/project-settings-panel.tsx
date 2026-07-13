'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { useChannelStore } from '@/stores/channel';
import { useIssueStore } from '@/stores/issue';
import { useAgentStore } from '@/stores/agent';
import { useWorkspaceStore } from '@/stores/workspace';
import { AgentDialog } from '@/components/sidebar/agent-dialog';
import { Loader2, Puzzle } from 'lucide-react';
import type { Workspace, WorkspaceNotificationSettings } from '@agent-spaces/shared';
import type { MiniAppProject } from '@agent-spaces/sdk';
import { getNotificationPermission, type NotificationPermissionStatus } from '@/lib/native-notification';
import { sdk } from '@/lib/sdk';

import { WorkspaceInfoSection } from './workspace-info-section';
import { NotificationSettingsTab, defaultNotificationSettings } from './notification-settings-tab';
import { WorkspacePromptSection } from './workspace-prompt-section';
import { MiniAppListDialog } from '@/components/mini-apps/mini-apps-list-dialog';

interface ProjectSettingsPanelProps {
  workspaceId: string;
}

export function ProjectSettingsPanel({ workspaceId }: ProjectSettingsPanelProps) {
  const t = useTranslations('projectSettings');
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [savedPrompt, setSavedPrompt] = useState('');
  const [loading, setLoading] = useState(true);
  const [agentDialogOpen, setAgentDialogOpen] = useState(false);
  const [notificationDraft, setNotificationDraft] = useState<WorkspaceNotificationSettings>(defaultNotificationSettings());
  const [miniApps, setMiniApps] = useState<MiniAppProject[]>([]);
  const [selectedMiniAppIds, setSelectedMiniAppIds] = useState<string[]>([]);
  const [miniAppDialogOpen, setMiniAppDialogOpen] = useState(false);

  const channels = useChannelStore((s) => s.channels);
  const issues = useIssueStore((s) => s.issues);

  const allAgents = useAgentStore((s) => s.agents);
  const botAgents = allAgents.filter((agent) => agent.role === 'bot' && agent.enabled !== false);
  const upsertWorkspace = useWorkspaceStore((s) => s.upsertWorkspace);

  useEffect(() => {
    Promise.all([
      sdk.workspace.get(workspaceId),
      sdk.workspace.getPrompt(workspaceId),
      sdk.miniApp.list(),
    ])
      .then(([ws, promptData, projects]) => {
        setWorkspace(ws);
        upsertWorkspace(ws);
        setSavedPrompt(promptData.prompt ?? '');
        const ns = ws.notificationSettings ?? defaultNotificationSettings();
        setNotificationDraft(ns);
        setMiniApps(projects.filter((project) => project.extensions?.includes('workspace')));
        setSelectedMiniAppIds(ws.miniAppIds ?? []);
        setLoading(false);
        // Check native notification permission status
        getNotificationPermission().then((status: NotificationPermissionStatus) => {
          if (status === 'granted' && ns.provider === 'native' && !ns.native?.permissionGranted) {
            const updated = { ...ns, native: { ...ns.native, permissionGranted: true } };
            setNotificationDraft(updated);
            sdk.workspace.update(workspaceId, { notificationSettings: updated })
              .then((w: Workspace) => {
                setWorkspace(w);
                upsertWorkspace(w);
              });
          }
        });
      })
      .catch(() => setLoading(false));
  }, [workspaceId, upsertWorkspace]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        {t('loading')}
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        {t('workspaceNotFound')}
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="flex items-center px-2 py-1.5 border-b text-xs font-medium text-muted-foreground">
        <span>{t('title')}</span>
      </div>
      <div className="p-4 space-y-6">
        <WorkspaceInfoSection
          workspace={workspace}
          channelCount={channels.length}
          issueCount={issues.length}
        />

        <div className="rounded-xl border border-border p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium">
                <Puzzle className="size-4" />
                {t('miniApps.title')}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{t('miniApps.description')}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setMiniAppDialogOpen(true)}>
              {t('miniApps.select')}
            </Button>
          </div>
          <div className="text-xs text-muted-foreground">
            {selectedMiniAppIds.length
              ? miniApps.filter((app) => selectedMiniAppIds.includes(app.id)).map((app) => app.name).join(', ')
              : t('miniApps.empty')}
          </div>
        </div>

        <NotificationSettingsTab
          workspaceId={workspaceId}
          workspace={workspace}
          notificationDraft={notificationDraft}
          setNotificationDraft={setNotificationDraft}
          setWorkspace={setWorkspace}
          botAgents={botAgents}
          agentDialogOpen={agentDialogOpen}
          setAgentDialogOpen={setAgentDialogOpen}
        />

        <WorkspacePromptSection
          workspaceId={workspaceId}
          initialPrompt={savedPrompt}
        />
      </div>
      <AgentDialog
        open={agentDialogOpen}
        onOpenChange={setAgentDialogOpen}
        roleFilter="bot"
      />
      <MiniAppListDialog
        open={miniAppDialogOpen}
        projects={miniApps}
        selectedIds={selectedMiniAppIds}
        onSelectedIdsChange={setSelectedMiniAppIds}
        allowEmptySelection
        confirmLabelKey="filters.confirm"
        onConfirm={async (selected) => {
          const ids = selected.map((project) => project.id);
          const updated = await sdk.workspace.update(workspaceId, { miniAppIds: ids });
          setWorkspace(updated);
          setSelectedMiniAppIds(ids);
          upsertWorkspace(updated);
          setMiniAppDialogOpen(false);
        }}
        onClose={() => {
          setSelectedMiniAppIds(workspace.miniAppIds ?? []);
          setMiniAppDialogOpen(false);
        }}
      />
    </ScrollArea>
  );
}
