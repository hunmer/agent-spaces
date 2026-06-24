import test from 'node:test';
import assert from 'node:assert/strict';
import type { WorkflowNode } from '@agent-spaces/shared';
import { ExecutionManager } from '../src/services/execution-manager.js';
import type { ExecutionSession } from '../src/services/execution-types.js';

test('plugin node input uses declared dataType to coerce variable values', async () => {
  const manager = new ExecutionManager({
    emit: () => {},
    interactionManager: {} as never,
    clientNodeManager: {} as never,
  });

  const node: WorkflowNode = {
    id: 'video',
    type: 'aliyun_image_to_video_v27',
    label: 'Video',
    position: { x: 200, y: 0 },
    data: {
      apiKey: 'test-key',
      media: [],
      duration: '{{ __data__["start"].duration }}',
    },
  };
  const session = {
    id: 'session',
    workflow: {
      id: 'workflow-plugin-coercion',
      name: 'Workflow Plugin Coercion',
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
      __data__: { start: { duration: '5' } },
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
    dryRun: {
      nodeIds: ['video'],
      outputs: {
        video: { ok: true },
      },
    },
  } satisfies ExecutionSession;

  const result = await (manager as unknown as {
    executeNode(session: ExecutionSession, node: WorkflowNode): Promise<'completed' | 'interrupted'>;
  }).executeNode(session, node);

  assert.equal(result, 'completed');
  assert.equal(session.status, 'running');
  const step = session.steps.find(item => item.nodeId === 'video');
  assert.equal(step?.status, 'completed');
  assert.equal(typeof step?.input?.duration, 'number');
  assert.equal(step?.input?.duration, 5);
});
