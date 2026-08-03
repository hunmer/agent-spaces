import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import type { MiniAppAgentConfig } from '@agent-spaces/sdk';
import type { WorkflowAgentTimelineItem, AgentUsageRecord, AgentUsageSessionDetail, AgentUsageSessionMessage } from '@agent-spaces/shared';
import { sdk } from '@/lib/sdk';
import type { ChatMessage, ChatPanelMentionFile } from '@/components/ui/chat-panel';
import { type AgentPreset } from '@/components/sidebar/agent-shared';
import { miniAppConfigToAgentPreset, agentPresetToMiniAppConfig } from '../mini-app-agent-adapter';
import {
  consumeSse,
  miniAppMessageToChatMessage,
  appendMiniAppTimelineText,
  isMiniAppErrorToolResult,
  markAskUserQuestionAnswered,
  flattenAgentFiles,
} from './agent-chat-utils';

/** Mini-app Agent 对话逻辑（popover 与 dock 共享同一份会话状态）。 */
export function useMiniAppAgentChat(projectId: string) {
  const t = useTranslations('mini-apps');
  const searchParams = useSearchParams();
  const route = searchParams.get('route') ?? '/';

  const [agents, setAgents] = useState<Array<{ id: string; name: string; avatar?: string; introduction?: string; suggestions?: string[] }>>([]);
  // 持久化恢复：记住该项目上次选中的 agent
  const [agentId, setAgentId] = useState<string>(() => {
    if (typeof window === 'undefined' || !projectId) return '';
    try { return window.localStorage.getItem(`mini-app-agent:${projectId}`) ?? ''; } catch { return ''; }
  });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [agentFilesEnabled, setAgentFilesEnabled] = useState(false);
  const [agentFileMentions, setAgentFileMentions] = useState<ChatPanelMentionFile[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  // 多会话：sessions 列表 + 当前 sessionId（'' 表示新建草稿，尚未落盘）
  const [sessions, setSessions] = useState<Array<{ id: string; agentId: string; title: string; updatedAt: string }>>([]);
  // 持久化恢复：记住该 (项目, agent) 上次选中的会话
  const [sessionId, setSessionId] = useState<string>(() => {
    if (typeof window === 'undefined' || !projectId || !agentId) return '';
    try { return window.localStorage.getItem(`mini-app-agent-session:${projectId}:${agentId}`) ?? ''; } catch { return ''; }
  });
  // sessionId 的 ref：让 loadHistory 不依赖 sessionId state，避免 sessionId 变化触发覆盖性重载
  const sessionIdRef = useRef(sessionId);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

  // 加载 agents 清单
  useEffect(() => {
    if (!projectId) return;
    sdk.miniApp.listAgents(projectId).then((r) => {
      setAgents(r.agents);
      // 恢复的 agentId 可能已失效（被删除），不在列表里则回退到第一个
      if (r.agents.length && (!agentId || !r.agents.some((a) => a.id === agentId))) {
        setAgentId(r.agents[0].id);
      }
    }).catch(() => {});
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 持久化 agentId：记录该项目上次选中的 agent
  useEffect(() => {
    if (!projectId || typeof window === 'undefined') return;
    try {
      if (agentId) window.localStorage.setItem(`mini-app-agent:${projectId}`, agentId);
      else window.localStorage.removeItem(`mini-app-agent:${projectId}`);
    } catch { /* ignore */ }
  }, [projectId, agentId]);

  // 持久化 sessionId：记录该 (项目, agent) 上次选中的会话
  useEffect(() => {
    if (!projectId || !agentId || typeof window === 'undefined') return;
    try {
      if (sessionId) window.localStorage.setItem(`mini-app-agent-session:${projectId}:${agentId}`, sessionId);
      else window.localStorage.removeItem(`mini-app-agent-session:${projectId}:${agentId}`);
    } catch { /* ignore */ }
  }, [projectId, agentId, sessionId]);

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
        setMessages(hist.map((m) => miniAppMessageToChatMessage(m, nextId)));
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
      setMessages(hist.map((m) => miniAppMessageToChatMessage(m, sid)));
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
        setMessages(hist.map((m) => miniAppMessageToChatMessage(m, id)));
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

  const handleBranchMessage = useCallback(async (message: ChatMessage) => {
    const sourceSessionId = sessionIdRef.current;
    if (!projectId || !sourceSessionId || sending) return;
    try {
      const { session } = await sdk.miniApp.branchAgentSession(projectId, sourceSessionId, message.id);
      sessionIdRef.current = session.id;
      setSessionId(session.id);
      setMessages(session.messages.map((item) => miniAppMessageToChatMessage(item, session.id)));
      setSessions((prev) => [session, ...prev.filter((item) => item.id !== session.id)]);
      setInput('');
    } catch { /* 保持当前会话不变 */ }
  }, [projectId, sending]);

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
          const line = d.line;
          setMessages((prev) => prev.map((m) => {
            if (m.id !== agentMsgId) return m;
            const timeline = appendMiniAppTimelineText(m.timeline, 'message', line);
            return { ...m, content: m.content + line, timeline };
          }));
        } else if (event === 'reasoning' && typeof d.text === 'string') {
          const text = d.text;
          setMessages((prev) => prev.map((m) => (
            m.id === agentMsgId ? { ...m, timeline: appendMiniAppTimelineText(m.timeline, 'thinking', text) } : m
          )));
        } else if (event === 'tool_use' && typeof d.name === 'string') {
          const toolName = d.name;
          const item: WorkflowAgentTimelineItem = {
            id: typeof d.id === 'string' ? d.id : crypto.randomUUID(),
            type: 'tool',
            name: toolName,
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
              status: isMiniAppErrorToolResult(d.result) ? 'error' : 'success',
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

  const handleRerunTool = useCallback(async (
    message: ChatMessage,
    item: Extract<WorkflowAgentTimelineItem, { type: 'tool' }>,
  ) => {
    if (!projectId || !agentId || sending) return;
    const rerunId = `rerun-${item.name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const rerunItem: WorkflowAgentTimelineItem = {
      id: rerunId,
      type: 'tool',
      name: item.name,
      input: item.input,
      status: 'running',
    };
    setMessages((prev) => prev.map((currentMessage) => (
      currentMessage.id === message.id
        ? { ...currentMessage, timeline: [...(currentMessage.timeline ?? []), rerunItem] }
        : currentMessage
    )));
    setSending(true);

    let result: unknown;
    try {
      result = (await sdk.miniApp.rerunAgentTool(projectId, agentId, item.name, item.input)).result;
    } catch (error) {
      result = {
        success: false,
        error: error instanceof Error && error.message ? error.message : t('agent.toolRerunFailed'),
      };
    } finally {
      setSending(false);
    }

    setMessages((prev) => prev.map((currentMessage) => {
      if (currentMessage.id !== message.id) return currentMessage;
      return {
        ...currentMessage,
        timeline: currentMessage.timeline?.map((timelineItem) => (
          timelineItem.type === 'tool' && timelineItem.id === rerunId
            ? { ...timelineItem, result, status: isMiniAppErrorToolResult(result) ? 'error' as const : 'success' as const }
            : timelineItem
        )),
      };
    }));
  }, [projectId, agentId, sending, t]);

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

  // ---- 重置 agents.json（保留 provider/model/runtimeKind） ----
  const [resetOpen, setResetOpen] = useState(false);
  const handleResetAgents = useCallback(async () => {
    if (!projectId) return;
    try {
      await sdk.miniApp.resetAgents(projectId);
      // 刷新 agents 清单（suggestions/introduction 等已恢复种子值）
      const r = await sdk.miniApp.listAgents(projectId);
      setAgents(r.agents);
    } catch { /* ignore */ }
    finally { setResetOpen(false); }
  }, [projectId]);

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
  const introduction = current?.introduction ?? '';

  return {
    agents, agentId, setAgentId,
    messages, input, setInput, sending,
    handleSend, handleStop,
    clearOpen, setClearOpen, handleClear,
    resetOpen, setResetOpen, handleResetAgents,
    settingsOpen, setSettingsOpen, settingsLoading, settingsDraft, originalConfig,
    openSettings, handleSettingsSaved,
    current, suggestions,
    projectId,
    agentFilesEnabled,
    agentFileMentions,
    loadHistory,
    handleAnswerAskUserQuestion, handleRerunTool,
    handleDeleteMessage, handleRegenerateMessage, handleBranchMessage, sessionDetailForMessage,
    introduction,
    // 多会话
    sessions, sessionId,
    handleSwitchSession, handleNewSession, handleDeleteSession, handleRenameSession,
  };
}
