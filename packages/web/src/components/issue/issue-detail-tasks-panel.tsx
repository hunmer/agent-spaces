'use client';

import { Bot, ChevronDown, Maximize2, MessageSquare, Workflow as WorkflowIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AgentUsageRecord, ExecutionLog, ExecutionStep, Workflow, WorkflowNode } from '@agent-spaces/shared';
import { Agent, AgentContent } from '@/components/chat/subagent';
import { AgentIcon, colorFromName } from '@/components/common/agent-icon';
import { UsageDashboardSessionDialog } from '@/components/home/usage-dashboard-session-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Markdown } from '@/components/ui/markdown';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { WorkflowPreview } from '@/components/workflow/workflow-preview';
import { executionLogApi, workflowApi } from '@/lib/workflow-api';
import { sdk } from '@/lib/sdk';
import { getWS } from '@/lib/ws';

interface IssueDetailTasksPanelProps {
  issue: { id: string; workflowId?: string; workflowExecutionId?: string; title: string };
  workspaceId: string;
  t: (key: string, params?: Record<string, string | number | Date>) => string;
}

type TaskPanelView = 'workflow' | 'agents';

type IssueExecutionLog = ExecutionLog & {
  issueId?: string;
  issueTitle?: string;
};

type AgentRunCard = {
  nodeId: string;
  title: string;
  agentId?: string;
  avatarUrl?: string;
  icon?: string;
  apiBase?: string;
  model?: string;
  providerId?: string;
  modelProvider?: string;
  status: 'idle' | ExecutionStep['status'];
  outputText: string;
  sessionId?: string;
  timestamp?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function extractOutputText(step?: ExecutionStep): string {
  if (!step) return '';

  const tryRead = (value: unknown): string => {
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) {
      return value
        .map(item => tryRead(item))
        .filter(Boolean)
        .join('\n')
        .trim();
    }
    if (!isRecord(value)) return '';

    const result = tryRead(value.result);
    if (result) return result;

    const message = tryRead(value.message);
    if (message) return message;

    return JSON.stringify(value, null, 2);
  };

  const output = tryRead(step.output);
  if (output) return output;
  if (step.error) return step.error;

  const lastLog = [...(step.logs ?? [])].reverse().find(entry => entry.message?.trim());
  return lastLog?.message?.trim() ?? '';
}

function extractSessionId(step?: ExecutionStep): string | undefined {
  if (!step || !isRecord(step.output)) return undefined;
  const sessionId = step.output.sessionId;
  return typeof sessionId === 'string' && sessionId.trim() ? sessionId.trim() : undefined;
}

function getStatusLabel(status: AgentRunCard['status'], t: (key: string, params?: Record<string, string | number | Date>) => string) {
  switch (status) {
    case 'running':
      return t('detail.statusRunning');
    case 'completed':
      return t('detail.statusCompleted');
    case 'error':
      return t('detail.statusFailed');
    case 'skipped':
      return t('detail.statusSkipped');
    default:
      return t('detail.statusIdle');
  }
}

function getStatusVariant(status: AgentRunCard['status']): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'completed':
      return 'default';
    case 'running':
      return 'secondary';
    case 'error':
      return 'destructive';
    default:
      return 'outline';
  }
}

function formatExecutionLogLabel(log: IssueExecutionLog, t: (key: string, params?: Record<string, string | number | Date>) => string): string {
  const startedAt = new Date(log.startedAt).toLocaleString();
  const status = log.status === 'running'
    ? t('detail.statusRunning')
    : log.status === 'completed'
      ? t('detail.statusCompleted')
      : log.status === 'paused'
        ? t('detail.statusPaused')
        : t('detail.statusFailed');
  return t('detail.executionLogLabel', { startedAt, status });
}

function sortIssueExecutionLogs(logs: IssueExecutionLog[]): IssueExecutionLog[] {
  return [...logs].sort((a, b) => {
    if (a.status === 'running' && b.status !== 'running') return -1;
    if (a.status !== 'running' && b.status === 'running') return 1;
    return b.startedAt - a.startedAt;
  });
}

function AgentRunsView({
  workflowId,
  workspaceId,
  executionLog,
  t,
}: {
  workflowId: string;
  workspaceId: string;
  executionLog?: ExecutionLog | null;
  t: (key: string, params?: Record<string, string | number | Date>) => string;
}) {
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [fullscreenCard, setFullscreenCard] = useState<AgentRunCard | null>(null);
  const [sessionRecord, setSessionRecord] = useState<AgentUsageRecord | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);

  const openSessionDialog = async (card: AgentRunCard) => {
    if (!card.sessionId) return;
    setSessionLoading(true);
    setSessionRecord(null);
    try {
      const detail = await sdk.agent.sessionDetail(card.sessionId);
      // 复用 usage-dashboard 对话框需要 AgentUsageRecord，构造最小 record
      if (detail.usage) {
        setSessionRecord(detail.usage);
      } else {
        setSessionRecord({
          id: card.nodeId,
          workspaceId,
          agentSessionId: card.sessionId,
          agentConfigId: card.agentId ?? '',
          role: 'assistant',
          status: card.status === 'completed' ? 'completed' : 'error',
          runtime: card.modelProvider,
          model: card.model,
          summary: card.title,
          inputTokens: 0,
          outputTokens: 0,
          cachedInputTokens: 0,
          reasoningTokens: 0,
          totalTokens: 0,
          inputCostUsd: 0,
          outputCostUsd: 0,
          totalCostUsd: 0,
          startedAt: card.timestamp ? new Date(card.timestamp).toISOString() : new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 0,
        } as AgentUsageRecord);
      }
    } catch {
      setSessionRecord(null);
    } finally {
      setSessionLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    setWorkflow(null);

    workflowApi.get(workflowId).then((wf) => {
      if (active) setWorkflow(wf);
    }).catch(() => {});

    return () => {
      active = false;
    };
  }, [workflowId]);

  const cards = useMemo<AgentRunCard[]>(() => {
    const nodes = (executionLog?.snapshot?.nodes ?? workflow?.nodes ?? []).filter(
      (node): node is WorkflowNode => node.type === 'agent_run',
    );
    const stepMap = new Map((executionLog?.steps ?? []).map(step => [step.nodeId, step]));

    return nodes.map((node) => {
      const step = stepMap.get(node.id);
      const agent = isRecord(node.data.agent) ? node.data.agent : null;

      return {
        nodeId: node.id,
        title: typeof agent?.name === 'string' && agent.name.trim() ? agent.name : node.label,
        agentId: typeof agent?.id === 'string' ? agent.id : undefined,
        avatarUrl: typeof agent?.avatarUrl === 'string' && agent.avatarUrl.trim() ? agent.avatarUrl : undefined,
        icon: typeof agent?.icon === 'string' && agent.icon.trim() ? agent.icon : undefined,
        apiBase: typeof agent?.apiBase === 'string' ? agent.apiBase : undefined,
        model: typeof agent?.modelId === 'string' ? agent.modelId : undefined,
        providerId: typeof agent?.providerId === 'string' ? agent.providerId : undefined,
        modelProvider: typeof agent?.modelProvider === 'string' ? agent.modelProvider : undefined,
        status: step?.status ?? 'idle',
        outputText: extractOutputText(step),
        sessionId: extractSessionId(step),
        timestamp: step?.finishedAt ?? step?.startedAt,
      };
    });
  }, [executionLog, workflow]);

  if (!workflow) {
    return (
      <div className="flex h-full gap-3 overflow-hidden p-3">
        <Skeleton className="h-full w-[320px] shrink-0 rounded-lg" />
        <Skeleton className="h-full w-[320px] shrink-0 rounded-lg" />
      </div>
    );
  }

  if (cards.length === 0) {
    return <div className="p-4 text-sm text-muted-foreground">{t('detail.noAgentRunNodes')}</div>;
  }

  return (
    <div className="h-full overflow-x-auto overflow-y-hidden p-3">
      <div className="flex h-full min-w-max gap-3">
        {cards.map((card) => (
          <Agent
            key={card.nodeId}
            className="flex h-full w-[320px] shrink-0 flex-col overflow-hidden rounded-xl"
            style={{ background: colorFromName(card.title, 70, 92) }}
          >
            <div className="flex items-center justify-between gap-3 border-b border-black/5 p-3">
              <div className="flex min-w-0 items-center gap-2">
                <AgentIcon
                  agentId={card.agentId}
                  name={card.title}
                  avatarUrl={card.avatarUrl}
                  icon={card.icon}
                  apiBase={card.apiBase}
                  modelId={card.model}
                  providerId={card.providerId}
                  modelProvider={card.modelProvider}
                  className="size-7 shrink-0"
                  bordered={false}
                  hoverCard
                />
                <span className="min-w-0 truncate font-medium text-sm">{card.title}</span>
                {card.model ? (
                  <Badge className="max-w-40 truncate font-mono text-xs" variant="secondary">
                    {card.model}
                  </Badge>
                ) : null}
              </div>
              <Badge variant={getStatusVariant(card.status)}>{getStatusLabel(card.status, t)}</Badge>
            </div>
            <AgentContent className="flex min-h-0 flex-1 flex-col space-y-2 bg-background/95 p-3">
              <div className="flex items-center justify-between gap-2">
                {card.timestamp ? (
                  <div className="text-xs text-muted-foreground">
                    {new Date(card.timestamp).toLocaleString()}
                  </div>
                ) : (
                  <span />
                )}
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    disabled={!card.sessionId}
                    aria-label={t('detail.viewMessages')}
                    title={card.sessionId ? t('detail.viewMessages') : t('detail.noSession')}
                    onClick={() => openSessionDialog(card)}
                  >
                    <MessageSquare className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    aria-label={t('detail.fullscreen')}
                    title={t('detail.fullscreen')}
                    onClick={() => setFullscreenCard(card)}
                  >
                    <Maximize2 className="size-3.5" />
                  </Button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto rounded-md bg-muted/40 p-3 text-sm break-words">
                {card.outputText ? (
                  <Markdown content={card.outputText} workspaceId={workspaceId} />
                ) : (
                  t('detail.noOutput')
                )}
              </div>
            </AgentContent>
          </Agent>
        ))}
      </div>

      <Dialog open={!!fullscreenCard} onOpenChange={(open) => !open && setFullscreenCard(null)}>
        <DialogContent className="flex max-h-[90vh] flex-col gap-3 sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="truncate">{fullscreenCard?.title ?? ''}</DialogTitle>
          </DialogHeader>
          {fullscreenCard?.timestamp ? (
            <div className="text-xs text-muted-foreground">
              {new Date(fullscreenCard.timestamp).toLocaleString()}
            </div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-y-auto rounded-md bg-muted/40 p-4 text-sm break-words">
            {fullscreenCard?.outputText ? (
              <Markdown content={fullscreenCard.outputText} workspaceId={workspaceId} />
            ) : (
              t('detail.noOutput')
            )}
          </div>
        </DialogContent>
      </Dialog>

      <UsageDashboardSessionDialog
        record={sessionRecord}
        open={sessionLoading || !!sessionRecord}
        onOpenChange={(open) => {
          if (!open) {
            setSessionRecord(null);
          }
        }}
      />
    </div>
  );
}

export function IssueDetailTasksPanel({
  issue,
  workspaceId,
  t,
}: IssueDetailTasksPanelProps) {
  const [view, setView] = useState<TaskPanelView>('workflow');
  const [logs, setLogs] = useState<IssueExecutionLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [selectedLogId, setSelectedLogId] = useState<string>('');

  const issueLogs = useMemo(
    () => sortIssueExecutionLogs(
      logs.filter((log) => log.issueId === issue.id || (!!issue.workflowExecutionId && log.id === issue.workflowExecutionId)),
    ),
    [issue.id, issue.workflowExecutionId, logs],
  );

  const selectedExecutionLog = useMemo(
    () => issueLogs.find((log) => log.id === selectedLogId) ?? issueLogs[0] ?? null,
    [issueLogs, selectedLogId],
  );

  useEffect(() => {
    setView('workflow');
    setLogs([]);
    setSelectedLogId('');
  }, [issue.id, issue.workflowId]);

  const loadLogs = useCallback(async (keepLoadingState = true) => {
    if (!issue.workflowId) {
      setLogs([]);
      setLogsLoading(false);
      return;
    }

    if (keepLoadingState) setLogsLoading(true);
    try {
      const nextLogs = await executionLogApi.list(issue.workflowId);
      const scopedLogs = (nextLogs as IssueExecutionLog[])
        .filter((log) => log.issueId === issue.id || (!!issue.workflowExecutionId && log.id === issue.workflowExecutionId));
      setLogs(sortIssueExecutionLogs(scopedLogs));
    } catch {
      setLogs([]);
    } finally {
      if (keepLoadingState) setLogsLoading(false);
    }
  }, [issue.id, issue.workflowExecutionId, issue.workflowId]);

  useEffect(() => {
    let active = true;
    void loadLogs(true);

    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    if (issue.workflowExecutionId) {
      retryTimer = setTimeout(() => {
        if (active) void loadLogs(false);
      }, 1200);
    }

    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [issue.workflowExecutionId, loadLogs]);

  useEffect(() => {
    if (!issue.workflowId) return undefined;
    const ws = getWS(workspaceId);
    const refreshTimers = new Set<ReturnType<typeof setTimeout>>();

    const mergeLog = (log: IssueExecutionLog) => {
      if (log.workflowId !== issue.workflowId) return;
      if (log.issueId !== issue.id && (!issue.workflowExecutionId || log.id !== issue.workflowExecutionId)) return;
      setLogs((current) => {
        const filtered = current.filter((item) => item.id !== log.id);
        return [log, ...filtered];
      });
    };

    const handleLogEvent = (data: unknown) => {
      const event = data as { workflowId?: string; executionId?: string; log?: IssueExecutionLog };
      if (event.workflowId !== issue.workflowId || !event.log) return;
      if (event.log.issueId === issue.id || (!!issue.workflowExecutionId && event.executionId === issue.workflowExecutionId)) {
        mergeLog(event.log);
      }
    };

    const offLog = ws.on('execution:log', handleLogEvent);
    const offStarted = ws.on('workflow:started', (data: unknown) => {
      const event = data as { workflowId?: string; executionId?: string };
      if (event.workflowId !== issue.workflowId) return;
      if (issue.workflowExecutionId && event.executionId !== issue.workflowExecutionId) return;
      void loadLogs(false);
      const timer = setTimeout(() => {
        refreshTimers.delete(timer);
        void loadLogs(false);
      }, 1200);
      refreshTimers.add(timer);
    });
    const offCompleted = ws.on('workflow:completed', handleLogEvent);
    const offFailed = ws.on('workflow:error', handleLogEvent);
    const offPaused = ws.on('workflow:paused', (data: unknown) => {
      const event = data as { workflowId?: string; executionId?: string; log?: IssueExecutionLog };
      if (event.workflowId !== issue.workflowId || !event.log) return;
      if (event.log.issueId === issue.id || (!!issue.workflowExecutionId && event.executionId === issue.workflowExecutionId)) {
        mergeLog(event.log);
      }
    });

    return () => {
      refreshTimers.forEach((timer) => clearTimeout(timer));
      offLog();
      offStarted();
      offCompleted();
      offFailed();
      offPaused();
    };
  }, [issue.id, issue.workflowExecutionId, issue.workflowId, loadLogs, workspaceId]);

  useEffect(() => {
    if (!issueLogs.length) {
      if (selectedLogId) setSelectedLogId('');
      return;
    }
    const runningLog = issueLogs.find((log) => log.status === 'running');
    if (runningLog && selectedLogId !== runningLog.id) {
      setSelectedLogId(runningLog.id);
      return;
    }
    if (!selectedLogId || !issueLogs.some((log) => log.id === selectedLogId)) {
      setSelectedLogId(issueLogs[0].id);
    }
  }, [issueLogs, selectedLogId]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{t('detail.tasks', { count: issue.workflowId ? 1 : 0 })}</h3>
        {issue.workflowId ? (
          <ToggleGroup
            value={[view]}
            onValueChange={(value) => {
              if (value.length > 0) setView(value[0] as TaskPanelView);
            }}
          >
            <ToggleGroupItem value="workflow" aria-label={t('detail.viewWorkflow')} title={t('detail.viewWorkflow')}>
              <WorkflowIcon className="size-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="agents" aria-label={t('detail.viewAgents')} title={t('detail.viewAgents')}>
              <Bot className="size-4" />
            </ToggleGroupItem>
          </ToggleGroup>
        ) : null}
      </div>
      {!issue.workflowId ? (
        <div className="text-sm text-muted-foreground">{t('detail.noTasks')}</div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <Select
              value={selectedLogId}
              onValueChange={(value) => setSelectedLogId(value ?? '')}
              disabled={logsLoading || issueLogs.length === 0}
            >
              <SelectTrigger className="h-8 w-full text-xs sm:max-w-[360px]">
                <SelectValue placeholder={logsLoading ? t('detail.loadingLogs') : t('detail.selectExecutionLog')} />
              </SelectTrigger>
              <SelectContent>
                {issueLogs.map((log) => (
                  <SelectItem key={log.id} value={log.id} className="text-xs">
                    {formatExecutionLogLabel(log, t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div
            key={`${issue.id}:${issue.workflowId}:${view}:${selectedExecutionLog?.id ?? 'none'}`}
            className="h-[420px] overflow-hidden rounded-xl border bg-background lg:h-[480px]"
          >
          {view === 'workflow' ? (
            <WorkflowPreview
              workflowId={issue.workflowId}
              workspaceId={workspaceId}
              issueId={issue.id}
              selectedExecutionLog={selectedExecutionLog}
              embeddedMode="issue"
            />
          ) : (
            <AgentRunsView workflowId={issue.workflowId} workspaceId={workspaceId} executionLog={selectedExecutionLog} t={t} />
          )}
          </div>
        </>
      )}
    </div>
  );
}
