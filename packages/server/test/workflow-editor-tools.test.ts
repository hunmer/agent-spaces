import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NodeTypeDefinition, Workflow } from '@agent-spaces/shared';
import { createWorkflowEditorFunctionTools } from '../src/services/builtin-tools/workflow-editor-tools.js';
import * as workflowService from '../src/services/workflow.js';

const nodeDefinitions: NodeTypeDefinition[] = [
  {
    type: 'loop',
    label: '循环',
    category: '流程控制',
    icon: 'RotateCw',
    description: '循环执行',
    properties: [],
    handles: {
      target: true,
      source: true,
      sourceHandles: [
        { id: 'loop-body', label: '循环体' },
        { id: 'loop-next', label: '继续' },
      ],
    },
    compound: {
      rootRole: 'loop',
      children: [
        { role: 'loop', type: 'loop' },
        {
          role: 'loop_body',
          type: 'loop_body',
          label: '循环体',
          offset: { x: 260, y: 0 },
          scopeBoundary: true,
          parentRole: 'loop',
          data: { width: 150, height: 260 },
        },
      ],
      edges: [
        {
          sourceRole: 'loop',
          targetRole: 'loop_body',
          sourceHandle: 'loop-body',
          targetHandle: 'target',
          locked: true,
        },
      ],
    },
  },
  {
    type: 'loop_body',
    label: '循环体',
    category: '流程控制',
    icon: 'Container',
    description: '循环体容器',
    properties: [],
  },
  {
    type: 'toast',
    label: 'Toast',
    category: '流程控制',
    icon: 'Bell',
    description: '显示消息',
    properties: [],
  },
  {
    type: 'run_code',
    label: '运行 JS 代码',
    category: '流程控制',
    icon: 'Terminal',
    description: '执行自定义 JavaScript 代码',
    properties: [],
  },
  {
    type: 'cos_upload_file',
    label: 'COS上传文件',
    category: '腾讯云COS',
    icon: 'Upload',
    description: '将本地文件上传到 COS',
    properties: [],
  },
  {
    type: 'asr_file_recognition',
    label: '录音文件转写',
    category: '语音识别',
    icon: 'FileAudio',
    description: '提交音频/视频文件URL进行异步语音识别',
    properties: [],
  },
];

const workflow: Workflow = {
  id: 'workflow-1',
  name: 'test workflow',
  folderId: null,
  nodes: [],
  edges: [],
  createdAt: 1,
  updatedAt: 1,
};

test('search_node_usage filters by node_type without swapping results', async () => {
  const tools = createWorkflowEditorFunctionTools({ workflow, nodeDefinitions });
  const searchNodeUsage = tools.find((tool) => tool.name === 'search_node_usage');
  assert.ok(searchNodeUsage);

  for (const nodeType of ['cos_upload_file', 'run_code', 'asr_file_recognition']) {
    const result = await searchNodeUsage.execute({ node_type: nodeType }) as {
      success: boolean;
      total: number;
      nodes: Array<{ type: string }>;
    };
    assert.equal(result.success, true);
    assert.equal(result.total, 1);
    assert.deepEqual(result.nodes.map((node) => node.type), [nodeType]);
  }
});

test('create_workflow_version persists the snapshot for the version panel', async (t) => {
  const previousDataDir = process.env.AGENT_SPACES_DATA_DIR;
  const dataDir = mkdtempSync(join(tmpdir(), 'agent-spaces-workflow-editor-tools-'));
  process.env.AGENT_SPACES_DATA_DIR = dataDir;
  t.after(() => {
    if (previousDataDir === undefined) delete process.env.AGENT_SPACES_DATA_DIR;
    else process.env.AGENT_SPACES_DATA_DIR = previousDataDir;
    rmSync(dataDir, { recursive: true, force: true });
  });

  const savedWorkflow = workflowService.createWorkflow({
    name: 'test workflow',
    nodes: [{
      id: 'node-1',
      type: 'run_code',
      label: 'Run code',
      position: { x: 0, y: 0 },
      data: { code: 'return {};' },
    }],
    edges: [],
  });
  const tools = createWorkflowEditorFunctionTools({ workflow: savedWorkflow, nodeDefinitions });
  const createVersion = tools.find((tool) => tool.name === 'create_workflow_version');
  assert.ok(createVersion);

  const result = await createVersion.execute({ name: '初始版本' }) as {
    success: boolean;
    version_id: string;
    name: string;
  };

  assert.equal(result.success, true);
  assert.equal(result.name, '初始版本');
  const versions = workflowService.listVersions(savedWorkflow.id);
  assert.equal(versions.length, 1);
  assert.equal(versions[0].id, result.version_id);
  assert.equal(versions[0].name, '初始版本');
  assert.deepEqual(versions[0].snapshot.nodes, savedWorkflow.nodes);
});

test('saveworkflow persists the current draft and returns backend validation text', async (t) => {
  const previousDataDir = process.env.AGENT_SPACES_DATA_DIR;
  const dataDir = mkdtempSync(join(tmpdir(), 'agent-spaces-workflow-editor-tools-'));
  process.env.AGENT_SPACES_DATA_DIR = dataDir;
  t.after(() => {
    if (previousDataDir === undefined) delete process.env.AGENT_SPACES_DATA_DIR;
    else process.env.AGENT_SPACES_DATA_DIR = previousDataDir;
    rmSync(dataDir, { recursive: true, force: true });
  });

  const savedWorkflow = workflowService.createWorkflow({
    name: 'test workflow',
    nodes: [{
      id: 'node-1',
      type: 'run_code',
      label: 'Run code',
      position: { x: 0, y: 0 },
      data: { code: 'return {};' },
    }],
    edges: [],
  });
  const tools = createWorkflowEditorFunctionTools({ workflow: savedWorkflow, nodeDefinitions });
  const createNode = tools.find((tool) => tool.name === 'create_node');
  const saveWorkflow = tools.find((tool) => tool.name === 'saveworkflow');
  assert.ok(createNode);
  assert.ok(saveWorkflow);

  const createResult = await createNode.execute({ type: 'toast', label: 'Saved toast' }) as {
    success: boolean;
    created_node_id: string;
  };
  assert.equal(createResult.success, true);

  const saveResult = await saveWorkflow.execute({}) as {
    success: boolean;
    message: string;
    backend_message: string;
    workflow_patch: { nodes: Workflow['nodes'] };
  };

  assert.equal(saveResult.success, true);
  assert.equal(saveResult.message, '工作流已保存，后端校验通过。');
  assert.equal(saveResult.backend_message, '工作流已保存，后端校验通过。');
  assert.equal(saveResult.workflow_patch.nodes.some((node) => node.id === createResult.created_node_id), true);
  assert.equal(workflowService.getWorkflow(savedWorkflow.id)?.nodes.some((node) => node.id === createResult.created_node_id), true);
});

test('saveworkflow returns backend validation errors without persisting invalid drafts', async (t) => {
  const previousDataDir = process.env.AGENT_SPACES_DATA_DIR;
  const dataDir = mkdtempSync(join(tmpdir(), 'agent-spaces-workflow-editor-tools-'));
  process.env.AGENT_SPACES_DATA_DIR = dataDir;
  t.after(() => {
    if (previousDataDir === undefined) delete process.env.AGENT_SPACES_DATA_DIR;
    else process.env.AGENT_SPACES_DATA_DIR = previousDataDir;
    rmSync(dataDir, { recursive: true, force: true });
  });

  const savedWorkflow = workflowService.createWorkflow({
    name: 'test workflow',
    nodes: [{
      id: 'node-1',
      type: 'run_code',
      label: 'Run code',
      position: { x: 0, y: 0 },
      data: { code: 'return {};' },
    }],
    edges: [],
  });
  const tools = createWorkflowEditorFunctionTools({ workflow: savedWorkflow, nodeDefinitions });
  const createEdge = tools.find((tool) => tool.name === 'create_edge');
  const saveWorkflow = tools.find((tool) => tool.name === 'saveworkflow');
  assert.ok(createEdge);
  assert.ok(saveWorkflow);

  const edgeResult = await createEdge.execute({
    source: 'node-1',
    target: 'node-1',
  }) as { success: boolean };
  assert.equal(edgeResult.success, true);

  const saveResult = await saveWorkflow.execute({}) as {
    success: boolean;
    message: string;
    backend_message: string;
  };

  assert.equal(saveResult.success, false);
  assert.equal(saveResult.message, 'Self-loops are not allowed');
  assert.equal(saveResult.backend_message, 'Self-loops are not allowed');
  assert.equal(workflowService.getWorkflow(savedWorkflow.id)?.edges.length, 0);
});

test('create_node can infer loop_body scope from loop-body source handle', async () => {
  const tools = createWorkflowEditorFunctionTools({ workflow, nodeDefinitions });
  const createNode = tools.find((tool) => tool.name === 'create_node');
  assert.ok(createNode);

  const loopResult = await createNode.execute({ type: 'loop', label: '循环5次' }) as {
    success: boolean;
    created_node_id: string;
    workflow: Workflow;
  };
  assert.equal(loopResult.success, true);
  const loopBodyNode = loopResult.workflow.nodes.find((node) => node.type === 'loop_body');
  assert.ok(loopBodyNode);

  const toastResult = await createNode.execute({
    type: 'toast',
    label: '显示循环索引',
    source: loopResult.created_node_id,
    sourceHandle: 'loop-body',
  }) as {
    success: boolean;
    created_node_id: string;
    workflow: Workflow;
  };

  assert.equal(toastResult.success, true);
  const toastNode = toastResult.workflow.nodes.find((node) => node.id === toastResult.created_node_id);
  assert.ok(toastNode);
  assert.equal(toastNode.composite?.parentId, loopBodyNode.id);
  assert.equal(toastNode.composite?.rootId, loopBodyNode.composite?.rootId);
});

test('create_edge replaces conflicting default edge inside loop_body scope', async () => {
  const tools = createWorkflowEditorFunctionTools({ workflow, nodeDefinitions });
  const createNode = tools.find((tool) => tool.name === 'create_node');
  const createEdge = tools.find((tool) => tool.name === 'create_edge');
  assert.ok(createNode);
  assert.ok(createEdge);

  const loopResult = await createNode.execute({ type: 'loop', label: '循环5次' }) as {
    success: boolean;
    workflow: Workflow;
  };
  assert.equal(loopResult.success, true);
  const loopBodyNode = loopResult.workflow.nodes.find((node) => node.type === 'loop_body');
  const loopStartNode = loopResult.workflow.nodes.find((node) => node.type === 'start' && node.composite?.parentId === loopBodyNode?.id);
  const loopEndNode = loopResult.workflow.nodes.find((node) => node.type === 'end' && node.composite?.parentId === loopBodyNode?.id);
  assert.ok(loopBodyNode);
  assert.ok(loopStartNode);
  assert.ok(loopEndNode);
  const defaultEdge = loopResult.workflow.edges.find((edge) => edge.source === loopStartNode.id && edge.target === loopEndNode.id);
  assert.ok(defaultEdge);

  const toastResult = await createNode.execute({
    type: 'toast',
    scope_node_id: loopBodyNode.id,
  }) as {
    success: boolean;
    created_node_id: string;
  };
  assert.equal(toastResult.success, true);

  const edgeResult = await createEdge.execute({
    source: loopStartNode.id,
    target: toastResult.created_node_id,
  }) as {
    success: boolean;
    removed_edge_ids?: string[];
    workflow: Workflow;
  };

  assert.equal(edgeResult.success, true);
  assert.deepEqual(edgeResult.removed_edge_ids, [defaultEdge.id]);
  assert.equal(edgeResult.workflow.edges.some((edge) => edge.id === defaultEdge.id), false);
  assert.equal(edgeResult.workflow.edges.some((edge) => edge.source === loopStartNode.id && edge.target === toastResult.created_node_id), true);
});

test('insert_node reuses an unconnected matching node in the same scope', async () => {
  const tools = createWorkflowEditorFunctionTools({ workflow, nodeDefinitions });
  const createNode = tools.find((tool) => tool.name === 'create_node');
  const insertNode = tools.find((tool) => tool.name === 'insert_node');
  assert.ok(createNode);
  assert.ok(insertNode);

  const loopResult = await createNode.execute({ type: 'loop', label: '循环5次' }) as {
    success: boolean;
    workflow: Workflow;
  };
  assert.equal(loopResult.success, true);
  const loopBodyNode = loopResult.workflow.nodes.find((node) => node.type === 'loop_body');
  const loopStartNode = loopResult.workflow.nodes.find((node) => node.type === 'start' && node.composite?.parentId === loopBodyNode?.id);
  const loopEndNode = loopResult.workflow.nodes.find((node) => node.type === 'end' && node.composite?.parentId === loopBodyNode?.id);
  assert.ok(loopBodyNode);
  assert.ok(loopStartNode);
  assert.ok(loopEndNode);
  const defaultEdge = loopResult.workflow.edges.find((edge) => edge.source === loopStartNode.id && edge.target === loopEndNode.id);
  assert.ok(defaultEdge);

  const toastResult = await createNode.execute({
    type: 'toast',
    label: '输出循环索引',
    data: { type: 'info', message: '当前循环索引: {{ context.loop.index }}' },
    scopeNodeId: loopBodyNode.id,
  }) as {
    success: boolean;
    created_node_id: string;
    workflow: Workflow;
  };
  assert.equal(toastResult.success, true);

  const insertResult = await insertNode.execute({
    edgeId: defaultEdge.id,
    type: 'toast',
    label: '输出循环索引',
    data: { type: 'info', message: '当前循环索引: {{ context.loop.index }}' },
  }) as {
    success: boolean;
    inserted_node_id?: string;
    reused_node?: boolean;
    workflow: Workflow;
  };

  assert.equal(insertResult.success, true);
  assert.equal(insertResult.inserted_node_id, toastResult.created_node_id);
  assert.equal(insertResult.reused_node, true);
  assert.equal(insertResult.workflow.nodes.filter((node) => node.type === 'toast').length, 1);
  assert.equal(insertResult.workflow.edges.some((edge) => edge.source === loopStartNode.id && edge.target === toastResult.created_node_id), true);
  assert.equal(insertResult.workflow.edges.some((edge) => edge.source === toastResult.created_node_id && edge.target === loopEndNode.id), true);
});
