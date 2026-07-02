'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bell, Bot, CheckCircle2, Loader2, Monitor, Send } from 'lucide-react';
import { toast } from 'sonner';
import type { AgentConfig, NotificationEventKey, NotificationProvider, RobotAccount, Workspace, WorkspaceNotificationSettings } from '@agent-spaces/shared';
import { sdk } from '@/lib/sdk';
import {
  getNotificationPermission,
  isNativeAndroidEnvironment,
  requestNotificationPermission,
  sendNativeNotification,
  type NotificationPermissionStatus,
} from '@/lib/native-notification';
import { useWorkspaceStore } from '@/stores/workspace';

interface NotificationSettingsTabProps {
  workspaceId: string;
  workspace: Workspace;
  notificationDraft: WorkspaceNotificationSettings;
  setNotificationDraft: (draft: WorkspaceNotificationSettings) => void;
  setWorkspace: (ws: Workspace) => void;
  botAgents: AgentConfig[];
  agentDialogOpen: boolean;
  setAgentDialogOpen: (open: boolean) => void;
}

const NOTIFICATION_EVENTS: Array<{ value: NotificationEventKey; labelKey: string }> = [
  { value: 'issue_started', labelKey: 'events.issueStarted' },
  { value: 'issue_completed', labelKey: 'events.issueCompleted' },
  { value: 'channel_agent_completed', labelKey: 'events.channelAgentCompleted' },
];

function defaultNotificationSettings(): WorkspaceNotificationSettings {
  return {
    enabled: false,
    provider: 'lark',
    events: ['issue_started', 'issue_completed'],
    lark: {},
    wechat: {},
  };
}

export { defaultNotificationSettings };

export function NotificationSettingsTab({
  workspaceId,
  workspace,
  notificationDraft,
  setNotificationDraft,
  setWorkspace,
  botAgents,
  agentDialogOpen: _agentDialogOpen,
  setAgentDialogOpen,
}: NotificationSettingsTabProps) {
  const t = useTranslations('projectSettings');
  const tc = useTranslations('common');
  const [savingNotifications, setSavingNotifications] = useState(false);
  const [startingNotifications, setStartingNotifications] = useState(false);
  const [testingNotifications, setTestingNotifications] = useState(false);
  const [nativePermission, setNativePermission] = useState<NotificationPermissionStatus>('default');
  const [isAndroidNative, setIsAndroidNative] = useState(false);
  const [robotAccounts, setRobotAccounts] = useState<RobotAccount[]>([]);

  useEffect(() => {
    sdk.robotAccounts.list()
      .then((data) => setRobotAccounts(data as unknown as RobotAccount[]))
      .catch(() => {});
  }, []);

  const notificationSettings = notificationDraft;
  const upsertWorkspace = useWorkspaceStore((s) => s.upsertWorkspace);

  useEffect(() => {
    setIsAndroidNative(isNativeAndroidEnvironment());
    getNotificationPermission().then(setNativePermission);
  }, []);

  const updateNotifications = async (next: WorkspaceNotificationSettings): Promise<Workspace | null> => {
    if (!workspace || savingNotifications) return null;
    setSavingNotifications(true);
    try {
      const updated = await sdk.workspace.update(workspaceId, { notificationSettings: next } as any);
      setWorkspace(updated);
      upsertWorkspace(updated);
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
      native: {
        ...notificationSettings.native,
        ...patch.native,
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
      const result = await sdk.workspace.startNotifications(workspaceId);
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
      const result = await sdk.workspace.stopNotifications(workspaceId);
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
      await sdk.workspace.testNotification(workspaceId);
      toast.success(t('notifications.testSuccess'));
    } catch (err) {
      toast.error(t('notifications.testFailed'), {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setTestingNotifications(false);
    }
  };

  return (
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
              className="flex flex-col">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="lark">{t('notifications.lark')}</TabsTrigger>
                <TabsTrigger value="wechat">{t('notifications.wechat')}</TabsTrigger>
                <TabsTrigger value="native">{t('notifications.native')}</TabsTrigger>
              </TabsList>

              <TabsContent value="lark" className="space-y-3 pt-2">
                <div className="grid gap-2">
                  <Label className="text-xs text-muted-foreground">{t('notifications.selectRobotAccount')}</Label>
                  <select
                    value={notificationSettings.robotAccountId ?? ''}
                    onChange={(e) => patchNotifications({ robotAccountId: e.target.value || undefined })}
                    disabled={savingNotifications}
                    className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring dark:bg-input/30"
                  >
                    <option value="">{t('notifications.selectRobotAccount')}</option>
                    {robotAccounts.filter((a) => a.type === 'lark').map((a) => (
                      <option key={a.id} value={a.id}>{a.name} ({a.lark?.appId})</option>
                    ))}
                  </select>
                  {robotAccounts.filter((a) => a.type === 'lark').length === 0 && (
                    <p className="text-xs text-muted-foreground">{t('notifications.noRobotAccount')}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={notificationSettings.serviceRunning ? 'outline' : 'default'}
                    onClick={notificationSettings.serviceRunning ? handleStopNotifications : handleStartNotifications}
                    disabled={startingNotifications || savingNotifications || !notificationSettings.robotAccountId}
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
                <div className="grid gap-2">
                  <Label className="text-xs text-muted-foreground">{t('notifications.selectRobotAccount')}</Label>
                  <select
                    value={notificationSettings.robotAccountId ?? ''}
                    onChange={(e) => patchNotifications({ robotAccountId: e.target.value || undefined })}
                    disabled={savingNotifications}
                    className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring dark:bg-input/30"
                  >
                    <option value="">{t('notifications.selectRobotAccount')}</option>
                    {robotAccounts.filter((a) => a.type === 'wechat').map((a) => (
                      <option key={a.id} value={a.id}>{a.name} ({a.wechat?.accountId})</option>
                    ))}
                  </select>
                  {robotAccounts.filter((a) => a.type === 'wechat').length === 0 && (
                    <p className="text-xs text-muted-foreground">{t('notifications.noRobotAccount')}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={notificationSettings.serviceRunning ? 'outline' : 'default'}
                    onClick={notificationSettings.serviceRunning ? handleStopNotifications : handleStartNotifications}
                    disabled={startingNotifications || savingNotifications || !notificationSettings.robotAccountId}
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

                {isAndroidNative && (
                  <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2.5">
                    <div className="space-y-0.5 pr-4">
                      <Label htmlFor="android-ongoing-task-notification" className="text-sm font-medium">
                        {t('notifications.androidOngoingTaskNotification')}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {t('notifications.androidOngoingTaskNotificationDescription')}
                      </p>
                    </div>
                    <Switch
                      id="android-ongoing-task-notification"
                      checked={notificationSettings.native?.androidOngoingTaskNotification ?? false}
                      onCheckedChange={(androidOngoingTaskNotification) => patchNotifications({
                        native: {
                          permissionGranted: notificationSettings.native?.permissionGranted,
                          androidOngoingTaskNotification,
                        },
                      })}
                      disabled={savingNotifications || nativePermission !== 'granted'}
                    />
                  </div>
                )}

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
                        toast.success(t('notifications.nativeTestSent'), { duration: 5000 });
                      } catch (err) {
                        toast.error(`${t('notifications.nativeTestFailed')}: ${err instanceof Error ? err.message : err}`, { duration: 5000 });
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
  );
}
