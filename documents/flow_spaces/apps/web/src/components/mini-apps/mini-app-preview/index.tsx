"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import type { PluginConfigField, Workflow } from '@agent-spaces/shared';
import { sdk } from '@/lib/sdk';
import { pluginApi, pluginConfigSchemeApi, type WorkflowPlugin } from '@/lib/workflow-plugin-api';
import { resolveServerAssetUrl } from '@/lib/server';
import { getWS } from '@/lib/ws';
import { cn } from '@/lib/utils';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Progress, ProgressIndicator, ProgressTrack } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AvatarGroup } from '@/components/ui/avatar-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Info, AlertTriangle, MessageSquareText, Monitor, RefreshCw, Workflow as WorkflowIcon } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { MiniAppRenderer, type MiniAppTaskEvent } from '../mini-app-renderer';
import { PluginIcon } from '@/components/workflow/workflow-plugin-icon';
import { PluginConfigDialog } from '@/components/plugins/plugin-config-dialog';
import { PluginConfigSchemeControl } from '@/components/plugins/plugin-config-scheme-control';
import { WorkflowPluginsDialog } from '@/components/workflow/workflow-plugins-dialog';
import { WorkflowListDialog } from '@/components/workflow/workflow-list-dialog';
import { MiniAppWorkflowConfigDialog } from '../mini-app-workflow-config-dialog';
import { listMiniAppWorkflowConfigs } from '@/lib/mini-app-workflow-config';
import { DEVICE_FRAMES, expandDevices, DeviceFrame } from './device-frame';
import { MiniAppInfoDialog } from './info-dialog';
import { MiniAppAgentPopover, MiniAppAgentDock } from './agent-chat-ui';
import {
  activateMiniAppHostSlot,
  subscribeMiniAppHostSlot,
  subscribeMiniAppHostSlotActive,
} from '../mini-app-host-slots';

export interface MiniAppPreviewProps {
  type: 'react' | 'html';
  sourceCode: string;
  error: string | null;
  onError: (error: string | null) => void;
  projectId?: string;
  projectName?: string;
  hideHeader?: boolean;
  /** List of enabled plugin IDs */
  enabledPlugins?: string[];
  /** 开启 agent 对话（manifest.enableAgents） */
  enableAgents?: boolean;
  /** Agent Chat 展示位置；mini-app-slot 由 mini-app 提供挂载插槽。 */
  agentChatPlacement?: 'dock' | 'mini-app-slot';
  /** filename -> content map for multi-file import resolution */
  files?: Record<string, string>;
  /** entry point filename */
  mainFile?: string;
  /** 支持的设备类型（manifest.devices），如 ['mobile', 'ipad', 'pc'] */
  devices?: string[];
  allowScroll?: boolean;
  /** 重载回调：由父组件提供，重新拉取项目文件后再重挂载渲染器 */
  onReload?: (onProgress?: (loaded: number, total: number) => void) => Promise<void> | void;
}

export function MiniAppPreview({ type, sourceCode, error, onError, projectId, projectName, hideHeader, enabledPlugins, files, mainFile, enableAgents, agentChatPlacement, devices, allowScroll = false, onReload }: MiniAppPreviewProps) {
  const t = useTranslations('mini-apps');
  const workflowT = useTranslations('workflows');
  const [infoOpen, setInfoOpen] = useState(false);
  const [chatDockOpen, setChatDockOpen] = useState(false);
  const [agentChatSlot, setAgentChatSlot] = useState<HTMLElement | null>(null);
  const agentChatInMiniApp = agentChatPlacement === 'mini-app-slot';

  useEffect(() => {
    if (!projectId || !agentChatInMiniApp) {
      setAgentChatSlot(null);
      return;
    }
    const unsubscribeSlot = subscribeMiniAppHostSlot(projectId, 'agent-chat', setAgentChatSlot);
    const unsubscribeActive = subscribeMiniAppHostSlotActive(projectId, 'agent-chat', setChatDockOpen);
    return () => {
      unsubscribeSlot();
      unsubscribeActive();
    };
  }, [agentChatInMiniApp, projectId]);

  const setAgentChatOpen = useCallback((open: boolean) => {
    setChatDockOpen(open);
    if (projectId && agentChatInMiniApp) {
      activateMiniAppHostSlot(projectId, 'agent-chat', open);
    }
  }, [agentChatInMiniApp, projectId]);

  const toggleAgentChat = useCallback(() => {
    setAgentChatOpen(!chatDockOpen);
  }, [chatDockOpen, setAgentChatOpen]);
  // 重载 mini-app：先由父组件重新拉取文件，再递增 key 重挂载渲染器
  const [reloadKey, setReloadKey] = useState(0);
  const [reloading, setReloading] = useState(false);
  const [reloadProgress, setReloadProgress] = useState(0); // 0-100
  const handleReload = useCallback(async () => {
    // 提供 onReload：重新拉文件后重挂载，比刷新页面快（复用 bundle/WS/状态）
    if (onReload) {
      setReloading(true);
      setReloadProgress(0);
      try {
        await onReload((loaded, total) => {
          setReloadProgress(total > 0 ? Math.round((loaded / total) * 100) : 0);
        });
      } finally { setReloading(false); }
    }
    setReloadKey((k) => k + 1);
  }, [onReload]);
  // dock 布局持久化（百分比 Layout，见 docs/ui/react-resizable-panels-size-units.md）
  const dockLayoutKey = 'mini-app-dock:layout';
  const defaultDockLayout: Record<string, number> = { 'mini-app-preview': 70, 'mini-app-agent-dock': 30 };
  const [dockLayout, setDockLayout] = useState<Record<string, number>>(() => {
    if (typeof window === 'undefined') return defaultDockLayout;
    try {
      const raw = window.localStorage.getItem(dockLayoutKey);
      const parsed = raw ? JSON.parse(raw) as Record<string, number> : null;
      return parsed ?? defaultDockLayout;
    } catch {
      return defaultDockLayout;
    }
  });
  const dockLayoutSaveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const handleDockLayoutChange = useCallback((layout: Record<string, number>) => {
    // 关闭 dock 后 PanelGroup 只剩预览面板，不要用 100% 覆盖已保存的双栏布局。
    if (layout['mini-app-agent-dock'] === undefined) return;
    setDockLayout(layout);
    if (dockLayoutSaveTimer.current) clearTimeout(dockLayoutSaveTimer.current);
    dockLayoutSaveTimer.current = setTimeout(() => {
      try { window.localStorage.setItem(dockLayoutKey, JSON.stringify(layout)); } catch {}
    }, 200);
  }, []);
  const [allPlugins, setAllPlugins] = useState<WorkflowPlugin[]>([]);
  const [pluginConfigSchemes, setPluginConfigSchemes] = useState<Record<string, string>>({});
  const [workflowConfigsOpen, setWorkflowConfigsOpen] = useState(false);
  const [configuredWorkflows, setConfiguredWorkflows] = useState<Workflow[]>([]);
  const [allConfiguredWorkflows, setAllConfiguredWorkflows] = useState<Workflow[]>([]);
  const [configWorkflow, setConfigWorkflow] = useState<Workflow | null>(null);
  const [newSchemePluginId, setNewSchemePluginId] = useState<string | null>(null);
  const [newSchemeName, setNewSchemeName] = useState('');
  const [taskEvents, setTaskEvents] = useState<MiniAppTaskEvent[]>([]);

  // 设备外框：可选设备清单 + 当前选中（'none' 表示不套外框）
  const availableDevices = useMemo(() => expandDevices(devices), [devices]);
  const deviceStorageKey = projectId ? `mini-app-device:${projectId}` : '';
  const [device, setDeviceState] = useState<string>(() => {
    if (!deviceStorageKey) return 'none';
    if (typeof window === 'undefined') return 'none';
    const saved = window.sessionStorage.getItem(deviceStorageKey);
    return saved ?? 'none';
  });
  // 包一层：同步写 sessionStorage
  const setDevice = useCallback((next: string) => {
    setDeviceState(next);
    if (deviceStorageKey && typeof window !== 'undefined') {
      window.sessionStorage.setItem(deviceStorageKey, next);
    }
  }, [deviceStorageKey]);
  // 项目切换时从存储恢复（而非直接清空）
  useEffect(() => {
    if (!deviceStorageKey || typeof window === 'undefined') { setDeviceState('none'); return; }
    const saved = window.sessionStorage.getItem(deviceStorageKey);
    setDeviceState(saved ?? 'none');
  }, [deviceStorageKey]);
  // 若当前选中不在可用清单里（manifest 改了），回退到 none
  useEffect(() => {
    if (device !== 'none' && !availableDevices.includes(device)) setDevice('none');
  }, [availableDevices, device, setDevice]);

  // Load plugin metadata for avatar display
  useEffect(() => {
    if (!projectId) return;
    pluginApi.list().then((list) => {
      setAllPlugins(list);
    }).catch(() => {});
    sdk.miniApp.get(projectId).then((project) => {
      setPluginConfigSchemes(project.pluginConfigSchemes || {});
    }).catch(() => setPluginConfigSchemes({}));
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    const ws = getWS(projectId);
    return ws.on('*', (payload) => {
      const message = payload as { event?: unknown; data?: unknown };
      const eventName = typeof message.event === 'string' ? message.event : '';
      if (!eventName.startsWith('miniApp.')) return;
      setTaskEvents((prev) => [
        ...prev.slice(-49),
        { event: eventName, data: message.data, timestamp: new Date().toISOString() },
      ]);
    });
  }, [projectId]);

  const enabledPluginsList = useMemo(() => {
    if (!enabledPlugins?.length) return [];
    const enabledSet = new Set(enabledPlugins);
    return allPlugins.filter(p => enabledSet.has(p.id));
  }, [enabledPlugins, allPlugins]);

  // 未安装的启用插件 ID：仅在插件清单加载完成后（allPlugins 非空）才判断，
  // 避免清单尚未返回时误报。排除内置插件（@agent-spaces/builtin，不走商店安装）。
  const missingPlugins = useMemo(() => {
    if (!enabledPlugins?.length || allPlugins.length === 0) return [];
    const installedSet = new Set(allPlugins.map(p => p.id));
    return enabledPlugins.filter(id => id !== '@agent-spaces/builtin' && !installedSet.has(id));
  }, [enabledPlugins, allPlugins]);

  const enabledPluginAvatars = useMemo(() => {
    return enabledPluginsList.map(p => ({
      imageUrl: p.iconPath ? resolveServerAssetUrl(`/api/plugins/${p.id}/icon`) : '',
      name: p.name,
    }));
  }, [enabledPluginsList]);

  // 插件配置弹窗（hover 卡片齿轮触发）
  const [configPlugin, setConfigPlugin] = useState<{ id: string; name: string; config: PluginConfigField[]; schemeName?: string } | null>(null);
  const openPluginConfig = useCallback((pluginId: string, schemeName?: string) => {
    const plugin = allPlugins.find(p => p.id === pluginId);
    if (!plugin?.config?.length) return;
    setConfigPlugin({ id: plugin.id, name: plugin.name, config: plugin.config, schemeName });
  }, [allPlugins]);
  const selectPluginScheme = useCallback(async (pluginId: string, schemeName: string) => {
    if (!projectId) return;
    const next = { ...pluginConfigSchemes };
    if (schemeName) next[pluginId] = schemeName;
    else delete next[pluginId];
    setPluginConfigSchemes(next);
    await sdk.miniApp.update(projectId, { pluginConfigSchemes: next });
  }, [pluginConfigSchemes, projectId]);
  const createPluginScheme = useCallback(async () => {
    const name = newSchemeName.trim();
    if (!newSchemePluginId || !name) return;
    await pluginConfigSchemeApi.create(newSchemePluginId, name);
    await selectPluginScheme(newSchemePluginId, name);
    setNewSchemePluginId(null);
  }, [newSchemeName, newSchemePluginId, selectPluginScheme]);
  const openWorkflowConfigs = useCallback(async () => {
    if (!projectId) return;
    const [configs, workflows] = await Promise.all([
      listMiniAppWorkflowConfigs(projectId),
      sdk.workflow.list(),
    ]);
    const configuredIds = new Set(configs.map(config => config.workflowId));
    setConfiguredWorkflows(workflows.filter(workflow => configuredIds.has(workflow.id)));
    // 弹窗需要全集，便于用户切换 normal/workspace 时查看所有工作流；
    // “当前工作流”类型通过 configuredIds 收窄到已配置子集。
    setAllConfiguredWorkflows(workflows);
    setWorkflowConfigsOpen(true);
  }, [projectId]);

  // 插件商店弹窗（未安装插件警示标签触发）：安装完成后重载本地清单，警示自动消失
  const [storeOpen, setStoreOpen] = useState(false);
  const reloadPlugins = useCallback(() => {
    if (!projectId) return;
    pluginApi.list().then(setAllPlugins).catch(() => {});
  }, [projectId]);
  // mini-app 预览场景下 manifest 只读，安装流程不回写 enabledPlugins
  const adapterWorkflow = useMemo<Workflow>(() => ({
    id: projectId ?? '',
    name: projectName ?? '',
    folderId: null,
    nodes: [],
    edges: [],
    createdAt: 0,
    updatedAt: 0,
    enabledPlugins: enabledPlugins ?? [],
  }), [projectId, projectName, enabledPlugins]);

  // 加载 mini-app 后同步 document.title，卸载还原
  useEffect(() => {
    if (!projectName) return;
    const prev = document.title;
    document.title = projectName;
    return () => { document.title = prev; };
  }, [projectName]);

  const showToolbar = !!projectId && !hideHeader;
  const handleRendererError = useCallback((nextError: string | null) => {
    onError(nextError === 'React custom view must export a default component.'
      ? t('preview.entryExportError')
      : nextError);
  }, [onError, t]);

  return (
    <div className={cn('relative flex flex-col h-full', allowScroll ? 'overflow-auto' : 'overflow-hidden')}>
      {showToolbar && (
        <div className="relative isolate z-40 flex items-center shrink-0 px-3 py-1.5 border-b bg-background/80 backdrop-blur-sm">
          <div className="flex-1 min-w-0 flex items-center gap-2">
            {enabledPluginAvatars.length > 0 && (
              <AvatarGroup
                avatarUrls={enabledPluginAvatars}
                size="sm"
                renderHoverCard={(index) => {
                  const plugin = enabledPluginsList[index];
                  if (!plugin) return null;
                  const hasConfig = (plugin.config?.length ?? 0) > 0;
                  return (
                    <div className="relative isolate z-[60] w-56 rounded-lg border bg-popover text-popover-foreground p-3 text-left shadow-xl ring-1 ring-black/5 dark:ring-white/10">
                      <div className="flex items-start gap-2">
                        <PluginIcon
                          source={plugin.iconPath
                            ? { type: 'url', url: resolveServerAssetUrl(`/api/plugins/${plugin.id}/icon`) }
                            : { type: 'builtin', variant: 'local' }}
                          className="h-7 w-7 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium truncate">{plugin.name}</div>
                          {plugin.version && (
                            <div className="text-[10px] text-muted-foreground">v{plugin.version}</div>
                          )}
                        </div>
                      </div>
                      {plugin.description && (
                        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground line-clamp-3">
                          {plugin.description}
                        </p>
                      )}
                      {hasConfig && (
                        <PluginConfigSchemeControl
                          pluginId={plugin.id}
                          selectedScheme={pluginConfigSchemes[plugin.id]}
                          onSelect={(schemeName) => selectPluginScheme(plugin.id, schemeName)}
                          onEdit={(schemeName) => openPluginConfig(plugin.id, schemeName)}
                          onCreateRequest={() => {
                            setNewSchemeName('');
                            setNewSchemePluginId(plugin.id);
                          }}
                          className="mt-2"
                        />
                      )}
                    </div>
                  );
                }}
              />
            )}
            {missingPlugins.length > 0 && (
              <button
                type="button"
                onClick={() => setStoreOpen(true)}
                className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-600 transition-colors hover:bg-amber-500/20 dark:text-amber-400"
                title={t('preview.pluginsMissingTip', { ids: missingPlugins.join(', ') })}
              >
                <AlertTriangle className="h-3 w-3" />
                {t('preview.pluginsMissing', { count: missingPlugins.length })}
              </button>
            )}
          </div>
          <span className="text-sm font-medium truncate max-w-[60%] text-center">
            {projectName}
          </span>
          <div className="flex-1 flex justify-end items-center gap-1">
            {availableDevices.length > 0 && (
              <Select value={device} onValueChange={(v) => setDevice(v ?? 'none')}>
                <SelectTrigger className="h-7 w-auto gap-1 text-xs px-2" aria-label={t('preview.device')}>
                  {(() => {
                    const Current = device !== 'none' ? DEVICE_FRAMES[device]?.icon : Monitor;
                    const Icon = Current ?? Monitor;
                    return <Icon className="h-3.5 w-3.5" />;
                  })()}
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('preview.deviceNone')}</SelectItem>
                  {availableDevices.map((d) => {
                    const meta = DEVICE_FRAMES[d];
                    if (!meta) return null;
                    const Icon = meta.icon;
                    return (
                      <SelectItem key={d} value={d}>
                        <span className="inline-flex items-center gap-1.5">
                          <Icon className="h-3.5 w-3.5" />
                          {meta.label}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            )}
            {/* 重载 mini-app：重新拉取文件 + 重挂载渲染器，比刷新页面快 */}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleReload}
              disabled={reloading}
              title={t('preview.reload')}
              aria-label={t('preview.reload')}
            >
              <RefreshCw className={cn('h-4 w-4', reloading && 'animate-spin')} />
            </Button>
            {enableAgents && projectId && !chatDockOpen && <MiniAppAgentPopover projectId={projectId} />}
            {enableAgents && projectId && (
              <Button
                variant={chatDockOpen ? 'secondary' : 'ghost'}
                size="icon"
                className="h-7 w-7"
                onClick={toggleAgentChat}
                title={chatDockOpen ? t('agent.dockClose') : t('agent.dockOpen')}
                aria-label={chatDockOpen ? t('agent.dockClose') : t('agent.dockOpen')}
                aria-pressed={chatDockOpen}
              >
                <MessageSquareText className="h-4 w-4" />
              </Button>
            )}
            {projectId && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => void openWorkflowConfigs()}
                title={t('workflowConfig.open')}
                aria-label={t('workflowConfig.open')}
              >
                <WorkflowIcon className="h-4 w-4" />
              </Button>
            )}
            {projectId && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setInfoOpen(true)}
                title={t('preview.info')}
                aria-label={t('preview.info')}
              >
                <Info className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      )}
      {error && (
        <div className="shrink-0 bg-destructive/10 border-b border-destructive/30 p-2 text-xs text-destructive font-mono whitespace-pre-wrap max-h-32 overflow-auto">
          {error}
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        {(() => {
          // 重载期间显示 loader + 进度条，避免看到旧内容
          if (reloading) {
            return (
              <div className="flex h-full w-full flex-col items-center justify-center gap-4 px-32 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
                <Progress value={reloadProgress} className="max-w-xs">
                  <ProgressTrack>
                    <ProgressIndicator className="transition-none" />
                  </ProgressTrack>
                </Progress>
                <span className="text-xs tabular-nums">{reloadProgress}%</span>
              </div>
            );
          }
          // 预览主体内容（dock 打开/关闭共用）
          const previewEl = (() => {
            const rendererEl = (
              <MiniAppRenderer
                key={reloadKey}
                type={type}
                sourceCode={sourceCode}
                onError={handleRendererError}
                componentProps={{ hostConfig: { agentChatPlacement } }}
                taskEvents={taskEvents}
                files={files}
                mainFile={mainFile}
                allowScroll={allowScroll}
              />
            );
            // 不套外框：原样渲染
            if (device === 'none' || !DEVICE_FRAMES[device]) return rendererEl;
            const meta = DEVICE_FRAMES[device];
            return (
              <div className="h-full w-full overflow-hidden flex items-center justify-center p-4">
                <DeviceFrame meta={meta}>{rendererEl}</DeviceFrame>
              </div>
            );
          })();
          const previewPane = (
            <div className={cn('h-full min-h-0 w-full', allowScroll ? 'overflow-auto' : 'overflow-hidden')}>
              {previewEl}
            </div>
          );

          const showDock = enableAgents && !!projectId && chatDockOpen && !agentChatInMiniApp;
          const showSlottedChat = enableAgents && !!projectId && chatDockOpen && agentChatInMiniApp && agentChatSlot;

          return (
            <>
              <ResizablePanelGroup
                orientation="horizontal"
                className="min-h-0 flex-1"
                defaultLayout={dockLayout}
                onLayoutChange={handleDockLayoutChange}
              >
                <ResizablePanel id="mini-app-preview" defaultSize="70%" minSize="40%">
                  {previewPane}
                </ResizablePanel>
                {showDock && (
                  <>
                    <ResizableHandle withHandle />
                    <ResizablePanel id="mini-app-agent-dock" defaultSize="30%" minSize="20%" maxSize="60%">
                      <MiniAppAgentDock projectId={projectId!} onClose={() => setAgentChatOpen(false)} />
                    </ResizablePanel>
                  </>
                )}
              </ResizablePanelGroup>
              {showSlottedChat && createPortal(
                <MiniAppAgentDock projectId={projectId!} onClose={() => setAgentChatOpen(false)} />,
                agentChatSlot,
              )}
            </>
          );
        })()}
      </div>
      {projectId && (
        <MiniAppInfoDialog open={infoOpen} onOpenChange={setInfoOpen} projectId={projectId} />
      )}
      <WorkflowListDialog
        open={workflowConfigsOpen}
        workflows={allConfiguredWorkflows}
        currentWorkflowIds={new Set(configuredWorkflows.map(w => w.id))}
        onCreate={() => {}}
        onClose={() => setWorkflowConfigsOpen(false)}
        showCreate={false}
        selectable={false}
        onConfigure={(workflow) => setConfigWorkflow(workflow)}
      />
      {projectId ? (
        <MiniAppWorkflowConfigDialog
          open={Boolean(configWorkflow)}
          projectId={projectId}
          workflow={configWorkflow}
          onOpenChange={(open) => { if (!open) setConfigWorkflow(null); }}
        />
      ) : null}
      <AlertDialog open={Boolean(newSchemePluginId)} onOpenChange={(open) => { if (!open) setNewSchemePluginId(null); }}>
        <AlertDialogContent className="sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{workflowT('sidebar.newSchemeTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{workflowT('sidebar.newSchemeDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <Input value={newSchemeName} onChange={(event) => setNewSchemeName(event.target.value)} placeholder={workflowT('sidebar.schemeNamePlaceholder')} className="text-sm" />
          <AlertDialogFooter>
            <AlertDialogCancel>{workflowT('sidebar.cancel')}</AlertDialogCancel>
            <AlertDialogAction disabled={!newSchemeName.trim()} onClick={() => void createPluginScheme()}>{workflowT('sidebar.create')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <PluginConfigDialog
        open={Boolean(configPlugin)}
        onOpenChange={(o) => { if (!o) setConfigPlugin(null); }}
        pluginId={configPlugin?.id || null}
        pluginName={configPlugin?.name || ''}
        config={configPlugin?.config || []}
        schemeName={configPlugin?.schemeName}
      />
      <WorkflowPluginsDialog
        open={storeOpen}
        onOpenChange={(o) => {
          setStoreOpen(o);
          if (!o) reloadPlugins();
        }}
        workflow={adapterWorkflow}
        onWorkflowChange={() => { /* mini-app manifest 只读，安装完靠 reloadPlugins 刷新警示 */ }}
        missingPluginIds={missingPlugins}
        initialSearch={missingPlugins[0] ?? ''}
      />
    </div>
  );
}
