"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import type { MiniAppProject, MiniAppAgentConfig } from '@agent-spaces/sdk';
import type { FileNode, WorkflowAgentTimelineItem, PluginConfigField } from '@agent-spaces/shared';
import { sdk } from '@/lib/sdk';
import { pluginApi, type WorkflowPlugin } from '@/lib/workflow-plugin-api';
import { resolveServerAssetUrl } from '@/lib/server';
import { getWS } from '@/lib/ws';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AvatarGroup } from '@/components/ui/avatar-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChatPanel, type ChatMessage, type ChatPanelMentionFile } from '@/components/ui/chat-panel';
import { PanelRightOpen, FilesIcon, Loader2, Search, Sparkles, Settings2, Settings, Eraser, Smartphone, Monitor, Tablet, Info, AlertTriangle, MessageSquareText, UploadIcon, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { AgentEditor } from '@/components/sidebar/agent-editor';
import { MINI_APP_HIDDEN_FIELDS, type AgentPreset } from '@/components/sidebar/agent-shared';
import { miniAppConfigToAgentPreset, agentPresetToMiniAppConfig } from './mini-app-agent-adapter';
import { MiniAppRenderer, type MiniAppTaskEvent } from './mini-app-renderer';
import { CommonEditorPanel } from '@/components/editor/editor-panel';
import { CommonCodeEditor } from '@/components/editor/common-code-editor';
import { type OpenFile } from '@/stores/editor';
import { getModel, getModelUri, getOrCreateModel } from '@/lib/monaco-models';
import { PluginIcon } from '@/components/workflow/workflow-plugin-icon';
import { WorkflowPluginConfigDialog } from '@/components/workflow/workflow-plugin-config-dialog';
import { WorkflowPluginsDialog } from '@/components/workflow/workflow-plugins-dialog';
import type { Workflow, AgentUsageRecord, AgentUsageSessionDetail, AgentUsageSessionMessage } from '@agent-spaces/shared';

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
  screenRadius?: string;
  screenPadding?: string;
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
    // SVG 实际内屏安全边界：x=100..1419，y≈100..2967。
    screen: { top: '3.3%', right: '6.6%', bottom: '3.3%', left: '6.6%' },
    screenRadius: '12% / 6%',
    maxWidth: '380px',
    aspectRatio: '1520 / 3068',
    isSvg: true,
  },
  ipad_portrait: {
    label: 'iPad Portrait',
    icon: Tablet,
    frame: '/devices/ipad-pro-13-portrait.png',
    // 实测 alpha 镂空：屏幕 inset 上下 5.75%、左右 7.67%
    screen: { top: '5.75%', right: '7.67%', bottom: '5.75%', left: '7.67%' },
    maxWidth: '780px',
    aspectRatio: '2448 / 3132',
  },
  ipad_landscape: {
    label: 'iPad Landscape',
    icon: Tablet,
    frame: '/devices/ipad-pro-13-landscape.png',
    // 实测 alpha 镂空：屏幕 inset 上下 7.67%、左右 5.75%
    screen: { top: '7.67%', right: '5.75%', bottom: '7.67%', left: '5.75%' },
    maxWidth: '1180px',
    aspectRatio: '3132 / 2448',
  },
  pc: {
    label: 'PC',
    icon: Monitor,
    frame: '/devices/macbook-pro-16.png',
    // 实测 alpha 镂空：屏幕 inset 上下 10.33%、左右 9.80%
    screen: { top: '10.33%', right: '9.8%', bottom: '10.33%', left: '9.8%' },
    maxWidth: '1400px',
    aspectRatio: '4340 / 2860',
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

/** 解析 "1520 / 3068" 形式的 aspectRatio 为数值宽高比。 */
function parseAspectRatio(s?: string): number {
  if (!s) return 1;
  const parts = s.split('/').map((x) => parseFloat(x.trim()));
  if (parts.length === 2 && parts[1]) return parts[0] / parts[1];
  return parseFloat(s) || 1;
}

/**
 * 设备外框容器：测量父容器尺寸，按设备宽高比算出"既不超宽也不超高"的
 * 实际宽高（取宽/高两个约束的较小值），保证设备等比完整显示且不滚动。
 */
function DeviceFrame({ meta, children }: { meta: typeof DEVICE_FRAMES[string]; children: ReactNode }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const ratio = useMemo(() => parseAspectRatio(meta.aspectRatio), [meta.aspectRatio]);
  const maxW = useMemo(() => parseFloat(meta.maxWidth ?? '9999') || 9999, [meta.maxWidth]);

  useEffect(() => {
    const el = wrapRef.current?.parentElement;
    if (!el) return;
    const measure = () => {
      const pad = 32; // p-4 上下/左右各 16px
      const availW = Math.max(0, el.clientWidth - pad);
      const availH = Math.max(0, el.clientHeight - pad);
      if (availW <= 0 || availH <= 0) return;
      // 按宽算高、按高算宽，取能放下的那个
      let w = availW;
      let h = w / ratio;
      if (h > availH) {
        h = availH;
        w = h * ratio;
      }
      // 不超过声明 maxWidth
      if (w > maxW) {
        w = maxW;
        h = w / ratio;
      }
      setSize({ w: Math.round(w), h: Math.round(h) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ratio, maxW]);

  const screen = meta.screen;
  return (
    <div
      ref={wrapRef}
      className="relative"
      style={size ? { width: size.w, height: size.h } : { width: 0, height: 0 }}
    >
      {/* 屏幕内容层（下层）：overflow-hidden 裁剪；transform 建立包含块让 fixed/sticky 相对本屏定位 */}
      <div
        className="absolute isolate overflow-hidden bg-white dark:bg-black"
        style={{
          top: screen.top,
          right: screen.right,
          bottom: screen.bottom,
          left: screen.left,
          borderRadius: meta.screenRadius,
          clipPath: meta.screenRadius ? `inset(0 round ${meta.screenRadius})` : undefined,
          padding: meta.screenPadding,
          transform: 'translateZ(0)',
        }}
      >
        {children}
      </div>
      {/* 设备外框层（上层）：屏幕区镂空透明，透出内容；不透明边框盖住溢出 */}
      <img
        src={meta.frame}
        alt={meta.label}
        className="pointer-events-none absolute inset-0 z-10 h-full w-full object-fill select-none"
        draggable={false}
      />
    </div>
  );
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

function markAskUserQuestionAnswered(
  timeline: WorkflowAgentTimelineItem[] | undefined,
  questionId: string,
  answer: string,
): WorkflowAgentTimelineItem[] | undefined {
  if (!timeline?.length) return timeline;
  return timeline.map((item) => {
    if (item.type !== 'tool' || item.id !== questionId || item.name !== 'askUserQuestions') return item;
    return { ...item, result: { answer, input: item.input }, status: 'success' as const };
  });
}

function flattenAgentFiles(nodes: FileNode[]): ChatPanelMentionFile[] {
  const files: ChatPanelMentionFile[] = [];
  const walk = (items: FileNode[]) => {
    for (const item of items) {
      if (item.type === 'file') files.push({ path: item.path, name: item.name });
      if (item.children) walk(item.children);
    }
  };
  walk(nodes);
  return files;
}

/** Mini-app Agent 对话逻辑（popover 与 dock 共享同一份会话状态）。 */
function useMiniAppAgentChat(projectId: string) {
  const searchParams = useSearchParams();
  const route = searchParams.get('route') ?? '/';

  const [agents, setAgents] = useState<Array<{ id: string; name: string; avatar?: string; suggestions?: string[] }>>([]);
  const [agentId, setAgentId] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [agentFilesEnabled, setAgentFilesEnabled] = useState(false);
  const [agentFileMentions, setAgentFileMentions] = useState<ChatPanelMentionFile[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  // 多会话：sessions 列表 + 当前 sessionId（'' 表示新建草稿，尚未落盘）
  const [sessions, setSessions] = useState<Array<{ id: string; agentId: string; title: string; updatedAt: string }>>([]);
  const [sessionId, setSessionId] = useState<string>('');
  // sessionId 的 ref：让 loadHistory 不依赖 sessionId state，避免 sessionId 变化触发覆盖性重载
  const sessionIdRef = useRef(sessionId);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

  // 加载 agents 清单
  useEffect(() => {
    if (!projectId) return;
    sdk.miniApp.listAgents(projectId).then((r) => {
      setAgents(r.agents);
      if (r.agents.length && !agentId) setAgentId(r.agents[0].id);
    }).catch(() => {});
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!projectId) return;
    sdk.miniApp.get(projectId)
      .then((project) => setAgentFilesEnabled(project.agentPermissions?.includes('Files') === true))
      .catch(() => setAgentFilesEnabled(false));
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !agentFilesEnabled) {
      setAgentFileMentions([]);
      return;
    }
    let cancelled = false;
    sdk.miniApp.getAgentFilesTree(projectId, '', 10, 'preview')
      .then((tree) => {
        if (!cancelled) setAgentFileMentions(flattenAgentFiles(tree));
      })
      .catch(() => {
        if (!cancelled) setAgentFileMentions([]);
      });
    return () => { cancelled = true; };
  }, [projectId, agentFilesEnabled]);

  // 拉取会话列表；agentId 变化时重拉，并自动选中最近一条
  const loadSessions = useCallback(async (currentAgentId?: string) => {
    const aid = currentAgentId ?? agentId;
    if (!projectId || !aid) return;
    try {
      const { sessions: list } = await sdk.miniApp.listAgentSessions(projectId, aid);
      setSessions(list);
      // 若当前 session 不在新列表中（agent 切换），自动选最近一条或新建草稿
      let nextId = '';
      setSessionId((cur) => {
        if (cur && list.some((s) => s.id === cur)) { nextId = cur; return cur; }
        nextId = list[0]?.id ?? '';
        sessionIdRef.current = nextId; // 同步 ref，与 setSessionId 一致
        return nextId;
      });
      // 自动选中后拉历史（若选中了已有会话）
      if (nextId) {
        const { messages: hist } = await sdk.miniApp.agentHistory(projectId, nextId, aid);
        setMessages(hist.map((m) => ({
          id: m.id, role: m.role, content: m.content,
          timestamp: new Date(m.timestamp),
          timeline: miniAppToolCallsToTimeline(m.toolCalls),
          metadata: { agentSessionId: nextId, agentId: m.agentId },
        })));
      }
    } catch { /* ignore */ }
  }, [projectId, agentId]);

  // agent 切换：重拉 sessions + 清空消息
  useEffect(() => {
    if (!agentId) return;
    setMessages([]);
    loadSessions(agentId);
  }, [agentId, loadSessions]);

  // 拉取当前会话历史（用 ref 读最新 sessionId，不依赖 state，避免覆盖流式输出）
  const loadHistory = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!projectId || !agentId || !sid) { setMessages([]); return; }
    try {
      const { messages: hist } = await sdk.miniApp.agentHistory(projectId, sid, agentId);
      setMessages(hist.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: new Date(m.timestamp),
        timeline: miniAppToolCallsToTimeline(m.toolCalls),
        metadata: { agentSessionId: sid, agentId: m.agentId },
      })));
    } catch { /* ignore */ }
  }, [projectId, agentId]);

  // 切换会话：更新 sessionId 后拉历史（用户显式动作，不会和发送冲突）
  const handleSwitchSession = useCallback((id: string) => {
    sessionIdRef.current = id; // 立即同步，避免 loadHistory 读到旧值
    setSessionId(id);
    setMessages([]);
    // 切换后异步拉历史
    sdk.miniApp.agentHistory(projectId, id, agentId)
      .then(({ messages: hist }) => {
        setMessages(hist.map((m) => ({
          id: m.id, role: m.role, content: m.content,
          timestamp: new Date(m.timestamp),
          timeline: miniAppToolCallsToTimeline(m.toolCalls),
          metadata: { agentSessionId: id, agentId: m.agentId },
        })));
      })
      .catch(() => {});
  }, [projectId, agentId]);

  const handleNewSession = useCallback(() => {
    sessionIdRef.current = '';
    setSessionId('');
    setMessages([]);
    setInput('');
  }, []);

  const handleDeleteSession = useCallback(async (id: string) => {
    if (!projectId || !agentId) return;
    try {
      await sdk.miniApp.clearAgentHistory(projectId, id, agentId);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (sessionIdRef.current === id) {
        sessionIdRef.current = '';
        setSessionId('');
        setMessages([]);
      }
    } catch { /* ignore */ }
  }, [projectId, agentId]);

  const handleRenameSession = useCallback(async (id: string, title: string) => {
    if (!projectId) return;
    try {
      const { session } = await sdk.miniApp.renameAgentSession(projectId, id, title);
      setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title: session.title, updatedAt: session.updatedAt } : s)));
    } catch { /* ignore */ }
  }, [projectId]);

  const handleSend = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || !agentId || sending) return;
    // 首条消息：分配新 sessionId 并加入列表（draft → 落盘）
    let activeSessionId = sessionId;
    if (!activeSessionId) {
      activeSessionId = crypto.randomUUID();
      sessionIdRef.current = activeSessionId; // 立即同步 ref，避免 loadHistory 读到空串覆盖消息
      setSessionId(activeSessionId);
    }
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text, timestamp: new Date(), metadata: { agentSessionId: activeSessionId, agentId } };
    const agentMsgId = crypto.randomUUID();
    setMessages((prev) => [...prev, userMsg, { id: agentMsgId, role: 'agent', content: '', timestamp: new Date(), metadata: { agentSessionId: activeSessionId, agentId } }]);
    setInput('');
    setSending(true);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await sdk.miniApp.agentChat(projectId, agentId, { sessionId: activeSessionId, message: text, route }, { signal: ac.signal });
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
          // 服务端落盘后，刷新会话列表（拿到最新 title / updatedAt）
          loadSessions(agentId);
        }
      });
    } catch { /* aborted or error */ }
    finally {
      setSending(false);
      abortRef.current = null;
    }
  }, [input, agentId, sending, projectId, sessionId, route, loadSessions]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setSending(false);
  }, []);

  const handleAnswerAskUserQuestion = useCallback(async (
    message: ChatMessage,
    item: Extract<WorkflowAgentTimelineItem, { type: 'tool' }>,
    answer: string,
  ) => {
    if (!projectId || !agentId || item.name !== 'askUserQuestions') return;
    await sdk.miniApp.answerAgentQuestion(projectId, agentId, item.id, answer);
    setMessages((prev) => prev.map((m) => (
      m.id === message.id ? { ...m, timeline: markAskUserQuestionAnswered(m.timeline, item.id, answer) } : m
    )));
  }, [projectId, agentId]);

  // 删除单条消息：调后端删除，同步移除本地 messages
  const handleDeleteMessage = useCallback(async (messageId: string) => {
    const sid = sessionIdRef.current;
    if (!projectId || !sid) return;
    try {
      await sdk.miniApp.deleteAgentMessage(projectId, sid, messageId);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      // 同步刷新会话列表（标题可能因首条 user 消息变化）
      loadSessions(agentId);
    } catch { /* ignore */ }
  }, [projectId, agentId, loadSessions]);

  // 重新生成 agent 消息：删该条 + 找到上一条 user 消息重发
  const handleRegenerateMessage = useCallback(async (message: ChatMessage) => {
    if (!projectId || !agentId || message.role !== 'agent') return;
    const sid = sessionIdRef.current;
    if (!sid) return;
    try {
      await sdk.miniApp.deleteAgentMessage(projectId, sid, message.id);
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === message.id);
        if (idx < 0) return prev;
        // 找该 agent 消息之前的最近一条 user 消息
        let userIdx = idx - 1;
        while (userIdx >= 0 && prev[userIdx].role !== 'user') userIdx -= 1;
        const userMsg = userIdx >= 0 ? prev[userIdx] : null;
        // 删除 agent 消息 + 已重发的 user 消息（避免重复），重发会重新追加
        const filtered = prev.filter((m, i) => i !== idx && (userMsg ? m.id !== userMsg.id : true));
        // 异步重发
        if (userMsg) { void handleSend(userMsg.content); }
        return filtered;
      });
    } catch { /* ignore */ }
  }, [projectId, agentId, handleSend]);

  // 「查看上下文」对话框数据：构造轻量 detail（用当前已加载的历史消息）
  const sessionDetailForMessage = useCallback((message: ChatMessage): { record: AgentUsageRecord; detail: AgentUsageSessionDetail } | null => {
    const sid = message.metadata?.agentSessionId;
    if (!sid) return null;
    const ts = message.timestamp instanceof Date ? message.timestamp.toISOString() : message.timestamp;
    const record: AgentUsageRecord = {
      id: message.id,
      workspaceId: projectId ?? '',
      agentSessionId: sid,
      agentConfigId: message.metadata?.agentId ?? agentId ?? '',
      role: 'assistant',
      status: 'completed',
      runtime: message.metadata?.runtime,
      model: message.metadata?.model,
      summary: message.metadata?.summary,
      inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, reasoningTokens: 0, totalTokens: 0,
      inputCostUsd: 0, outputCostUsd: 0, totalCostUsd: 0,
      startedAt: ts, completedAt: ts,
      durationMs: message.metadata?.duration ?? 0,
    } as AgentUsageRecord;
    const sessionMessages: AgentUsageSessionMessage[] = messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp,
      timeline: m.timeline,
    }));
    const detail: AgentUsageSessionDetail = {
      session: null,
      usage: record,
      messages: sessionMessages,
      source: 'none',
    };
    return { record, detail };
  }, [projectId, agentId, messages]);

  const [clearOpen, setClearOpen] = useState(false);
  const handleClear = useCallback(async () => {
    if (!projectId || !agentId || !sessionId) return;
    try {
      await sdk.miniApp.clearAgentHistory(projectId, sessionId, agentId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      setSessionId('');
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

  return {
    agents, agentId, setAgentId,
    messages, input, setInput, sending,
    handleSend, handleStop,
    clearOpen, setClearOpen, handleClear,
    settingsOpen, setSettingsOpen, settingsLoading, settingsDraft, originalConfig,
    openSettings, handleSettingsSaved,
    current, suggestions,
    projectId,
    agentFilesEnabled,
    agentFileMentions,
    loadHistory,
    handleAnswerAskUserQuestion,
    handleDeleteMessage, handleRegenerateMessage, sessionDetailForMessage,
    // 多会话
    sessions, sessionId,
    handleSwitchSession, handleNewSession, handleDeleteSession, handleRenameSession,
  };
}

/** Agent 设置 + 清空确认弹窗（两种形态共用）。 */
function MiniAppAgentDialogs({ projectId, chat }: { projectId: string; chat: ReturnType<typeof useMiniAppAgentChat> }) {
  const t = useTranslations('mini-apps');
  const {
    settingsOpen, setSettingsOpen, settingsLoading, settingsDraft, originalConfig, handleSettingsSaved,
    clearOpen, setClearOpen, handleClear,
  } = chat;
  return (
    <>
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
    </>
  );
}

function MiniAppAgentFilesDialog({ projectId }: { projectId: string }) {
  const [tree, setTree] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [modifiedFileContents, setModifiedFileContents] = useState<Record<string, string>>({});
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reloadTree = useCallback(async () => {
    setLoading(true);
    try {
      setTree(await sdk.miniApp.getAgentFilesTree(projectId, '', 10, 'preview'));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const uploadFiles = useCallback(async (targetPath: string, files: File[]) => {
    const formData = new FormData();
    for (const file of files) formData.append('files', file);
    if (targetPath) formData.append('folder', targetPath);
    formData.append('scope', 'preview');
    await sdk.miniApp.uploadAgentFiles(projectId, formData);
    await reloadTree();
  }, [projectId, reloadTree]);

  const openFile = useCallback(async (path: string) => {
    const existing = openFiles.find((file) => file.path === path);
    if (existing) {
      setActiveFilePath(path);
      return;
    }

    const { content } = await sdk.miniApp.readAgentFile(projectId, path, 'preview');
    setOpenFiles((prev) => [...prev, { path, name: path.split('/').pop() || path, content, modified: false }]);
    setActiveFilePath(path);
  }, [openFiles, projectId]);

  const activeFile = useMemo(
    () => openFiles.find((file) => file.path === activeFilePath),
    [activeFilePath, openFiles],
  );
  const activeContent = activeFile ? modifiedFileContents[activeFile.path] ?? activeFile.content : '';
  const modelPath = activeFilePath
    ? getModelUri(`mini-app-preview-agent-files:${projectId}`, activeFilePath).toString()
    : undefined;

  const handleChange = useCallback((path: string, content: string) => {
    setOpenFiles((prev) => prev.map((file) => (
      file.path === path ? { ...file, modified: file.content.replace(/\r\n?/g, '\n') !== content.replace(/\r\n?/g, '\n') } : file
    )));
    setModifiedFileContents((prev) => {
      const file = openFiles.find((item) => item.path === path);
      if (!file) return prev;
      const next = { ...prev };
      if (file.content.replace(/\r\n?/g, '\n') === content.replace(/\r\n?/g, '\n')) delete next[path];
      else next[path] = content;
      return next;
    });
  }, [openFiles]);

  const handleSave = useCallback(async () => {
    if (!activeFilePath || !activeFile) return;
    const content = modifiedFileContents[activeFilePath] ?? activeFile.content;
    await sdk.miniApp.writeAgentFile(projectId, activeFilePath, content, 'preview');
    setOpenFiles((prev) => prev.map((file) => (
      file.path === activeFilePath ? { ...file, content, modified: false } : file
    )));
    setModifiedFileContents((prev) => {
      const next = { ...prev };
      delete next[activeFilePath];
      return next;
    });
    await reloadTree();
  }, [activeFile, activeFilePath, modifiedFileContents, projectId, reloadTree]);

  const handleRefreshActiveFile = useCallback(async () => {
    if (!activeFilePath || activeFile?.modified) return;
    const { content } = await sdk.miniApp.readAgentFile(projectId, activeFilePath, 'preview');
    setOpenFiles((prev) => prev.map((file) => (
      file.path === activeFilePath ? { ...file, content } : file
    )));
  }, [activeFile?.modified, activeFilePath, projectId]);

  const api = useMemo(() => ({
    tree,
    treeLoading: loading,
    loadingDirs: new Set<string>(),
    openFiles,
    loadTree: reloadTree,
    loadDirectory: reloadTree,
    openFile,
    searchFiles: async (query: string) => {
      const lower = query.toLowerCase();
      const results: FileNode[] = [];
      const walk = (nodes: FileNode[]) => {
        for (const node of nodes) {
          if (node.name.toLowerCase().includes(lower)) results.push(node);
          if (node.children) walk(node.children);
        }
      };
      walk(tree);
      return results;
    },
    saveEmptyFile: async (path: string) => {
      await sdk.miniApp.writeAgentFile(projectId, path, '', 'preview');
      await reloadTree();
    },
    deletePath: async (path: string) => {
      await sdk.miniApp.deleteAgentFile(projectId, path, 'preview');
      await reloadTree();
    },
    renamePath: async (oldPath: string, newPath: string) => {
      await sdk.miniApp.renameAgentFile(projectId, oldPath, newPath, 'preview');
      await reloadTree();
    },
    copyPath: async (_srcPath: string, _destPath: string) => {},
    uploadFiles,
  }), [loading, openFile, openFiles, projectId, reloadTree, tree, uploadFiles]);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 rounded-full hover:bg-background/50"
        title="agent_files/preview"
        aria-label="agent_files/preview"
        onClick={() => setOpen(true)}
      >
        <FilesIcon className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) void reloadTree();
      }}>
        <DialogContent className="flex h-[80vh] !w-[80vw] !max-w-[80vw] flex-col overflow-hidden p-0">
          <DialogHeader className="flex h-12 shrink-0 flex-row items-center gap-2 border-b px-5 py-0">
            <DialogTitle className="min-w-0 flex-1 truncate">agent_files/preview</DialogTitle>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.currentTarget.value = '';
                if (files.length) void uploadFiles('', files);
              }}
            />
            <Button type="button" variant="ghost" size="icon" className="size-7" onClick={() => inputRef.current?.click()}>
              <UploadIcon className="size-3.5" />
            </Button>
          </DialogHeader>
          <div className="flex min-h-0 flex-1">
            <aside className="w-80 shrink-0 border-r">
              <CommonEditorPanel
                storageKey={`mini-app-preview-agent-files:${projectId}`}
                variant="project"
                api={api}
                allowDragUpload
              />
            </aside>
            <main className="min-w-0 flex-1">
              <CommonCodeEditor
                activeFile={activeFile}
                activeFilePath={activeFilePath}
                activeContent={activeContent}
                modelPath={modelPath}
                mediaType={null}
                mediaUrl={null}
                isCommitDiff={false}
                commitDiffData={null}
                pendingJump={null}
                onChange={handleChange}
                onSave={handleSave}
                onRefreshActiveFile={handleRefreshActiveFile}
                onClearPendingJump={() => undefined}
                onGetExpectedModelPath={(path) => getModelUri(`mini-app-preview-agent-files:${projectId}`, path).path}
                onGetModel={(path) => getModel(`mini-app-preview-agent-files:${projectId}`, path)}
                onEnsureModel={(path, content) => getOrCreateModel(`mini-app-preview-agent-files:${projectId}`, path, content)}
                onRegisterNavigation={() => undefined}
              />
            </main>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** ChatPanel 顶部工具区（切换会话 / agent / 设置 / 清空），popover 与 dock 共用。 */
function MiniAppAgentHeaderActions({ chat }: { chat: ReturnType<typeof useMiniAppAgentChat> }) {
  const t = useTranslations('mini-apps');
  const { agents, agentId, setAgentId, openSettings, sending, messages, projectId, agentFilesEnabled,
    sessions, sessionId, handleSwitchSession, handleNewSession, handleDeleteSession } = chat;
  return (
    <>
      {/* 会话切换 */}
      {agentId && (
        <Select value={sessionId} onValueChange={(v) => v === '__new__' ? handleNewSession() : handleSwitchSession(v ?? '')}>
          <SelectTrigger className="h-7 w-[140px] text-xs">
            <SelectValue>
              {sessionId
                ? (sessions.find((s) => s.id === sessionId)?.title ?? t('agent.sessionUntitled'))
                : t('agent.sessionNew')}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__new__">{t('agent.sessionNew')}</SelectItem>
            {sessions.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="truncate">{s.title}</span>
                  <button
                    type="button"
                    className="ml-auto inline-flex shrink-0 rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    title={t('agent.delete')}
                    aria-label={t('agent.delete')}
                    // 阻止 Select 关闭并触发删除
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteSession(s.id); }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </span>
              </SelectItem>
            ))}
            {sessions.length === 0 && (
              <div className="px-2 py-1.5 text-[11px] text-muted-foreground">{t('agent.sessionEmpty')}</div>
            )}
          </SelectContent>
        </Select>
      )}
      {agents.length > 1 && (
        <Select value={agentId} onValueChange={(v) => setAgentId(v ?? '')}>
          <SelectTrigger className="h-7 w-[120px] text-xs">
            <SelectValue>{agents.find((a) => a.id === agentId)?.name ?? agentId}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {agents.map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {agentFilesEnabled ? <MiniAppAgentFilesDialog projectId={projectId} /> : null}
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
        onClick={() => chat.setClearOpen(true)}
        disabled={!agentId || sending || messages.length === 0}
        title={t('agent.clear')}
        aria-label={t('agent.clear')}
      >
        <Eraser className="h-4 w-4" />
      </Button>
    </>
  );
}

/** AI 助手 Popover 形态（按钮触发，浮层 ChatPanel）。 */
function MiniAppAgentPopover({ projectId }: { projectId: string }) {
  const t = useTranslations('mini-apps');
  const chat = useMiniAppAgentChat(projectId);
  const [open, setOpen] = useState(false);

  // 打开时拉取一次历史（用 ref 持有函数，避免其引用变化触发重跑覆盖流式输出）
  const loadHistoryRef = useRef(chat.loadHistory);
  loadHistoryRef.current = chat.loadHistory;
  useEffect(() => { if (open) loadHistoryRef.current(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const { messages, input, setInput, sending, handleSend, handleStop, current, suggestions, agentFileMentions,
    handleAnswerAskUserQuestion, handleDeleteMessage, handleRegenerateMessage, sessionDetailForMessage } = chat;

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
          onAnswerAskUserQuestion={handleAnswerAskUserQuestion}
          onDeleteMessage={handleDeleteMessage}
          onRegenerateMessage={handleRegenerateMessage}
          sessionDetailForMessage={sessionDetailForMessage}
          inputPlaceholder={t('agent.inputPlaceholder')}
          suggestions={suggestions}
          mentionFiles={agentFileMentions}
          headerActions={<MiniAppAgentHeaderActions chat={chat} />}
        />
      </PopoverContent>
      <MiniAppAgentDialogs projectId={projectId} chat={chat} />
    </Popover>
  );
}

/** AI 助手 Dock 形态（右侧固定侧栏 ChatPanel）。 */
function MiniAppAgentDock({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const t = useTranslations('mini-apps');
  const chat = useMiniAppAgentChat(projectId);

  // dock 常驻：仅在 mount 时拉一次历史（agent 切换由 hook 内部 effect 处理）
  const loadHistoryRef = useRef(chat.loadHistory);
  loadHistoryRef.current = chat.loadHistory;
  useEffect(() => { loadHistoryRef.current(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { messages, input, setInput, sending, handleSend, handleStop, current, suggestions, agentFileMentions,
    handleAnswerAskUserQuestion, handleDeleteMessage, handleRegenerateMessage, sessionDetailForMessage } = chat;

  return (
    <div className="flex h-full w-full flex-col border-l bg-background">
      <ChatPanel
        onClose={onClose}
        fillContainer
        className="h-full w-full rounded-none border-0 shadow-none ring-0"
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
        onAnswerAskUserQuestion={handleAnswerAskUserQuestion}
        onDeleteMessage={handleDeleteMessage}
        onRegenerateMessage={handleRegenerateMessage}
        sessionDetailForMessage={sessionDetailForMessage}
        inputPlaceholder={t('agent.inputPlaceholder')}
        suggestions={suggestions}
        mentionFiles={agentFileMentions}
        headerActions={<MiniAppAgentHeaderActions chat={chat} />}
      />
      <MiniAppAgentDialogs projectId={projectId} chat={chat} />
    </div>
  );
}

/** 应用信息键值行。 */
function InfoRow({ label, value }: { label: string; value?: ReactNode }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div className="grid grid-cols-[88px_1fr] gap-2 px-3 py-1.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="break-all">{value}</span>
    </div>
  );
}

/** 应用信息 Dialog（独立弹窗）。 */
function MiniAppInfoDialog({ open, onOpenChange, projectId }: { open: boolean; onOpenChange: (o: boolean) => void; projectId: string }) {
  const t = useTranslations('mini-apps');
  const [project, setProject] = useState<MiniAppProject | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    sdk.miniApp.get(projectId)
      .then((p) => { if (alive) setProject(p); })
      .catch(() => { if (alive) setProject(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open, projectId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[86vh] min-w-[420px] max-w-md flex-col overflow-hidden p-0">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>{t('preview.info')}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="min-h-0 flex-1">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t('preview.infoLoading')}
            </div>
          ) : project ? (
            <div className="py-1">
              <InfoRow label={t('preview.infoName')} value={project.name} />
              <InfoRow label={t('preview.infoId')} value={<code className="text-[11px]">{project.id}</code>} />
              <InfoRow label={t('preview.infoVersion')} value={project.version} />
              <InfoRow label={t('preview.infoType')} value={project.type} />
              <InfoRow label={t('preview.infoMainFile')} value={<code className="text-[11px]">{project.mainFile}</code>} />
              <InfoRow label={t('preview.infoDescription')} value={project.description} />
              {project.devices?.length ? (
                <InfoRow label={t('preview.infoDevices')} value={project.devices.join(', ')} />
              ) : null}
              {project.tags?.length ? (
                <InfoRow label={t('preview.infoTags')} value={(
                  <span className="flex flex-wrap gap-1">
                    {project.tags.map((tag) => <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>)}
                  </span>
                )} />
              ) : null}
              {project.enabledPlugins?.length ? (
                <InfoRow label={t('preview.infoPlugins')} value={project.enabledPlugins.join(', ')} />
              ) : null}
              <InfoRow label={t('preview.infoCreatedAt')} value={new Date(project.createdAt).toLocaleString()} />
              <InfoRow label={t('preview.infoUpdatedAt')} value={new Date(project.updatedAt).toLocaleString()} />
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-muted-foreground">{t('preview.infoEmpty')}</div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

export function MiniAppPreview({ type, sourceCode, error, onError, projectId, projectName, hideHeader, enabledPlugins, files, mainFile, enableAgents, devices, allowScroll = false }: MiniAppPreviewProps) {
  const t = useTranslations('mini-apps');
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [chatDockOpen, setChatDockOpen] = useState(false);
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
    setDockLayout(layout);
    if (dockLayoutSaveTimer.current) clearTimeout(dockLayoutSaveTimer.current);
    dockLayoutSaveTimer.current = setTimeout(() => {
      try { window.localStorage.setItem(dockLayoutKey, JSON.stringify(layout)); } catch {}
    }, 200);
  }, []);
  const [projects, setProjects] = useState<MiniAppProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [allPlugins, setAllPlugins] = useState<WorkflowPlugin[]>([]);
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
  const [configPlugin, setConfigPlugin] = useState<{ id: string; name: string; config: PluginConfigField[] } | null>(null);
  const openPluginConfig = useCallback((pluginId: string) => {
    const plugin = allPlugins.find(p => p.id === pluginId);
    if (!plugin?.config?.length) return;
    setConfigPlugin({ id: plugin.id, name: plugin.name, config: plugin.config });
  }, [allPlugins]);

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
            {enableAgents && projectId && !chatDockOpen && <MiniAppAgentPopover projectId={projectId} />}
            {enableAgents && projectId && (
              <Button
                variant={chatDockOpen ? 'secondary' : 'ghost'}
                size="icon"
                className="h-7 w-7"
                onClick={() => setChatDockOpen((v) => !v)}
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
                onClick={() => setInfoOpen(true)}
                title={t('preview.info')}
                aria-label={t('preview.info')}
              >
                <Info className="h-4 w-4" />
              </Button>
            )}
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
      <div className="flex min-h-0 flex-1">
        {(() => {
          // 预览主体内容（dock 打开/关闭共用）
          const previewEl = (() => {
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

          const showDock = enableAgents && !!projectId && chatDockOpen;

          // dock 打开：用 ResizablePanelGroup 拖拽分隔
          if (showDock) {
            return (
              <ResizablePanelGroup
                orientation="horizontal"
                className="min-h-0 flex-1"
                defaultLayout={dockLayout}
                onLayoutChange={handleDockLayoutChange}
              >
                <ResizablePanel id="mini-app-preview" defaultSize="70%" minSize="40%">
                  {previewPane}
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel id="mini-app-agent-dock" defaultSize="30%" minSize="20%" maxSize="60%">
                  <MiniAppAgentDock projectId={projectId!} onClose={() => setChatDockOpen(false)} />
                </ResizablePanel>
              </ResizablePanelGroup>
            );
          }

          // dock 关闭：单列布局
          return <div className="min-h-0 flex-1">{previewPane}</div>;
        })()}
      </div>
      {projectId && (
        <MiniAppInfoDialog open={infoOpen} onOpenChange={setInfoOpen} projectId={projectId} />
      )}
      <WorkflowPluginConfigDialog
        open={Boolean(configPlugin)}
        onOpenChange={(o) => { if (!o) setConfigPlugin(null); }}
        pluginId={configPlugin?.id || null}
        pluginName={configPlugin?.name || ''}
        config={configPlugin?.config || []}
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
