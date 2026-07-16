"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import type { MiniAppProject, MiniAppAgentConfig } from '@agent-spaces/sdk';
import type { WorkflowAgentTimelineItem, PluginConfigField } from '@agent-spaces/shared';
import { sdk } from '@/lib/sdk';
import { pluginApi, type WorkflowPlugin } from '@/lib/workflow-plugin-api';
import { resolveServerAssetUrl } from '@/lib/server';
import { getWS } from '@/lib/ws';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AvatarGroup } from '@/components/ui/avatar-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChatPanel, type ChatMessage } from '@/components/ui/chat-panel';
import { PanelRightOpen, Loader2, Search, Sparkles, Settings2, Settings, Eraser, Smartphone, Monitor, Tablet } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { AgentEditor } from '@/components/sidebar/agent-editor';
import { MINI_APP_HIDDEN_FIELDS, type AgentPreset } from '@/components/sidebar/agent-shared';
import { miniAppConfigToAgentPreset, agentPresetToMiniAppConfig } from './mini-app-agent-adapter';
import { MiniAppRenderer, type MiniAppTaskEvent } from './mini-app-renderer';
import { PluginIcon } from '@/components/workflow/workflow-plugin-icon';
import { WorkflowPluginConfigDialog } from '@/components/workflow/workflow-plugin-config-dialog';

interface MiniAppPreviewProps {
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
  /** filename -> content map for multi-file import resolution */
  files?: Record<string, string>;
  /** entry point filename */
  mainFile?: string;
  /** 支持的设备类型（manifest.devices），如 ['mobile', 'ipad', 'pc'] */
  devices?: string[];
  allowScroll?: boolean;
}

/** 设备外框资源映射。key = manifest.devices 里的设备标识。 */
const DEVICE_FRAMES: Record<string, {
  label: string;
  icon: typeof Smartphone;
  /** 外框图（背景）相对 public 路径 */
  frame: string;
  /** 屏幕区域相对外框的 padding（百分比），用于定位实际内容。 */
  screen: { top: string; right: string; bottom: string; left: string };
  /** 外框在容器里的最大宽度，用于限制大设备。 */
  maxWidth?: string;
  /** 外框纵横比宽/高，用于自适应高度。 */
  aspectRatio?: string;
  isSvg?: boolean;
}> = {
  mobile: {
    label: 'Mobile',
    icon: Smartphone,
    frame: '/devices/iphone-17-pro-max.svg',
    screen: { top: '3%', right: '8%', bottom: '3%', left: '8%' },
    maxWidth: '380px',
    aspectRatio: '9 / 19.5',
    isSvg: true,
  },
  ipad_portrait: {
    label: 'iPad Portrait',
    icon: Tablet,
    frame: '/devices/ipad-pro-13-portrait.png',
    screen: { top: '6%', right: '7%', bottom: '6%', left: '7%' },
    maxWidth: '780px',
    aspectRatio: '820 / 1180',
  },
  ipad_landscape: {
    label: 'iPad Landscape',
    icon: Tablet,
    frame: '/devices/ipad-pro-13-landscape.png',
    screen: { top: '7%', right: '6%', bottom: '7%', left: '6%' },
    maxWidth: '1180px',
    aspectRatio: '1180 / 820',
  },
  pc: {
    label: 'PC',
    icon: Monitor,
    frame: '/devices/macbook-pro-16.png',
    screen: { top: '8%', right: '11%', bottom: '16%', left: '11%' },
    maxWidth: '1400px',
    aspectRatio: '16 / 10',
  },
};

/** 把 manifest.devices 展开成可选设备列表（ipad 拆 portrait/landscape）。 */
function expandDevices(devices?: string[]): string[] {
  if (!devices?.length) return [];
  const out: string[] = [];
  for (const d of devices) {
    if (d === 'ipad') {
      out.push('ipad_portrait', 'ipad_landscape');
    } else {
      out.push(d);
    }
  }
  return out;
}

/** 从 fetch SSE Response 解析 event:/data: 帧，逐帧回调。 */
async function consumeSse(response: Response, onEvent: (event: string, data: unknown) => void) {
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      let event = 'message';
      const dataLines: string[] = [];
      for (const line of frame.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
      }
      if (dataLines.length) {
        try { onEvent(event, JSON.parse(dataLines.join('\n'))); }
        catch { onEvent(event, dataLines.join('\n')); }
      }
    }
  }
}

function miniAppToolCallsToTimeline(toolCalls?: Array<{ name: string; input: unknown; result: unknown }>): WorkflowAgentTimelineItem[] {
  return toolCalls?.map((toolCall, index) => ({
    id: `${toolCall.name}-${index}`,
    type: 'tool' as const,
    name: toolCall.name,
    input: toolCall.input,
    result: toolCall.result,
    status: toolCall.result === undefined ? 'error' as const : 'success' as const,
  })) ?? [];
}

function MiniAppAgentPopover({ projectId }: { projectId: string }) {
  const t = useTranslations('mini-apps');
  const searchParams = useSearchParams();
  const route = searchParams.get('route') ?? '/';

  const [open, setOpen] = useState(false);
  const [agents, setAgents] = useState<Array<{ id: string; name: string; avatar?: string; suggestions?: string[] }>>([]);
  const [agentId, setAgentId] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // session-id：sessionStorage，同 tab reload 复用
  const [sessionId] = useState(() => {
    const key = `mini-app-agent-session:${projectId}`;
    if (typeof window === 'undefined') return '';
    let sid = sessionStorage.getItem(key);
    if (!sid) { sid = crypto.randomUUID(); sessionStorage.setItem(key, sid); }
    return sid;
  });

  // 加载 agents 清单
  useEffect(() => {
    if (!projectId) return;
    sdk.miniApp.listAgents(projectId).then((r) => {
      setAgents(r.agents);
      if (r.agents.length && !agentId) setAgentId(r.agents[0].id);
    }).catch(() => {});
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // agent 变化或首次打开 → 拉历史
  const loadHistory = useCallback(async () => {
    if (!projectId || !agentId) return;
    try {
      const { messages: hist } = await sdk.miniApp.agentHistory(projectId, sessionId, agentId);
      setMessages(hist.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: new Date(m.timestamp),
        timeline: miniAppToolCallsToTimeline(m.toolCalls),
      })));
    } catch { /* ignore */ }
  }, [projectId, agentId, sessionId]);

  useEffect(() => { if (open) loadHistory(); }, [open, loadHistory]);

  const handleSend = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || !agentId || sending) return;
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text, timestamp: new Date() };
    const agentMsgId = crypto.randomUUID();
    setMessages((prev) => [...prev, userMsg, { id: agentMsgId, role: 'agent', content: '', timestamp: new Date() }]);
    setInput('');
    setSending(true);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await sdk.miniApp.agentChat(projectId, agentId, { sessionId, message: text, route }, { signal: ac.signal });
      await consumeSse(res, (event, data) => {
        const d = data as Record<string, unknown>;
        if (event === 'text' && typeof d.line === 'string') {
          setMessages((prev) => prev.map((m) => m.id === agentMsgId ? { ...m, content: m.content + d.line } : m));
        } else if (event === 'tool_use' && typeof d.name === 'string') {
          const item: WorkflowAgentTimelineItem = {
            id: typeof d.id === 'string' ? d.id : crypto.randomUUID(),
            type: 'tool',
            name: d.name,
            input: d.input,
            status: 'running',
          };
          setMessages((prev) => prev.map((m) => (
            m.id === agentMsgId ? { ...m, timeline: [...(m.timeline ?? []), item] } : m
          )));
        } else if (event === 'tool_result') {
          const toolUseId = typeof d.toolUseId === 'string' ? d.toolUseId : '';
          setMessages((prev) => prev.map((m) => {
            if (m.id !== agentMsgId || !m.timeline?.length) return m;
            const index = toolUseId
              ? m.timeline.findLastIndex((item) => item.type === 'tool' && item.id === toolUseId)
              : m.timeline.findLastIndex((item) => item.type === 'tool' && item.status === 'running');
            if (index < 0) return m;
            const timeline = [...m.timeline];
            const item = timeline[index];
            if (!item || item.type !== 'tool') return m;
            timeline[index] = {
              ...item,
              result: d.result,
              status: 'success',
            };
            return { ...m, timeline };
          }));
        } else if (event === 'message_saved') {
          // 服务端已落盘
        }
      });
    } catch { /* aborted or error */ }
    finally {
      setSending(false);
      abortRef.current = null;
    }
  }, [input, agentId, sending, projectId, sessionId, route]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setSending(false);
  }, []);

  const [clearOpen, setClearOpen] = useState(false);
  const handleClear = useCallback(async () => {
    if (!projectId || !agentId) return;
    try {
      await sdk.miniApp.clearAgentHistory(projectId, sessionId, agentId);
      setMessages([]);
    } catch { /* ignore */ }
    finally { setClearOpen(false); }
  }, [projectId, agentId, sessionId]);

  // ---- Agent 设置弹窗 ----
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<AgentPreset | null>(null);
  const [originalConfig, setOriginalConfig] = useState<MiniAppAgentConfig | null>(null);

  const openSettings = useCallback(async () => {
    if (!projectId || !agentId) return;
    setSettingsOpen(true);
    setSettingsLoading(true);
    try {
      const cfg = await sdk.miniApp.getAgent(projectId, agentId);
      setOriginalConfig(cfg);
      setSettingsDraft(miniAppConfigToAgentPreset(cfg));
    } catch { /* ignore */ }
    finally { setSettingsLoading(false); }
  }, [projectId, agentId]);

  // 持久化已在 commit 钩子完成，这里仅做 UI 收尾（关弹窗 + 刷新 agents 列表）
  const handleSettingsSaved = useCallback(() => {
    setSettingsOpen(false);
    if (projectId) {
      sdk.miniApp.listAgents(projectId).then((r) => setAgents(r.agents)).catch(() => {});
    }
  }, [projectId]);

  const current = agents.find((a) => a.id === agentId);
  const suggestions = current?.suggestions ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="ghost" size="icon" className="h-7 w-7" aria-label={t('agent.open')} />}>
        <Sparkles className="h-4 w-4" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-0 border-0 bg-transparent shadow-none">
        <ChatPanel
          onClose={() => setOpen(false)}
          agent={{
            name: current?.name ?? 'Agent',
            avatar: current?.avatar,
            status: sending ? 'busy' : 'online',
          }}
          messages={messages}
          sending={sending}
          input={input}
          onInputChange={setInput}
          onSend={handleSend}
          onStop={handleStop}
          inputPlaceholder={t('agent.inputPlaceholder')}
          suggestions={suggestions}
          headerActions={
            <>
              {agents.length > 1 && (
                <Select value={agentId} onValueChange={(v) => setAgentId(v ?? '')}>
                  <SelectTrigger className="h-7 w-[120px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {agents.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full hover:bg-background/50"
                onClick={openSettings}
                disabled={!agentId}
                title={t('agent.settings')}
                aria-label={t('agent.settings')}
              >
                <Settings2 className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full hover:bg-background/50"
                onClick={() => setClearOpen(true)}
                disabled={!agentId || sending || messages.length === 0}
                title={t('agent.clear')}
                aria-label={t('agent.clear')}
              >
                <Eraser className="h-4 w-4" />
              </Button>
            </>
          }
        />
      </PopoverContent>
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="flex max-h-[86vh] min-w-[60vw] flex-col overflow-hidden p-0">
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle>{t('agent.settingsTitle')}</DialogTitle>
          </DialogHeader>
          {settingsLoading || !settingsDraft || !originalConfig ? (
            <div className="flex h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t('agent.loading')}
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <AgentEditor
                agent={settingsDraft}
                onSaved={handleSettingsSaved}
                onBack={() => setSettingsOpen(false)}
                showFooter
                hiddenFields={MINI_APP_HIDDEN_FIELDS}
                commit={async (draft) => {
                  const cfg = agentPresetToMiniAppConfig(draft, originalConfig);
                  const updated = await sdk.miniApp.updateAgent(projectId, cfg.id, cfg);
                  return miniAppConfigToAgentPreset(updated);
                }}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('agent.clearTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('agent.clearConfirm')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('agent.clearCancel')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleClear}>{t('agent.clearAction')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Popover>
  );
}

export function MiniAppPreview({ type, sourceCode, error, onError, projectId, projectName, hideHeader, enabledPlugins, files, mainFile, enableAgents, devices, allowScroll = false }: MiniAppPreviewProps) {
  const t = useTranslations('mini-apps');
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [projects, setProjects] = useState<MiniAppProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [allPlugins, setAllPlugins] = useState<WorkflowPlugin[]>([]);
  const [taskEvents, setTaskEvents] = useState<MiniAppTaskEvent[]>([]);

  // 设备外框：可选设备清单 + 当前选中（'none' 表示不套外框）
  const availableDevices = useMemo(() => expandDevices(devices), [devices]);
  const [device, setDevice] = useState<string>('none');
  // 项目切换时重置设备选择
  useEffect(() => { setDevice('none'); }, [projectId]);

  // Load plugin metadata for avatar display
  useEffect(() => {
    if (!projectId) return;
    pluginApi.list().then((list) => {
      setAllPlugins(list);
    }).catch(() => {});
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

  const enabledPluginAvatars = useMemo(() => {
    return enabledPluginsList.map(p => ({
      imageUrl: p.iconPath ? resolveServerAssetUrl(`/api/plugins/${p.id}/icon`) : '',
      name: p.name,
    }));
  }, [enabledPluginsList]);

  // 插件配置弹窗（hover 卡片齿轮触发）
  const [configPlugin, setConfigPlugin] = useState<{ id: string; name: string; config: PluginConfigField[] } | null>(null);
  const openPluginConfig = useCallback((pluginId: string) => {
    const plugin = allPlugins.find(p => p.id === pluginId);
    if (!plugin?.config?.length) return;
    setConfigPlugin({ id: plugin.id, name: plugin.name, config: plugin.config });
  }, [allPlugins]);

  // 加载 mini-app 后同步 document.title，卸载还原
  useEffect(() => {
    if (!projectName) return;
    const prev = document.title;
    document.title = projectName;
    return () => { document.title = prev; };
  }, [projectName]);

  // Load projects when drawer opens
  const handleDrawerOpen = useCallback((open: boolean) => {
    setDrawerOpen(open);
    if (open && projects.length === 0) {
      setProjectsLoading(true);
      sdk.miniApp.list().then((list) => {
        setProjects(list);
        setProjectsLoading(false);
      }).catch(() => setProjectsLoading(false));
    }
  }, [projects.length]);

  const handleProjectSwitch = useCallback((id: string) => {
    setDrawerOpen(false);
    router.push(`/mini-apps-preview?id=${encodeURIComponent(id)}`);
  }, [router]);

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
          <div className="flex-1 min-w-0">
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
                        {hasConfig && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0"
                            title={t('pluginTools.config')}
                            onClick={() => openPluginConfig(plugin.id)}
                          >
                            <Settings className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                      {plugin.description && (
                        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground line-clamp-3">
                          {plugin.description}
                        </p>
                      )}
                    </div>
                  );
                }}
              />
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
            {enableAgents && projectId && <MiniAppAgentPopover projectId={projectId} />}
            <Sheet open={drawerOpen} onOpenChange={handleDrawerOpen}>
              <SheetTrigger render={<Button variant="ghost" size="icon" className="h-7 w-7" />}>
                  <PanelRightOpen className="h-4 w-4" />
              </SheetTrigger>
              <SheetContent side="right" className="w-72 p-0">
                <SheetHeader className="px-4 pt-4 pb-2">
                  <SheetTitle className="text-sm">{t('preview.switchProject')}</SheetTitle>
                </SheetHeader>
                <div className="px-3 pb-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder={t('page.searchPlaceholder')}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="h-8 text-xs pl-8"
                    />
                  </div>
                </div>
                <ScrollArea className="h-[calc(100%-100px)]">
                  <div className="px-3 pb-3 space-y-1">
                    {projectsLoading && (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    )}
                    {!projectsLoading && projects
                      .filter((p) => {
                        if (!search) return true;
                        const q = search.toLowerCase();
                        return p.name.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q);
                      })
                      .map((p) => (
                      <button
                        key={p.id}
                        onClick={() => handleProjectSwitch(p.id)}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-left text-sm transition-colors hover:bg-accent ${
                          p.id === projectId ? 'bg-accent' : ''
                        }`}
                      >
                        <span className="truncate flex-1">{p.name}</span>
                        <Badge variant={p.type === 'react' ? 'default' : 'secondary'} className="text-[10px] shrink-0">
                          {p.type === 'react' ? 'React' : 'HTML'}
                        </Badge>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      )}
      {error && (
        <div className="shrink-0 bg-destructive/10 border-b border-destructive/30 p-2 text-xs text-destructive font-mono whitespace-pre-wrap max-h-32 overflow-auto">
          {error}
        </div>
      )}
      <div className={cn('min-h-0 flex-1', allowScroll ? 'overflow-auto' : 'overflow-hidden')}>
        {(() => {
          const rendererEl = (
            <MiniAppRenderer
              type={type}
              sourceCode={sourceCode}
              onError={handleRendererError}
              taskEvents={taskEvents}
              files={files}
              mainFile={mainFile}
              allowScroll={allowScroll}
            />
          );

          // 不套外框：原样渲染
          if (device === 'none' || !DEVICE_FRAMES[device]) return rendererEl;

          const meta = DEVICE_FRAMES[device];
          const screen = meta.screen;
          return (
            <div
              className={cn(
                'h-full w-full overflow-auto flex items-center justify-center p-4',
                allowScroll ? '' : '',
              )}
            >
              <div
                className="relative"
                style={{
                  width: '100%',
                  maxWidth: meta.maxWidth,
                  aspectRatio: meta.aspectRatio,
                }}
              >
                {/* 外框图作为背景层，按宽高比铺满；保留外框线条锐利 */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={meta.frame}
                  alt={meta.label}
                  className="pointer-events-none absolute inset-0 h-full w-full object-contain select-none"
                  draggable={false}
                />
                {/* 屏幕区域：通过百分比 inset 对齐到外框的屏幕开口 */}
                <div
                  className="absolute overflow-hidden bg-white dark:bg-black"
                  style={{
                    top: screen.top,
                    right: screen.right,
                    bottom: screen.bottom,
                    left: screen.left,
                  }}
                >
                  {rendererEl}
                </div>
              </div>
            </div>
          );
        })()}
      </div>
      <WorkflowPluginConfigDialog
        open={Boolean(configPlugin)}
        onOpenChange={(o) => { if (!o) setConfigPlugin(null); }}
        pluginId={configPlugin?.id || null}
        pluginName={configPlugin?.name || ''}
        config={configPlugin?.config || []}
      />
    </div>
  );
}
