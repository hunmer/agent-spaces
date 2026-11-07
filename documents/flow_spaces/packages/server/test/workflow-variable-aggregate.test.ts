import test from 'node:test';
import assert from 'node:assert/strict';
import type { WorkflowNode } from '@agent-spaces/shared';
import { ExecutionManager } from '../src/services/execution-manager.js';
import type { ExecutionSession } from '../src/services/execution-types.js';

test('variable aggregate ignores missing outputs from unselected switch branches', async () => {
  const manager = new ExecutionManager({
    emit: () => {},
    interactionManager: {} as never,
    clientNodeManager: {} as never,
  });
  const node: WorkflowNode = {
    id: 'aggregate',
    type: 'variable_aggregate',
    label: 'Aggregate',
    position: { x: 0, y: 0 },
    data: {
      groups: [
        {
          key: 'images',
          variables: [
            { key: '', type: 'any', value: '{{ __data__["keling"].data.images }}' },
            { key: '', type: 'any', value: '{{ __data__["qwen"].data.images }}' },
          ],
        },
      ],
      outputs: [
        {
          key: 'result',
          type: 'object',
          children: [{ key: 'images', type: 'string[]' }],
        },
      ],
    },
  };
  const session = {
    id: 'session',
    workflow: {
      id: 'workflow',
      name: 'Workflow',
      folderId: null,
      nodes: [node],
      edges: [],
      createdAt: 0,
      updatedAt: 0,
    },
    ownerClientId: 'test',
    nodes: [node],
    edges: [],
    context: {
      __data__: { qwen: { data: { images: ['qwen-image'] } } },
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

  const result = await (manager as unknown as {
    executeNode(session: ExecutionSession, node: WorkflowNode): Promise<'completed' | 'interrupted'>;
  }).executeNode(session, node);

  assert.equal(result, 'completed');
  assert.equal(session.status, 'running');
  assert.deepEqual(session.steps[0]?.output, { result: { images: ['qwen-image'] } });
});
