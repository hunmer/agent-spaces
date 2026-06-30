'use client';

import { useEffect, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import type { EngineStatus, ExecutionLog, Workflow } from '@agent-spaces/shared';
import { executionLogApi, workflowApi } from '@/lib/workflow-api';
import { getWS } from '@/lib/ws';
import { Skeleton } from '@/components/ui/skeleton';
import { WorkflowCanvas } from './workflow-canvas';

const noop = () => {};

export function WorkflowPreview({
  workflowId,
  workspaceId,
  className,
}: {
  workflowId: string;
  workspaceId?: string;
  className?: string;
}) {
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [executionLog, setExecutionLog] = useState<ExecutionLog | null>(null);
  const [execStatus, setExecStatus] = useState<EngineStatus>('idle');

  useEffect(() => {
    let active = true;
    setWorkflow(null);
    workflowApi
      .get(workflowId)
      .then((wf) => {
        if (active) setWorkflow(wf);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [workflowId]);

  useEffect(() => {
    let active = true;
    setExecutionLog(null);
    setExecStatus('idle');
    executionLogApi
      .list(workflowId)
      .then((logs) => {
        if (!active) return;
        const latest = logs[0] ?? null;
        setExecutionLog(latest);
        setExecStatus(latest?.status ?? 'idle');
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [workflowId]);

  useEffect(() => {
    if (!workspaceId) return undefined;
    const ws = getWS(workspaceId);

    const updateFromLog = (log: ExecutionLog) => {
      setExecutionLog(log);
      setExecStatus(log.status);
    };

    const offLog = ws.on('execution:log', (data) => {
      const event = data as { workflowId?: string; log?: ExecutionLog };
      if (event.workflowId !== workflowId || !event.log) return;
      updateFromLog(event.log);
    });
    const offCompleted = ws.on('workflow:completed', (data) => {
      const event = data as { workflowId?: string; log?: ExecutionLog };
      if (event.workflowId !== workflowId) return;
      if (event.log) updateFromLog(event.log);
      else setExecStatus('completed');
    });
    const offFailed = ws.on('workflow:error', (data) => {
      const event = data as { workflowId?: string; log?: ExecutionLog };
      if (event.workflowId !== workflowId) return;
      if (event.log) updateFromLog(event.log);
      else setExecStatus('error');
    });
    const offPaused = ws.on('workflow:paused', (data) => {
      const event = data as { workflowId?: string };
      if (event.workflowId === workflowId) setExecStatus('paused');
    });
    const offResumed = ws.on('workflow:resumed', (data) => {
      const event = data as { workflowId?: string };
      if (event.workflowId === workflowId) setExecStatus('running');
    });

    return () => {
      offLog();
      offCompleted();
      offFailed();
      offPaused();
      offResumed();
    };
  }, [workspaceId, workflowId]);

  if (!workflow) {
    return (
      <div className={`flex h-full w-full items-center justify-center ${className ?? ''}`}>
        <Skeleton className="h-full w-full" />
      </div>
    );
  }

  return (
    <div className={`h-full w-full ${className ?? ''}`}>
      <ReactFlowProvider>
        <WorkflowCanvas
          workflow={workflow}
          isPreview
          isRunning
          execStatus={execStatus}
          executionLog={executionLog}
          onNodeAdd={noop}
          onNodeDelete={noop}
          onNodeSelect={noop}
          onNodeDataUpdate={noop}
          onEdgeDataUpdate={noop}
          onNodesChange={noop}
          onEdgesChange={noop}
          onConnect={noop}
        />
      </ReactFlowProvider>
    </div>
  );
}
