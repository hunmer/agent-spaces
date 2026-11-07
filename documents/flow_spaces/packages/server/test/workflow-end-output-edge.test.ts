import test from 'node:test';
import assert from 'node:assert/strict';
import type { WorkflowNode, WorkflowEdge } from '@agent-spaces/shared';
import { ExecutionManager } from '../src/services/execution-manager.js';
import type { ExecutionSession } from '../src/services/execution-types.js';

test('end node maps runtime output field edges into its outputs', async () => {
  const manager = new ExecutionManager({
    emit: () => {},
    interactionManager: {} as never,
    clientNodeManager: {} as never,
  });

  const imageNode: WorkflowNode = {
    id: 'image',
    type: 'ai_image_generate',
    label: 'Image',
    position: { x: 0, y: 0 },
    data: {},
  };

  const endNode: WorkflowNode = {
    id: 'end',
    type: 'end',
    label: 'End',
    position: { x: 0, y: 0 },
    data: {
      outputs: [
        { key: 'images', type: 'image[]', value: '' },
      ],
    },
  };

  const edges: WorkflowEdge[] = [
    {
      id: 'image-end-runtime',
      source: 'image',
      target: 'end',
      edgeKind: 'runtime',
      sourceHandle: 'source',
      targetHandle: 'target',
    },
    {
      id: 'image-end-output-images',
      source: 'image',
      target: 'end',
      edgeKind: 'runtime',
      sourceHandle: 'output:data.images',
      targetHandle: 'output:images',
    },
  ];

  const session = {
    id: 'session',
    workflow: {
      id: 'workflow',
      name: 'Workflow',
      folderId: null,
      nodes: [imageNode, endNode],
      edges,
      createdAt: 0,
      updatedAt: 0,
    },
    ownerClientId: 'test',
    nodes: [imageNode, endNode],
    edges,
    context: {
      __data__: {
        image: {
          success: true,
          data: {
            images: ['https://example.com/a.png'],
          },
        },
      },
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
  }).executeNode(session, endNode);

  assert.equal(result, 'completed');
  assert.deepEqual(session.steps[0]?.output, {
    images: ['https://example.com/a.png'],
  });
});
