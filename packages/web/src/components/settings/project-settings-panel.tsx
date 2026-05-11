'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useChannelStore } from '@/stores/channel';
import { useIssueStore } from '@/stores/issue';
import { useAgentStore } from '@/stores/agent';
import { AgentDialog } from '@/components/sidebar/agent-dialog';
import { Bell, Bot, CheckCircle2, FolderOpen, Hash, ListChecks, Loader2, Monitor, QrCode, RefreshCw, Send } from 'lucide-react';
import { toast } from 'sonner';
import type { AgentConfig, NotificationEventKey, NotificationProvider, Workspace, WorkspaceNotificationSettings } from '@agent-spaces/shared';
import {
  getNotificationPermission,
  requestNotificationPermission,
  sendNativeNotification,
  type NotificationPermissionStatus,
} from '@/lib/native-notification';

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
  const t = useTranslations('projectSettings');
  const tc = useTranslations('common');
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
  const [nativePermission, setNativePermission] = useState<NotificationPermissionStatus>('default');
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
        const ns = ws.notificationSettings ?? defaultNotificationSettings();
        setNotificationDraft(ns);
        setLoading(false);
        // Check native notification permission status
        getNotificationPermission().then((status) => {
          setNativePermission(status);
          if (status === 'granted' && ns.provider === 'native' && !ns.native?.permissionGranted) {
            const updated = { ...ns, native: { permissionGranted: true } };
            setNotificationDraft(updated);
            updateNotifications(updated);
          }
        });
      })
      .catch(() => setLoading(false));
  }, [workspaceId, loadChannels, loadIssues]);

  const autoProcessIssues = workspace?.autoProcessIssues !== false;
  const promptChanged = prompt !== savedPrompt;
  const notificationSettings = notificationDraft;
  const allAgents = useAgentStore((s) => s.agents);
  const botAgents = allAgents.filter((agent) => agent.role === 'bot' && agent.enabled !== false);
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
            toast.success(t('wechat.connectedToast'));
          }
        })
        .catch((err) => {
          toast.error(t('wechat.pollFailed'), {
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
      toast.success(t('prompt.saveSuccess'));
    } catch (err) {
      toast.error(t('prompt.saveFailed'), {
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
      toast.error(t('notifications.saveFailed'), {
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
      toast.success(t('notifications.startSuccess'));
    } catch (err) {
      toast.error(t('notifications.startFailed'), {
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
      toast.success(t('notifications.stopSuccess'));
    } catch (err) {
      toast.error(t('notifications.stopFailed'), {
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
      toast.success(t('notifications.testSuccess'));
    } catch (err) {
      toast.error(t('notifications.testFailed'), {
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
      toast.error(t('wechat.getQrFailed'), {
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

        {/* Basic Info */}
        <div className="space-y-3">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('info.title')}</h4>

          <InfoRow icon={<FolderOpen size={14} />} label={t('info.path')} value={workspace.boundDirs[0] ?? '-'} />

          <InfoRow icon={<Hash size={14} />} label={t('info.channels')} value={String(channels.length)} />

          <InfoRow icon={<ListChecks size={14} />} label={t('info.issues')} value={String(issues.length)} />
        </div>

        {/* Automation */}
        <div className="space-y-3">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('automation.title')}</h4>

          <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
            <div className="space-y-0.5 pr-4">
              <Label htmlFor="auto-process" className="text-sm font-medium">
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
                checked={autoProcessIssues}
                onCheckedChange={handleToggleAutoProcess}
                disabled={saving}
              />
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div className="space-y-3">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('notifications.title')}</h4>

          <div className="space-y-4 rounded-md border px-3 py-3">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5 pr-4">
                <Label htmlFor="message-notifications" className="text-sm font-medium">
                  {t('notifications.messageNotifications')}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t('notifications.messageNotificationsDescription')}
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
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="lark">{t('notifications.lark')}</TabsTrigger>
                    <TabsTrigger value="wechat">{t('notifications.wechat')}</TabsTrigger>
                    <TabsTrigger value="native">{t('notifications.native')}</TabsTrigger>
                  </TabsList>

                  <TabsContent value="lark" className="space-y-3 pt-2">
                    <div className="grid gap-2">
                      <Label htmlFor="lark-app-id" className="text-xs text-muted-foreground">{t('notifications.appId')}</Label>
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
                      <Label htmlFor="lark-app-secret" className="text-xs text-muted-foreground">{t('notifications.appSecret')}</Label>
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
                        {notificationSettings.serviceRunning ? t('notifications.stopService') : t('notifications.startService')}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleTestNotifications}
                        disabled={testingNotifications || savingNotifications || !notificationSettings.serviceRunning}
                      >
                        {testingNotifications && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                        {t('notifications.testSend')}
                      </Button>
                    </div>
                  </TabsContent>

                  <TabsContent value="wechat" className="space-y-3 pt-2">
                    <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2.5">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          {wechatLoggedIn ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <QrCode className="h-4 w-4" />}
                          {t('wechat.robot')}
                        </div>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {wechatLoggedIn
                            ? t('wechat.connected', { accountId: notificationSettings.wechat?.accountId ?? '' })
                            : wechatQR.status === 'scaned'
                              ? t('wechat.scanned')
                              : wechatQR.status === 'expired'
                                ? t('wechat.expired')
                                : t('wechat.scanQr')}
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
                        {wechatLoggedIn ? t('wechat.refreshLogin') : t('wechat.getQr')}
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
                          <p>{t('wechat.status', { status: wechatQR.status === 'scaned' ? 'scanned' : wechatQR.status })}</p>
                          <p className="break-all">{t('wechat.loginUrl', { url: wechatQR.qrcodeImgContent })}</p>
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
                        {notificationSettings.serviceRunning ? t('notifications.stopService') : t('notifications.startService')}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleTestNotifications}
                        disabled={testingNotifications || savingNotifications || !notificationSettings.serviceRunning}
                      >
                        {testingNotifications && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                        {t('notifications.testSend')}
                      </Button>
                    </div>
                  </TabsContent>

                  <TabsContent value="native" className="space-y-3 pt-2">
                    <p className="text-xs text-muted-foreground">{t('notifications.nativeDescription')}</p>

                    <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2.5">
                      <div className="flex items-center gap-2 text-sm">
                        <Monitor className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">
                          {nativePermission === 'granted' && (
                            <span className="flex items-center gap-1.5">
                              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                              {t('notifications.nativePermissionGranted')}
                            </span>
                          )}
                          {nativePermission === 'denied' && t('notifications.nativePermissionDenied')}
                          {nativePermission === 'default' && t('notifications.nativePermissionDefault')}
                          {nativePermission === 'unsupported' && t('notifications.nativePermissionUnsupported')}
                        </span>
                      </div>

                      {nativePermission !== 'unsupported' && nativePermission !== 'granted' && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            const status = await requestNotificationPermission();
                            setNativePermission(status);
                            if (status === 'granted') {
                              patchNotifications({ native: { permissionGranted: true } });
                              toast.success(t('notifications.nativePermissionGrantedToast'));
                            } else if (status === 'denied') {
                              toast.error(t('notifications.nativePermissionDeniedToast'));
                            }
                          }}
                          disabled={nativePermission === 'denied'}
                        >
                          {t('notifications.nativeRequestPermission')}
                        </Button>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          try {
                            await sendNativeNotification(
                              'Agent Spaces',
                              t('notifications.nativeTestSuccess'),
                            );
                            toast.success(t('notifications.nativeTestSuccess'));
                          } catch {
                            toast.error(t('notifications.nativeTestFailed'));
                          }
                        }}
                        disabled={nativePermission !== 'granted'}
                      >
                        {t('notifications.testSend')}
                      </Button>
                    </div>
                  </TabsContent>
                </Tabs>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <Bot className="h-3.5 w-3.5" />
                    {t('botAgent.title')}
                  </div>
                  <div className="flex gap-2">
                    <select
                      value={notificationSettings.botAgentId ?? ''}
                      onChange={(event) => handleBotAgentChange(event.target.value)}
                      disabled={savingNotifications}
                      className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring dark:bg-input/30"
                    >
                      <option value="">{t('botAgent.selectAgent')}</option>
                      {botAgents.map((agent: AgentConfig) => (
                        <option key={agent.id} value={agent.id}>{agent.name}</option>
                      ))}
                    </select>
                    <Button type="button" size="sm" variant="outline" onClick={() => setAgentDialogOpen(true)}>
                      {tc('manage')}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <Bell className="h-3.5 w-3.5" />
                    {t('events.title')}
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
                        <span>{t(item.labelKey)}</span>
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
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('prompt.title')}</h4>

          <div className="space-y-3 rounded-md border px-3 py-3">
            <div className="space-y-0.5">
              <Label htmlFor="workspace-prompt" className="text-sm font-medium">
                {t('prompt.workspacePrompt')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t('prompt.description')}
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
                {t('prompt.savePrompt')}
              </Button>
            </div>
          </div>
        </div>
      </div>
      <AgentDialog
        open={agentDialogOpen}
        onOpenChange={setAgentDialogOpen}
        roleFilter="bot"
      />
    </ScrollArea>
  );
}

const NOTIFICATION_EVENTS: Array<{ value: NotificationEventKey; labelKey: string }> = [
  { value: 'issue_started', labelKey: 'events.issueStarted' },
  { value: 'issue_completed', labelKey: 'events.issueCompleted' },
  { value: 'issue_task_completed', labelKey: 'events.taskCompleted' },
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
