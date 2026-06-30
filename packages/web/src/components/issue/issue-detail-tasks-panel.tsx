'use client';

import { Bot, Workflow as WorkflowIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { ExecutionLog, ExecutionStep, Workflow, WorkflowNode } from '@agent-spaces/shared';
import { Agent, AgentContent } from '@/components/chat/subagent';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WorkflowPreview } from '@/components/workflow/workflow-preview';
import { executionLogApi, workflowApi } from '@/lib/workflow-api';
import { getWS } from '@/lib/ws';

interface IssueDetailTasksPanelProps {
  issue: { id: string; workflowId?: string; title: string };
  workspaceId: string;
  t: (key: string, params?: Record<string, string | number | Date>) => string;
}

type TaskPanelView = 'workflow' | 'agents';

type AgentRunCard = {
  nodeId: string;
  title: string;
  model?: string;
  status: 'idle' | ExecutionStep['status'];
  outputText: string;
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

function getStatusLabel(status: AgentRunCard['status']) {
  switch (status) {
    case 'running':
      return '运行中';
    case 'completed':
      return '已完成';
    case 'error':
      return '失败';
    case 'skipped':
      return '已跳过';
    default:
      return '未执行';
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

function AgentRunsView({
  workflowId,
  workspaceId,
}: {
  workflowId: string;
  workspaceId: string;
}) {
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [executionLog, setExecutionLog] = useState<ExecutionLog | null>(null);

  useEffect(() => {
    let active = true;
    setWorkflow(null);
    setExecutionLog(null);

    workflowApi.get(workflowId).then((wf) => {
      if (active) setWorkflow(wf);
    }).catch(() => {});

    executionLogApi.list(workflowId).then((logs) => {
      if (active) setExecutionLog(logs[0] ?? null);
    }).catch(() => {});

    return () => {
      active = false;
    };
  }, [workflowId]);

  useEffect(() => {
    const ws = getWS(workspaceId);

    const updateFromEvent = (data: unknown) => {
      const event = data as { workflowId?: string; log?: ExecutionLog };
      if (event.workflowId !== workflowId || !event.log) return;
      setExecutionLog(event.log);
    };

    const offLog = ws.on('execution:log', updateFromEvent);
    const offCompleted = ws.on('workflow:completed', updateFromEvent);
    const offFailed = ws.on('workflow:error', updateFromEvent);

    return () => {
      offLog();
      offCompleted();
      offFailed();
    };
  }, [workspaceId, workflowId]);

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
        model: typeof agent?.modelId === 'string' ? agent.modelId : undefined,
        status: step?.status ?? 'idle',
        outputText: extractOutputText(step),
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
    return <div className="p-4 text-sm text-muted-foreground">当前工作流没有 agent_run 节点</div>;
  }

  return (
    <div className="h-full overflow-x-auto overflow-y-hidden p-3">
      <div className="flex h-full min-w-max gap-3">
        {cards.map((card) => (
          <Agent key={card.nodeId} className="flex h-full w-[320px] shrink-0 flex-col rounded-xl">
            <div className="flex items-center justify-between gap-3 border-b p-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 truncate font-medium text-sm">{card.title}</span>
                {card.model ? (
                  <Badge className="max-w-40 truncate font-mono text-xs" variant="secondary">
                    {card.model}
                  </Badge>
                ) : null}
              </div>
              <Badge variant={getStatusVariant(card.status)}>{getStatusLabel(card.status)}</Badge>
            </div>
            <AgentContent className="flex min-h-0 flex-1 flex-col space-y-2 p-3">
              {card.timestamp ? (
                <div className="text-xs text-muted-foreground">
                  {new Date(card.timestamp).toLocaleString()}
                </div>
              ) : null}
              <div className="min-h-0 flex-1 overflow-y-auto rounded-md bg-muted/40 p-3 text-sm whitespace-pre-wrap break-words">
                {card.outputText || '暂无输出'}
              </div>
            </AgentContent>
          </Agent>
        ))}
      </div>
    </div>
  );
}

export function IssueDetailTasksPanel({
  issue,
  workspaceId,
  t,
}: IssueDetailTasksPanelProps) {
  const [view, setView] = useState<TaskPanelView>('workflow');

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{t('detail.tasks', { count: issue.workflowId ? 1 : 0 })}</h3>
        {issue.workflowId ? (
          <Tabs value={view} onValueChange={(value) => setView(value as TaskPanelView)}>
            <TabsList variant="line" className="h-8 gap-0.5 rounded-md border bg-muted/30 p-1">
              <TabsTrigger
                value="workflow"
                className="size-7 px-0 data-[active]:rounded-sm"
                aria-label="工作流视图"
                title="工作流视图"
              >
                <WorkflowIcon className="size-4" />
              </TabsTrigger>
              <TabsTrigger
                value="agents"
                className="size-7 px-0 data-[active]:rounded-sm"
                aria-label="agents视图"
                title="agents视图"
              >
                <Bot className="size-4" />
              </TabsTrigger>
            </TabsList>
          </Tabs>
        ) : null}
      </div>
      {!issue.workflowId ? (
        <div className="text-sm text-muted-foreground">{t('detail.noTasks')}</div>
      ) : (
        <div className="h-[420px] overflow-hidden rounded-xl border bg-background lg:h-[480px]">
          {view === 'workflow' ? (
            <WorkflowPreview workflowId={issue.workflowId} workspaceId={workspaceId} issueId={issue.id} embeddedMode="issue" />
          ) : (
            <AgentRunsView workflowId={issue.workflowId} workspaceId={workspaceId} />
          )}
        </div>
      )}
    </div>
  );
}
