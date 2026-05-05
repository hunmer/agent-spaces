'use client';

import { useEffect, useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useChannelStore } from '@/stores/channel';
import { useIssueStore } from '@/stores/issue';
import { Bell, FolderOpen, Hash, ListChecks, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import type { NotificationEventKey, NotificationProvider, Workspace, WorkspaceNotificationSettings } from '@agent-spaces/shared';

interface ProjectSettingsPanelProps {
  workspaceId: string;
}

export function ProjectSettingsPanel({ workspaceId }: ProjectSettingsPanelProps) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [prompt, setPrompt] = useState('');
  const [savedPrompt, setSavedPrompt] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [savingNotifications, setSavingNotifications] = useState(false);
  const [startingNotifications, setStartingNotifications] = useState(false);
  const [notificationDraft, setNotificationDraft] = useState<WorkspaceNotificationSettings>(defaultNotificationSettings());

  const channels = useChannelStore((s) => s.channels);
  const issues = useIssueStore((s) => s.issues);
  const loadChannels = useChannelStore((s) => s.loadChannels);
  const loadIssues = useIssueStore((s) => s.loadIssues);

  useEffect(() => {
    Promise.all([
      fetch(`/api/workspaces/${workspaceId}`).then((r) => r.json()),
      fetch(`/api/workspaces/${workspaceId}/prompt`).then((r) => r.json()),
      loadChannels(workspaceId),
      loadIssues(workspaceId),
    ])
      .then(([ws, promptData]) => {
        setWorkspace(ws);
        setPrompt(promptData.prompt ?? '');
        setSavedPrompt(promptData.prompt ?? '');
        setNotificationDraft(ws.notificationSettings ?? defaultNotificationSettings());
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [workspaceId, loadChannels, loadIssues]);

  const autoProcessIssues = workspace?.autoProcessIssues !== false;
  const promptChanged = prompt !== savedPrompt;
  const notificationSettings = notificationDraft;

  const handleToggleAutoProcess = async (checked: boolean) => {
    if (!workspace || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoProcessIssues: checked }),
      });
      const updated: Workspace = await res.json();
      setWorkspace(updated);
    } finally {
      setSaving(false);
    }
  };

  const handleSavePrompt = async () => {
    if (savingPrompt) return;
    setSavingPrompt(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/prompt`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => null);
        throw new Error(error?.error || 'Failed to save workspace prompt');
      }
      const data: { prompt: string } = await res.json();
      setPrompt(data.prompt);
      setSavedPrompt(data.prompt);
      toast.success('Workspace prompt saved');
    } catch (err) {
      toast.error('Failed to save workspace prompt', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSavingPrompt(false);
    }
  };

  const updateNotifications = async (next: WorkspaceNotificationSettings): Promise<Workspace | null> => {
    if (!workspace || savingNotifications) return null;
    setSavingNotifications(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationSettings: next }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => null);
        throw new Error(error?.error || 'Failed to save notification settings');
      }
      const updated: Workspace = await res.json();
      setWorkspace(updated);
      setNotificationDraft(updated.notificationSettings ?? defaultNotificationSettings());
      return updated;
    } catch (err) {
      toast.error('Failed to save notification settings', {
        description: err instanceof Error ? err.message : undefined,
      });
      return null;
    } finally {
      setSavingNotifications(false);
    }
  };

  const patchNotifications = (patch: Partial<WorkspaceNotificationSettings>) => {
    const next = {
      ...notificationSettings,
      ...patch,
      lark: {
        ...notificationSettings.lark,
        ...patch.lark,
      },
    };
    setNotificationDraft(next);
    updateNotifications(next);
  };

  const toggleNotificationEvent = (event: NotificationEventKey, checked: boolean) => {
    const events = new Set(notificationSettings.events);
    if (checked) events.add(event);
    else events.delete(event);
    patchNotifications({ events: Array.from(events) });
  };

  const handleStartNotifications = async () => {
    if (startingNotifications) return;
    setStartingNotifications(true);
    try {
      const saved = await updateNotifications(notificationSettings);
      if (!saved) throw new Error('Failed to save notification settings');
      const res = await fetch(`/api/workspaces/${workspaceId}/notifications/start`, {
        method: 'POST',
      });
      if (!res.ok) {
        const error = await res.json().catch(() => null);
        throw new Error(error?.error || 'Failed to start notification service');
      }
      toast.success('Notification service started');
    } catch (err) {
      toast.error('Failed to start notification service', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setStartingNotifications(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        Loading...
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Workspace not found
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-6">
        {/* Header */}
        <div>
          <h3 className="text-sm font-semibold">Project Settings</h3>
          <p className="text-xs text-muted-foreground mt-1">{workspace.name}</p>
        </div>

        {/* Basic Info */}
        <div className="space-y-3">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Info</h4>

          <InfoRow icon={<FolderOpen size={14} />} label="Path" value={workspace.boundDirs[0] ?? '-'} />

          <InfoRow icon={<Hash size={14} />} label="Channels" value={String(channels.length)} />

          <InfoRow icon={<ListChecks size={14} />} label="Issues" value={String(issues.length)} />
        </div>

        {/* Automation */}
        <div className="space-y-3">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Automation</h4>

          <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
            <div className="space-y-0.5 pr-4">
              <Label htmlFor="auto-process" className="text-sm font-medium">
                Auto Process Issues
              </Label>
              <p className="text-xs text-muted-foreground">
                Scheduler will automatically plan and execute open issues
              </p>
            </div>
            <div className="flex items-center gap-2">
              {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
              <Switch
                id="auto-process"
                checked={autoProcessIssues}
                onCheckedChange={handleToggleAutoProcess}
                disabled={saving}
              />
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div className="space-y-3">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Notifications</h4>

          <div className="space-y-4 rounded-md border px-3 py-3">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5 pr-4">
                <Label htmlFor="message-notifications" className="text-sm font-medium">
                  Message Notifications
                </Label>
                <p className="text-xs text-muted-foreground">
                  Push issue progress and task output to external chat platforms
                </p>
              </div>
              <div className="flex items-center gap-2">
                {savingNotifications && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                <Switch
                  id="message-notifications"
                  checked={notificationSettings.enabled}
                  onCheckedChange={(enabled) => patchNotifications({ enabled })}
                  disabled={savingNotifications}
                />
              </div>
            </div>

            {notificationSettings.enabled && (
              <div className="space-y-4">
                <Tabs
                  value={notificationSettings.provider}
                  onValueChange={(provider) => patchNotifications({ provider: provider as NotificationProvider })}
                >
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="lark">Feishu</TabsTrigger>
                    <TabsTrigger value="wechat">WeChat (todo)</TabsTrigger>
                  </TabsList>

                  <TabsContent value="lark" className="space-y-3 pt-2">
                    <div className="grid gap-2">
                      <Label htmlFor="lark-app-id" className="text-xs text-muted-foreground">app_id</Label>
                      <Input
                        id="lark-app-id"
                        value={notificationSettings.lark?.appId ?? ''}
                        onChange={(event) => setNotificationDraft({
                          ...notificationSettings,
                          lark: { ...notificationSettings.lark, appId: event.target.value },
                        })}
                        placeholder="cli_xxx"
                        disabled={startingNotifications}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="lark-app-secret" className="text-xs text-muted-foreground">app_secret</Label>
                      <Input
                        id="lark-app-secret"
                        type="password"
                        value={notificationSettings.lark?.appSecret ?? ''}
                        onChange={(event) => setNotificationDraft({
                          ...notificationSettings,
                          lark: { ...notificationSettings.lark, appSecret: event.target.value },
                        })}
                        placeholder="app secret"
                        disabled={startingNotifications}
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleStartNotifications}
                      disabled={startingNotifications || savingNotifications || !notificationSettings.lark?.appId || !notificationSettings.lark?.appSecret}
                    >
                      {startingNotifications ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-2 h-3.5 w-3.5" />}
                      Start Service
                    </Button>
                  </TabsContent>

                  <TabsContent value="wechat" className="pt-2">
                    <div className="rounded-md border border-dashed px-3 py-3 text-xs text-muted-foreground">
                      WeChat adapter is reserved for the next bot platform integration.
                    </div>
                  </TabsContent>
                </Tabs>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <Bell className="h-3.5 w-3.5" />
                    Notification Events
                  </div>
                  <div className="grid gap-2">
                    {NOTIFICATION_EVENTS.map((item) => (
                      <label key={item.value} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-primary"
                          checked={notificationSettings.events.includes(item.value)}
                          onChange={(event) => toggleNotificationEvent(item.value, event.target.checked)}
                          disabled={savingNotifications}
                        />
                        <span>{item.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Prompt */}
        <div className="space-y-3">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Prompt</h4>

          <div className="space-y-3 rounded-md border px-3 py-3">
            <div className="space-y-0.5">
              <Label htmlFor="workspace-prompt" className="text-sm font-medium">
                Workspace Prompt
              </Label>
              <p className="text-xs text-muted-foreground">
                Applied to every agent run in this workspace
              </p>
            </div>
            <Textarea
              id="workspace-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              className="min-h-36 resize-y text-sm"
            />
            <div className="flex justify-end">
              <Button type="button" size="sm" onClick={handleSavePrompt} disabled={savingPrompt || !promptChanged}>
                {savingPrompt && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                Save Prompt
              </Button>
            </div>
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}

const NOTIFICATION_EVENTS: Array<{ value: NotificationEventKey; label: string }> = [
  { value: 'issue_started', label: '议题开始' },
  { value: 'issue_completed', label: '议题结束' },
  { value: 'issue_task_completed', label: '议题任务完成' },
];

function defaultNotificationSettings(): WorkspaceNotificationSettings {
  return {
    enabled: false,
    provider: 'lark',
    events: ['issue_started', 'issue_completed', 'issue_task_completed'],
    lark: {},
  };
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="truncate text-foreground ml-auto" title={value}>{value}</span>
    </div>
  );
}
