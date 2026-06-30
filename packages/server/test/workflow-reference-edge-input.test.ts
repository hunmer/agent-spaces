import test from 'node:test';
import assert from 'node:assert/strict';
import type { WorkflowNode, WorkflowEdge } from '@agent-spaces/shared';
import { ExecutionManager } from '../src/services/execution-manager.js';
import type { ExecutionSession } from '../src/services/execution-types.js';

function createBaseSession(nodes: WorkflowNode[], edges: WorkflowEdge[], data: Record<string, unknown>): ExecutionSession {
  return {
    id: 'session',
    workflow: {
      id: 'workflow',
      name: 'Workflow',
      folderId: null,
      nodes,
      edges,
      createdAt: 0,
      updatedAt: 0,
    },
    ownerClientId: 'test',
    nodes,
    edges,
    context: {
      __data__: data,
      __env__: {},
      __input__: {},
    },
    status: 'running',
    executionOrder: [],
    currentIndex: 0,
    pauseRequested: false,
    stopRequested: false,
    startedAt: Date.now(),
    steps: [],
    activeBranches: new Map(),
    persisted: false,
    lastUpdatedAt: Date.now(),
    eventSequence: 0,
    recentEvents: [],
    loopStack: [],
    breakpointBypassKeys: new Set(),
  } satisfies ExecutionSession;
}

test('reference edge injects source output into target property', async () => {
  const manager = new ExecutionManager({
    emit: () => {},
    interactionManager: {} as never,
    clientNodeManager: {} as never,
  });

  const sourceNode: WorkflowNode = {
    id: 'source',
    type: 'run_code',
    label: 'Source',
    position: { x: 0, y: 0 },
    data: {},
  };
  const targetNode: WorkflowNode = {
    id: 'toast',
    type: 'toast',
    label: 'Toast',
    position: { x: 0, y: 0 },
    data: { type: 'info', message: '' },
  };
  const edges: WorkflowEdge[] = [
    {
      id: 'source-toast-reference',
      source: 'source',
      target: 'toast',
      edgeKind: 'reference',
      sourceHandle: 'output:result',
      targetHandle: 'property:message',
    },
  ];
  const session = createBaseSession([sourceNode, targetNode], edges, {
    source: { result: 'from upstream' },
  });

  const result = await (manager as unknown as {
    executeNode(session: ExecutionSession, node: WorkflowNode): Promise<'completed' | 'interrupted'>;
  }).executeNode(session, targetNode);

  assert.equal(result, 'completed');
  assert.deepEqual(session.steps[0]?.output, { message: 'from upstream', type: 'info' });
});

test('reference edge injects source output into target input field', async () => {
  const manager = new ExecutionManager({
    emit: () => {},
    interactionManager: {} as never,
    clientNodeManager: {} as never,
  });

  const sourceNode: WorkflowNode = {
    id: 'source',
    type: 'run_code',
    label: 'Source',
    position: { x: 0, y: 0 },
    data: {},
  };
  const targetNode: WorkflowNode = {
    id: 'code',
    type: 'run_code',
    label: 'Code',
    position: { x: 0, y: 0 },
    data: {
      code: 'async function main({ params }) { return { echoed: params.agentResult ?? "" }; }',
      inputFields: [
        { key: 'agentResult', type: 'string', value: '' },
      ],
    },
  };
  const edges: WorkflowEdge[] = [
    {
      id: 'source-code-reference',
      source: 'source',
      target: 'code',
      edgeKind: 'reference',
      sourceHandle: 'output:result',
      targetHandle: 'input:agentResult',
    },
  ];
  const session = createBaseSession([sourceNode, targetNode], edges, {
    source: { result: 'from upstream' },
  });

  const result = await (manager as unknown as {
    executeNode(session: ExecutionSession, node: WorkflowNode): Promise<'completed' | 'interrupted'>;
  }).executeNode(session, targetNode);

  assert.equal(result, 'completed');
  assert.deepEqual(session.steps[0]?.output, { echoed: 'from upstream' });
});
