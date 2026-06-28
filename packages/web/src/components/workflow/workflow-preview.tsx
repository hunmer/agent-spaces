'use client';

import { useEffect, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import type { Workflow } from '@agent-spaces/shared';
import { workflowApi } from '@/lib/workflow-api';
import { Skeleton } from '@/components/ui/skeleton';
import { WorkflowCanvas } from './workflow-canvas';

const noop = () => {};

/**
 * 只读 workflow 节点预览。
 * 仅用于展示节点与连线，禁用一切编辑/执行/拖拽交互。
 */
export function WorkflowPreview({ workflowId, className }: { workflowId: string; className?: string }) {
  const [workflow, setWorkflow] = useState<Workflow | null>(null);

  useEffect(() => {
    let active = true;
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
          // isRunning 触发 isCanvasLocked：禁用拖拽 / 连线 / 删除 / 工具栏编辑
          isRunning
          // 其余必填回调全部 no-op，保证只读不产生副作用
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
