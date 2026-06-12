"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import type { MiniAppProject } from '@agent-spaces/sdk';
import { sdk } from '@/lib/sdk';
import { pluginApi } from '@/lib/workflow-plugin-api';
import { resolveServerAssetUrl } from '@/lib/server';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AvatarGroup } from '@/components/ui/avatar-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChatPanel, type ChatMessage } from '@/components/ui/chat-panel';
import { PanelRightOpen, Loader2, Search, Sparkles } from 'lucide-react';
import { MiniAppRenderer } from './mini-app-renderer';

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

function MiniAppAgentPopover({ projectId }: { projectId: string }) {
  const t = useTranslations('mini-apps');
  const searchParams = useSearchParams();
  const route = searchParams.get('route') ?? '/';

  const [open, setOpen] = useState(false);
  const [agents, setAgents] = useState<Array<{ id: string; name: string; avatar?: string }>>([]);
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
      })));
    } catch { /* ignore */ }
  }, [projectId, agentId, sessionId]);

  useEffect(() => { if (open) loadHistory(); }, [open, loadHistory]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
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

  const current = agents.find((a) => a.id === agentId);

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
          headerActions={
            agents.length > 1 ? (
              <Select value={agentId} onValueChange={(v) => setAgentId(v ?? '')}>
                <SelectTrigger className="h-7 w-[120px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : undefined
          }
        />
      </PopoverContent>
    </Popover>
  );
}

export function MiniAppPreview({ type, sourceCode, error, onError, projectId, projectName, hideHeader, enabledPlugins, files, mainFile, enableAgents }: MiniAppPreviewProps) {
  const t = useTranslations('mini-apps');
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [projects, setProjects] = useState<MiniAppProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [allPlugins, setAllPlugins] = useState<{ id: string; name: string; iconPath?: string }[]>([]);

  // Load plugin metadata for avatar display
  useEffect(() => {
    if (!projectId) return;
    pluginApi.list().then((list) => {
      setAllPlugins(list.map(p => ({ id: p.id, name: p.name, iconPath: p.iconPath })));
    }).catch(() => {});
  }, [projectId]);

  const enabledPluginAvatars = useMemo(() => {
    if (!enabledPlugins?.length) return [];
    const enabledSet = new Set(enabledPlugins);
    return allPlugins
      .filter(p => enabledSet.has(p.id))
      .map(p => ({
        imageUrl: p.iconPath ? resolveServerAssetUrl(`/api/plugins/${p.id}/icon`) : '',
        name: p.name,
      }));
  }, [enabledPlugins, allPlugins]);

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
    router.push(`/mini-apps-preview/${id}`);
  }, [router]);

  const showToolbar = !!projectId && !hideHeader;
  const handleRendererError = useCallback((nextError: string | null) => {
    onError(nextError === 'React custom view must export a default component.'
      ? t('preview.entryExportError')
      : nextError);
  }, [onError, t]);

  return (
    <div className="relative flex flex-col h-full">
      {showToolbar && (
        <div className="flex items-center shrink-0 px-3 py-1.5 border-b bg-background/80 backdrop-blur-sm">
          <div className="flex-1 min-w-0">
            {enabledPluginAvatars.length > 0 && (
              <AvatarGroup avatarUrls={enabledPluginAvatars} size="sm" />
            )}
          </div>
          <span className="text-sm font-medium truncate max-w-[60%] text-center">
            {projectName}
          </span>
          <div className="flex-1 flex justify-end">
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
      <MiniAppRenderer
        type={type}
        sourceCode={sourceCode}
        onError={handleRendererError}
        className={hideHeader ? "flex-1" : "flex-1 p-4"}
        files={files}
        mainFile={mainFile}
      />
    </div>
  );
}
