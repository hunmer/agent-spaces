'use client';

import { useEffect, useRef, useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useChannelStore } from '@/stores/channel';
import { useIssueStore } from '@/stores/issue';
import { AgentDialog } from '@/components/sidebar/agent-dialog';
import { Bell, Bot, CheckCircle2, FolderOpen, Hash, ListChecks, Loader2, QrCode, RefreshCw, Send } from 'lucide-react';
import { toast } from 'sonner';
import type { AgentConfig, NotificationEventKey, NotificationProvider, Workspace, WorkspaceNotificationSettings } from '@agent-spaces/shared';

interface ProjectSettingsPanelProps {
  workspaceId: string;
}

interface WeChatQRCodeState {
  status: 'idle' | 'wait' | 'scaned' | 'confirmed' | 'expired';
  qrcodeImgContent?: string;
  accountId?: string;
  baseUrl?: string;
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
  const [testingNotifications, setTestingNotifications] = useState(false);
  const [loadingWeChatQR, setLoadingWeChatQR] = useState(false);
  const [wechatQR, setWeChatQR] = useState<WeChatQRCodeState>({ status: 'idle' });
  const pollingWeChatQR = useRef(false);
  const [agentDialogOpen, setAgentDialogOpen] = useState(false);
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
  const botAgents = (workspace?.agents ?? []).filter((agent) => agent.role === 'bot' && agent.enabled !== false);
  const wechatLoggedIn = Boolean(notificationSettings.wechat?.token && notificationSettings.wechat?.accountId);

  useEffect(() => {
    if (
      !notificationSettings.enabled
      || notificationSettings.provider !== 'wechat'
      || !['wait', 'scaned'].includes(wechatQR.status)
    ) {
      return;
    }

    const timer = window.setInterval(() => {
      if (pollingWeChatQR.current) return;
      pollingWeChatQR.current = true;
      fetch(`/api/workspaces/${workspaceId}/notifications/wechat/qr?poll=1`, { method: 'POST' })
        .then(async (res) => {
          const data = await res.json().catch(() => null);
          if (!res.ok) throw new Error(data?.error || 'Failed to poll WeChat QR status');
          setWeChatQR({
            status: data.status ?? 'wait',
            qrcodeImgContent: data.qrcodeImgContent ?? wechatQR.qrcodeImgContent,
            accountId: data.accountId,
            baseUrl: data.baseUrl,
          });
          if (data.workspace) {
            setWorkspace(data.workspace);
            setNotificationDraft(data.workspace.notificationSettings ?? defaultNotificationSettings());
            toast.success('WeChat robot connected');
          }
        })
        .catch((err) => {
          toast.error('Failed to poll WeChat QR status', {
            description: err instanceof Error ? err.message : undefined,
          });
        })
        .finally(() => {
          pollingWeChatQR.current = false;
        });
    }, 2000);

    return () => window.clearInterval(timer);
  }, [notificationSettings.enabled, notificationSettings.provider, wechatQR.status, wechatQR.qrcodeImgContent, workspaceId]);

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
      wechat: {
        ...notificationSettings.wechat,
        ...patch.wechat,
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

  const handleBotAgentChange = (agentId: string) => {
    patchNotifications({ botAgentId: agentId || undefined });
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
      const result: { workspace?: Workspace } = await res.json();
      if (result.workspace) {
        setWorkspace(result.workspace);
        setNotificationDraft(result.workspace.notificationSettings ?? defaultNotificationSettings());
      } else {
        setNotificationDraft({ ...notificationSettings, serviceRunning: true });
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

  const handleStopNotifications = async () => {
    if (startingNotifications) return;
    setStartingNotifications(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/notifications/stop`, {
        method: 'POST',
      });
      if (!res.ok) {
        const error = await res.json().catch(() => null);
        throw new Error(error?.error || 'Failed to stop notification service');
      }
      const result: { workspace?: Workspace } = await res.json();
      if (result.workspace) {
        setWorkspace(result.workspace);
        setNotificationDraft(result.workspace.notificationSettings ?? defaultNotificationSettings());
      } else {
        setNotificationDraft({ ...notificationSettings, serviceRunning: false });
      }
      toast.success('Notification service stopped');
    } catch (err) {
      toast.error('Failed to stop notification service', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setStartingNotifications(false);
    }
  };

  const handleTestNotifications = async () => {
    if (testingNotifications) return;
    setTestingNotifications(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/notifications/test`, {
        method: 'POST',
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.reason || data?.error || 'Failed to send test notification');
      }
      toast.success('Test notification sent');
    } catch (err) {
      toast.error('Failed to send test notification', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setTestingNotifications(false);
    }
  };

  const handleLoadWeChatQR = async () => {
    if (loadingWeChatQR) return;
    setLoadingWeChatQR(true);
    try {
      const saved = await updateNotifications({ ...notificationSettings, provider: 'wechat' });
      if (!saved) throw new Error('Failed to save notification settings');
      const res = await fetch(`/api/workspaces/${workspaceId}/notifications/wechat/qr${wechatLoggedIn ? '?refresh=1' : ''}`, {
        method: 'POST',
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Failed to get WeChat QR code');
      setWeChatQR({
        status: data.status ?? 'wait',
        qrcodeImgContent: data.qrcodeImgContent,
        accountId: data.accountId,
        baseUrl: data.baseUrl,
      });
      if (data.workspace) {
        setWorkspace(data.workspace);
        setNotificationDraft(data.workspace.notificationSettings ?? defaultNotificationSettings());
      }
    } catch (err) {
      toast.error('Failed to get WeChat QR code', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setLoadingWeChatQR(false);
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
                  Push issue progress and final task results to external chat platforms
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
                    <TabsTrigger value="wechat">WeChat</TabsTrigger>
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
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={notificationSettings.serviceRunning ? 'outline' : 'default'}
                        onClick={notificationSettings.serviceRunning ? handleStopNotifications : handleStartNotifications}
                        disabled={startingNotifications || savingNotifications || !notificationSettings.lark?.appId || !notificationSettings.lark?.appSecret}
                      >
                        {startingNotifications ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-2 h-3.5 w-3.5" />}
                        {notificationSettings.serviceRunning ? 'Stop Service' : 'Start Service'}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleTestNotifications}
                        disabled={testingNotifications || savingNotifications || !notificationSettings.serviceRunning}
                      >
                        {testingNotifications && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                        Test Send
                      </Button>
                    </div>
                  </TabsContent>

                  <TabsContent value="wechat" className="space-y-3 pt-2">
                    <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2.5">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          {wechatLoggedIn ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <QrCode className="h-4 w-4" />}
                          WeChat iLink Robot
                        </div>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {wechatLoggedIn
                            ? `Connected: ${notificationSettings.wechat?.accountId}`
                            : wechatQR.status === 'scaned'
                              ? 'Scanned. Confirm login on your phone.'
                              : wechatQR.status === 'expired'
                                ? 'QR code expired. Refresh to get a new one.'
                                : 'Scan the QR code with WeChat to authorize the robot.'}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleLoadWeChatQR}
                        disabled={loadingWeChatQR || savingNotifications || startingNotifications}
                      >
                        {loadingWeChatQR ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />}
                        {wechatLoggedIn ? 'Refresh Login' : 'Get QR'}
                      </Button>
                    </div>

                    {wechatQR.qrcodeImgContent && !wechatLoggedIn && (
                      <div className="flex items-center gap-3 rounded-md border border-dashed px-3 py-3">
                        <img
                          src={buildQRCodeImageUrl(wechatQR.qrcodeImgContent)}
                          alt="WeChat robot login QR code"
                          className="h-36 w-36 shrink-0 rounded border bg-white p-2"
                        />
                        <div className="min-w-0 space-y-1 text-xs text-muted-foreground">
                          <p>Status: {wechatQR.status === 'scaned' ? 'scanned' : wechatQR.status}</p>
                          <p className="break-all">Login URL: {wechatQR.qrcodeImgContent}</p>
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={notificationSettings.serviceRunning ? 'outline' : 'default'}
                        onClick={notificationSettings.serviceRunning ? handleStopNotifications : handleStartNotifications}
                        disabled={startingNotifications || savingNotifications || !wechatLoggedIn}
                      >
                        {startingNotifications ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-2 h-3.5 w-3.5" />}
                        {notificationSettings.serviceRunning ? 'Stop Service' : 'Start Service'}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleTestNotifications}
                        disabled={testingNotifications || savingNotifications || !notificationSettings.serviceRunning}
                      >
                        {testingNotifications && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                        Test Send
                      </Button>
                    </div>
                  </TabsContent>
                </Tabs>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <Bot className="h-3.5 w-3.5" />
                    Bot Agent
                  </div>
                  <div className="flex gap-2">
                    <select
                      value={notificationSettings.botAgentId ?? ''}
                      onChange={(event) => handleBotAgentChange(event.target.value)}
                      disabled={savingNotifications}
                      className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring dark:bg-input/30"
                    >
                      <option value="">No agent selected</option>
                      {botAgents.map((agent: AgentConfig) => (
                        <option key={agent.id} value={agent.id}>{agent.name}</option>
                      ))}
                    </select>
                    <Button type="button" size="sm" variant="outline" onClick={() => setAgentDialogOpen(true)}>
                      Manage
                    </Button>
                  </div>
                </div>

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
      <AgentDialog
        open={agentDialogOpen}
        onOpenChange={(open) => {
          setAgentDialogOpen(open);
          if (!open) {
            fetch(`/api/workspaces/${workspaceId}`)
              .then((res) => res.json())
              .then((updated: Workspace) => {
                setWorkspace(updated);
                setNotificationDraft(updated.notificationSettings ?? defaultNotificationSettings());
              })
              .catch(() => undefined);
          }
        }}
        workspaceId={workspaceId}
        roleFilter="bot"
      />
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
    wechat: {},
  };
}

function buildQRCodeImageUrl(content: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=8&data=${encodeURIComponent(content)}`;
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
