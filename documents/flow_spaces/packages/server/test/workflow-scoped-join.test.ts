import test from 'node:test';
import assert from 'node:assert/strict';
import type { WorkflowEdge, WorkflowNode } from '@agent-spaces/shared';
import { ExecutionManager } from '../src/services/execution-manager.js';
import type { ExecutionSession } from '../src/services/execution-types.js';

const nodes: WorkflowNode[] = [
  {
    id: 'body',
    type: 'loop_body',
    label: 'Body',
    position: { x: 0, y: 0 },
    data: {},
  },
  {
    id: 'start',
    type: 'start',
    label: 'Start',
    position: { x: 0, y: 0 },
    data: {},
    composite: { parentId: 'body' },
  },
  {
    id: 'slow_image',
    type: 'run_code',
    label: 'Slow image',
    position: { x: 0, y: 0 },
    data: {
      code: `async function main() {
        await new Promise(resolve => setTimeout(resolve, 30));
        return { data: { images: ['image-url'] } };
      }`,
    },
    composite: { parentId: 'body' },
  },
  {
    id: 'fast_audio',
    type: 'run_code',
    label: 'Fast audio',
    position: { x: 0, y: 0 },
    data: {
      code: `async function main() {
        return { data: { fileUrl: 'audio-url' } };
      }`,
    },
    composite: { parentId: 'body' },
  },
  {
    id: 'end',
    type: 'end',
    label: 'End',
    position: { x: 0, y: 0 },
    data: {
      outputs: [
        {
          key: 'image',
          type: 'string[]',
          value: '{{ __data__["slow_image"].data.images }}',
        },
        {
          key: 'audio',
          type: 'string',
          value: '{{ __data__["fast_audio"].data.fileUrl }}',
        },
      ],
    },
    outputs: [
      {
        key: 'image',
        type: 'string[]',
        value: '{{ __data__["slow_image"].data.images }}',
      },
      {
        key: 'audio',
        type: 'string',
        value: '{{ __data__["fast_audio"].data.fileUrl }}',
      },
    ],
    composite: { parentId: 'body' },
  },
];

const edges: WorkflowEdge[] = [
  { id: 'body-start', source: 'body', target: 'start' },
  { id: 'start-slow', source: 'start', target: 'slow_image' },
  { id: 'start-fast', source: 'start', target: 'fast_audio' },
  { id: 'slow-end', source: 'slow_image', target: 'end' },
  { id: 'fast-end', source: 'fast_audio', target: 'end' },
];

test('scoped body join waits for every incoming branch before executing end node', async () => {
  const manager = new ExecutionManager({
    emit: () => {},
    interactionManager: {} as never,
    clientNodeManager: {} as never,
  });

  const session = {
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
    context: { __data__: {}, __env__: {}, __input__: {} },
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

  const result = await manager.__executeScopedBodyForTest(session, nodes[0], nodes.slice(1));

  assert.deepEqual(result, {
    image: ['image-url'],
    audio: 'audio-url',
  });
  const endStep = session.steps.find(step => step.nodeId === 'end');
  const slowStep = session.steps.find(step => step.nodeId === 'slow_image');
  const fastStep = session.steps.find(step => step.nodeId === 'fast_audio');
  assert.ok(endStep?.startedAt);
  assert.ok(slowStep?.finishedAt);
  assert.ok(fastStep?.finishedAt);
  assert.equal(endStep.startedAt >= slowStep.finishedAt, true);
  assert.equal(endStep.startedAt >= fastStep.finishedAt, true);
});

test('scoped body reports missing data references instead of resolving them to empty text', async () => {
  const manager = new ExecutionManager({
    emit: () => {},
    interactionManager: {} as never,
    clientNodeManager: {} as never,
  });
  const dependencyEdges = edges.filter(edge => edge.id !== 'start-slow' && edge.id !== 'slow-end');
  const session = {
    id: 'session',
    workflow: {
      id: 'workflow',
      name: 'Workflow',
      folderId: null,
      nodes,
      edges: dependencyEdges,
      createdAt: 0,
      updatedAt: 0,
    },
    ownerClientId: 'test',
    nodes,
    edges: dependencyEdges,
    context: { __data__: {}, __env__: {}, __input__: {} },
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

  await assert.rejects(
    () => manager.__executeScopedBodyForTest(session, nodes[0], nodes.slice(1)),
    /missing node output: __data__\["slow_image"\]/,
  );
});

test('scoped body does not reuse dependency completion from a previous run', async () => {
  const iterationNodes: WorkflowNode[] = [
    { id: 'body', type: 'loop_body', label: 'Body', position: { x: 0, y: 0 }, data: {} },
    { id: 'start', type: 'start', label: 'Start', position: { x: 0, y: 0 }, data: {}, composite: { parentId: 'body' } },
    { id: 'producer', type: 'run_code', label: 'Producer', position: { x: 0, y: 0 }, data: { code: 'async function main() { return { value: "ok" }; }' }, composite: { parentId: 'body' } },
    { id: 'aggregate', type: 'run_code', label: 'Aggregate', position: { x: 0, y: 0 }, data: { code: 'async function main() { return { url: "done" }; }' }, composite: { parentId: 'body' } },
    {
      id: 'end', type: 'end', label: 'End', position: { x: 0, y: 0 },
      data: { outputs: [{ key: 'url', type: 'string', value: '{{ __data__["aggregate"].url }}' }] },
      outputs: [{ key: 'url', type: 'string', value: '{{ __data__["aggregate"].url }}' }],
      composite: { parentId: 'body' },
    },
  ];
  const iterationEdges: WorkflowEdge[] = [
    { id: 'body-start', source: 'body', target: 'start' },
    { id: 'start-producer', source: 'start', target: 'producer' },
    { id: 'producer-end', source: 'producer', target: 'end' },
    { id: 'producer-aggregate', source: 'producer', target: 'aggregate' },
    { id: 'aggregate-end', source: 'aggregate', target: 'end' },
  ];
  const manager = new ExecutionManager({
    emit: () => {}, interactionManager: {} as never, clientNodeManager: {} as never,
  });
  const session = {
    id: 'session',
    workflow: { id: 'workflow', name: 'Workflow', folderId: null, nodes: iterationNodes, edges: iterationEdges, createdAt: 0, updatedAt: 0 },
    ownerClientId: 'test', nodes: iterationNodes, edges: iterationEdges,
    context: { __data__: {}, __env__: {}, __inputs__: {} },
    status: 'running', executionOrder: [], currentIndex: 0, pauseRequested: false, stopRequested: false,
    startedAt: Date.now(), steps: [], activeBranches: new Map(), persisted: false,
    lastUpdatedAt: Date.now(), eventSequence: 0, recentEvents: [], loopStack: [], breakpointBypassKeys: new Set(),
  } satisfies ExecutionSession;

  assert.deepEqual(await manager.__executeScopedBodyForTest(session, iterationNodes[0], iterationNodes.slice(1)), { url: 'done' });
  session.context.__data__ = {};
  assert.deepEqual(await manager.__executeScopedBodyForTest(session, iterationNodes[0], iterationNodes.slice(1)), { url: 'done' });
  assert.equal(session.status, 'running');
});
