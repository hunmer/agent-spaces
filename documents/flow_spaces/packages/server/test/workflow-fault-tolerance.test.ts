import test from 'node:test';
import assert from 'node:assert/strict';
import type { WorkflowNode } from '@agent-spaces/shared';
import { ExecutionManager } from '../src/services/execution-manager.js';
import type { ExecutionSession } from '../src/services/execution-types.js';

test('faultTolerance=ignore swallows missing variable field errors during node input resolution', async () => {
  const manager = new ExecutionManager({
    emit: () => {},
    interactionManager: {} as never,
    clientNodeManager: {} as never,
  });

  const node: WorkflowNode = {
    id: 'fail',
    type: 'run_code',
    label: 'Fail',
    position: { x: 0, y: 0 },
    data: {
      inputFields: [
        { key: 'text', type: 'string', value: '{{ __data__["missing"].text }}' },
      ],
      code: 'async function main() { return { ok: true }; }',
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
      __data__: {},
      __env__: {},
      __input__: {},
      __config__: {},
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
    faultTolerance: 'ignore',
  } satisfies ExecutionSession;

  const result = await (manager as unknown as {
    executeNode(session: ExecutionSession, node: WorkflowNode): Promise<'completed' | 'interrupted'>;
  }).executeNode(session, node);

  assert.equal(result, 'completed');
  assert.equal(session.status, 'running');
  assert.equal(session.steps[0]?.status, 'error');
  assert.match(session.steps[0]?.error || '', /missing node output|missing field/i);
});
