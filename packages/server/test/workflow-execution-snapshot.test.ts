import test from 'node:test';
import assert from 'node:assert/strict';
import {
  __buildSubWorkflowExecutionLogForTest,
  __isWorkflowEdgeActiveForTest,
  __normalizeExecutionSnapshotNodesForTest,
  __normalizeExecutionSnapshotNodesWithConfigForTest,
} from '../src/services/execution-manager.js';

test('sub-workflow execution log uses only nested steps and target snapshot', () => {
  const workflow = {
    id: 'child-workflow',
    name: 'Child',
    folderId: null,
    createdAt: 1,
    updatedAt: 1,
    nodes: [{ id: 'child-start', type: 'start', label: 'Start', position: { x: 0, y: 0 }, data: {} }],
    edges: [],
  };
  const log = __buildSubWorkflowExecutionLogForTest({
    id: 'child-execution',
    workflow,
    startedAt: 10,
    finishedAt: 30,
    status: 'completed',
  }, [
    { nodeId: 'parent-sub', nodeLabel: 'Sub-workflow', startedAt: 5, status: 'running' },
    {
      nodeId: 'child-start', nodeLabel: 'Start', startedAt: 10, finishedAt: 20, status: 'completed',
      subWorkflowExecutionIds: ['child-execution'],
    },
  ]);

  assert.equal(log.id, 'child-execution');
  assert.equal(log.workflowId, 'child-workflow');
  assert.deepEqual(log.steps.map(step => step.nodeId), ['child-start']);
  assert.deepEqual(log.snapshot?.nodes.map(node => node.id), ['child-start']);
  assert.equal(log.status, 'completed');
});

test('execution snapshot nodes expose inputFields and outputs at node top-level', () => {
  const [node] = __normalizeExecutionSnapshotNodesForTest([
    {
      id: 'node_1',
      type: 'asr_file_recognition',
      label: '录音文件转写',
      position: { x: 1800, y: 90 },
      data: {
        apiKey: '{{ __config__["workflow.aliyun-ai"]["apiKey"]}}',
        outputs: [{ key: 'success', type: 'boolean' }],
        inputFields: [],
        fileUrls: '{{ __data__["source"].fileUrls }}',
      },
    },
  ]);

  assert.deepEqual(node.inputFields, []);
  assert.deepEqual(node.outputs, [{ key: 'success', type: 'boolean' }]);
  assert.equal('inputFields' in node.data, false);
  assert.equal('outputs' in node.data, false);
  assert.equal(node.data.fileUrls, '{{ __data__["source"].fileUrls }}');
});

test('execution snapshot node data resolves workflow config templates', () => {
  const [node] = __normalizeExecutionSnapshotNodesWithConfigForTest([
    {
      id: 'node_1',
      type: 'asr_file_recognition',
      label: 'Audio transcription',
      position: { x: 0, y: 0 },
      data: {
        apiKey: '{{ __config__["workflow.aliyun-ai"]["apiKey"] }}',
        baseUrl: '{{ __config__["workflow.aliyun-ai"]["baseUrl"] || "https://dashscope.aliyuncs.com" }}',
      },
    },
  ], {
    'workflow.aliyun-ai': {
      apiKey: 'configured-key',
      baseUrl: '',
    },
  });

  assert.equal(node.data.apiKey, 'configured-key');
  assert.equal(node.data.baseUrl, 'https://dashscope.aliyuncs.com');
});

test('legacy switch edge without sourceHandle is active for matching case branch', () => {
  const edges = [
    { id: 'edge_case_0', source: 'switch_1', target: 'openai_1' },
    { id: 'edge_default', source: 'switch_1', target: 'end_1', sourceHandle: 'default' },
  ];

  assert.equal(__isWorkflowEdgeActiveForTest(edges[0], edges, 'case-0'), true);
  assert.equal(__isWorkflowEdgeActiveForTest(edges[1], edges, 'case-0'), false);
});
