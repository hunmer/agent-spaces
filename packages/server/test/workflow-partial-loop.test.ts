import test from 'node:test';
import assert from 'node:assert/strict';
import type { Workflow, WorkflowEdge, WorkflowNode } from '@agent-spaces/shared';
import { ExecutionManager } from '../src/services/execution-manager.js';
import type { ExecutionSession } from '../src/services/execution-types.js';

const nodes: WorkflowNode[] = [
  {
    id: 'loop',
    type: 'loop',
    label: 'Loop',
    position: { x: 0, y: 0 },
    data: {
      loopType: 'array',
      concurrency: 1,
      arrayPath: [{ text: 'first' }, { text: 'second' }],
      outputs: [{ key: 'items', type: 'array' }],
    },
  },
  {
    id: 'loop_body',
    type: 'loop_body',
    label: 'Loop Body',
    position: { x: 0, y: 0 },
    data: {},
    composite: { parentId: 'loop', role: 'loop_body', generated: true },
  },
  {
    id: 'loop_start',
    type: 'start',
    label: 'Loop Start',
    position: { x: 0, y: 0 },
    data: {},
    composite: { parentId: 'loop_body', generated: true },
  },
  {
    id: 'loop_end',
    type: 'end',
    label: 'Loop End',
    position: { x: 0, y: 0 },
    data: {
      outputs: [
        { key: 'text', type: 'string', value: '{{ __loop__.item.text }}' },
      ],
    },
    outputs: [
      { key: 'text', type: 'string', value: '{{ __loop__.item.text }}' },
    ],
    composite: { parentId: 'loop_body', generated: true },
  },
  {
    id: 'after_loop',
    type: 'run_code',
    label: 'After Loop',
    position: { x: 0, y: 0 },
    data: {
      code: `async function main({ params }) {
        return { count: Array.isArray(params.items) ? params.items.length : -1 };
      }`,
      inputFields: [
        {
          key: 'items',
          type: 'array',
          value: '{{ __data__["loop"].items }}',
        },
      ],
      outputs: [{ key: 'count', type: 'number' }],
    },
  },
];

const edges: WorkflowEdge[] = [
  { id: 'loop-body-edge', source: 'loop', target: 'loop_body', sourceHandle: 'loop-body', targetHandle: 'target' },
  { id: 'body-start-edge', source: 'loop_body', target: 'loop_start' },
  { id: 'start-end-edge', source: 'loop_start', target: 'loop_end' },
  { id: 'loop-next-edge', source: 'loop', target: 'after_loop', sourceHandle: 'loop-next' },
];

function createSession(): ExecutionSession {
  const workflow: Workflow = {
    id: 'workflow',
    name: 'Workflow',
    folderId: null,
    nodes,
    edges,
    createdAt: 0,
    updatedAt: 0,
  };
  return {
    id: 'session',
    workflow,
    ownerClientId: 'test',
    nodes,
    edges,
    context: { __data__: {}, __env__: {}, __input__: {} },
    status: 'running',
    executionOrder: nodes,
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
    partialStartNodeId: 'loop',
  };
}

test('partial execution from loop node only continues through top-level downstream nodes', async () => {
  const manager = new ExecutionManager({
    emit: () => {},
    interactionManager: {} as never,
    clientNodeManager: {} as never,
  });

  const session = createSession();
  await (manager as any).runPartialFromNode(session, 'loop');

  assert.equal(session.status, 'completed');
  assert.deepEqual(session.context.__data__.loop.items, [
    { text: 'first' },
    { text: 'second' },
  ]);
  assert.equal(session.context.__data__.after_loop.count, 2);

  const rerunLoopChild = session.steps.find(
    step => step.nodeId === 'loop_start' && step.startedAt > (session.steps.find(s => s.nodeId === 'after_loop')?.startedAt ?? Number.MAX_SAFE_INTEGER),
  );
  assert.equal(rerunLoopChild, undefined);
});
