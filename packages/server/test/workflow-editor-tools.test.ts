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
    type: 'agent_run',
    label: '运行 Agent',
    category: 'AI',
    icon: 'Bot',
    description: '运行指定 Agent',
    properties: [
      { key: 'agent', label: 'Agent', type: 'agent' },
      { key: 'prompt', label: '提示词', type: 'textarea', required: true },
    ],
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

nodeDefinitions.push({
  type: 'switch',
  label: 'Switch',
  category: 'flow',
  icon: 'GitBranch',
  description: 'conditional branch router',
  properties: [
    { key: 'conditions', label: 'Conditions', type: 'conditions' },
  ],
  handles: { target: true, dynamicSource: { dataKey: 'conditions', extraCount: 1 } },
});

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

test('node type search can filter by plugin id', async () => {
  const pluginNodeDefinitions = nodeDefinitions.map((definition) => {
    if (definition.type === 'cos_upload_file') return { ...definition, pluginId: 'workflow.tencent-cos' };
    if (definition.type === 'asr_file_recognition') return { ...definition, pluginId: 'workflow.aliyun-ai' };
    return definition;
  });
  const tools = createWorkflowEditorFunctionTools({ workflow, nodeDefinitions: pluginNodeDefinitions });
  const listNodeTypes = tools.find((tool) => tool.name === 'list_node_types');
  const searchNodeUsage = tools.find((tool) => tool.name === 'search_node_usage');
  assert.ok(listNodeTypes);
  assert.ok(searchNodeUsage);

  const listResult = await listNodeTypes.execute({ pluginId: 'workflow.tencent-cos', pageSize: 50 }) as {
    success: boolean;
    nodes: Array<{ type: string; pluginId?: string }>;
  };

  assert.equal(listResult.success, true);
  assert.deepEqual(listResult.nodes.map((node) => node.type), ['cos_upload_file']);
  assert.equal(listResult.nodes[0]?.pluginId, 'workflow.tencent-cos');

  const usageResult = await searchNodeUsage.execute({ plugin_id: 'workflow.aliyun-ai' }) as {
    success: boolean;
    nodes: Array<{ type: string; pluginId?: string }>;
  };

  assert.equal(usageResult.success, true);
  assert.deepEqual(usageResult.nodes.map((node) => node.type), ['asr_file_recognition']);
  assert.equal(usageResult.nodes[0]?.pluginId, 'workflow.aliyun-ai');
});

test('search_node_usage explains run_code input fields are exposed as params', async () => {
  const tools = createWorkflowEditorFunctionTools({ workflow, nodeDefinitions });
  const searchNodeUsage = tools.find((tool) => tool.name === 'search_node_usage');
  assert.ok(searchNodeUsage);

  const result = await searchNodeUsage.execute({ node_type: 'run_code' }) as {
    success: boolean;
    nodes: Array<{ usage?: { runCode?: string } }>;
  };

  assert.equal(result.success, true);
  assert.match(result.nodes[0]?.usage?.runCode ?? '', /data\.inputFields/);
  assert.match(result.nodes[0]?.usage?.runCode ?? '', /params\.agentResult/);
  assert.match(result.nodes[0]?.usage?.runCode ?? '', /不要.*__data__/);
});

test('get_node_property_type_definition returns agent value shape', async () => {
  const tools = createWorkflowEditorFunctionTools({ workflow, nodeDefinitions });
  const getTypeDefinition = tools.find((tool) => tool.name === 'get_node_property_type_definition');
  assert.ok(getTypeDefinition);

  const result = await getTypeDefinition.execute({ type: 'agent' }) as {
    success: boolean;
    definition: {
      valueType: string;
      fields: Record<string, string>;
      required: string[];
    };
  };

  assert.equal(result.success, true);
  assert.equal(result.definition.valueType, 'object');
  assert.equal(result.definition.fields.id, 'string');
  assert.deepEqual(result.definition.required, ['id', 'name', 'role', 'enabled']);
});

test('get_node_property_type_definition returns conditions value shape', async () => {
  const tools = createWorkflowEditorFunctionTools({ workflow, nodeDefinitions });
  const getTypeDefinition = tools.find((tool) => tool.name === 'get_node_property_type_definition');
  assert.ok(getTypeDefinition);

  const result = await getTypeDefinition.execute({ property_type: 'conditions' }) as {
    success: boolean;
    definition: {
      valueType: string;
      item: Record<string, string>;
      handles: { caseHandlePattern: string; defaultHandle: string };
    };
  };

  assert.equal(result.success, true);
  assert.equal(result.definition.valueType, 'array');
  assert.equal(result.definition.item.variable, 'string');
  assert.equal(result.definition.handles.caseHandlePattern, 'case-{index}');
  assert.equal(result.definition.handles.defaultHandle, 'default');
});

test('get_current_workflow returns workflow data and patch', async () => {
  const currentWorkflow: Workflow = {
    ...workflow,
    nodes: [{
      id: 'node-1',
      type: 'run_code',
      label: 'Run code',
      position: { x: 0, y: 0 },
      data: { code: 'return {};' },
    }],
  };
  const tools = createWorkflowEditorFunctionTools({ workflow: currentWorkflow, nodeDefinitions });
  const getCurrentWorkflow = tools.find((tool) => tool.name === 'get_current_workflow');
  assert.ok(getCurrentWorkflow);

  const result = await getCurrentWorkflow.execute({ summarize: false }) as {
    success: boolean;
    data: Workflow;
    workflow: Workflow;
    workflow_patch: { workflow_id: string; nodes: Workflow['nodes']; edges: Workflow['edges'] };
  };

  assert.equal(result.success, true);
  assert.equal(result.data.id, currentWorkflow.id);
  assert.deepEqual(result.workflow.nodes, currentWorkflow.nodes);
  assert.equal(result.workflow_patch.workflow_id, currentWorkflow.id);
  assert.deepEqual(result.workflow_patch.nodes, currentWorkflow.nodes);
});

test('search_nodes falls back to node definitions when current workflow has no matching node', async () => {
  const tools = createWorkflowEditorFunctionTools({ workflow, nodeDefinitions });
  const searchNodes = tools.find((tool) => tool.name === 'search_nodes');
  assert.ok(searchNodes);

  const result = await searchNodes.execute({ keyword: 'switch' }) as {
    success: boolean;
    nodes: Array<{ type: string; definition?: { type: string } }>;
  };

  assert.equal(result.success, true);
  assert.deepEqual(result.nodes.map((node) => node.type), ['switch']);
  assert.equal(result.nodes[0]?.definition?.type, 'switch');
});

test('update_node rejects agent property when value does not match type definition', async () => {
  const tools = createWorkflowEditorFunctionTools({ workflow, nodeDefinitions });
  const createNode = tools.find((tool) => tool.name === 'create_node');
  const updateNode = tools.find((tool) => tool.name === 'update_node');
  assert.ok(createNode);
  assert.ok(updateNode);

  const createResult = await createNode.execute({ type: 'agent_run' }) as {
    success: boolean;
    created_node_id: string;
  };
  assert.equal(createResult.success, true);

  const updateResult = await updateNode.execute({
    nodeId: createResult.created_node_id,
    data: { agent: 'agent-id' },
  }) as {
    success: boolean;
    message: string;
    property: string;
    expected_type: string;
    type_definition: { valueType: string };
  };

  assert.equal(updateResult.success, false);
  assert.equal(updateResult.property, 'agent');
  assert.equal(updateResult.expected_type, 'agent');
  assert.equal(updateResult.type_definition.valueType, 'object');
  assert.match(updateResult.message, /expected agent/);
});

test('update_node rejects empty data updates', async () => {
  const tools = createWorkflowEditorFunctionTools({ workflow, nodeDefinitions });
  const createNode = tools.find((tool) => tool.name === 'create_node');
  const updateNode = tools.find((tool) => tool.name === 'update_node');
  assert.ok(createNode);
  assert.ok(updateNode);

  const createResult = await createNode.execute({ type: 'run_code' }) as {
    success: boolean;
    created_node_id: string;
  };
  assert.equal(createResult.success, true);

  const updateResult = await updateNode.execute({
    nodeId: createResult.created_node_id,
    data: {},
  }) as {
    success: boolean;
    message: string;
  };

  assert.equal(updateResult.success, false);
  assert.match(updateResult.message, /non-empty data object or label/);
});

test('update_node allows label-only updates', async () => {
  const tools = createWorkflowEditorFunctionTools({ workflow, nodeDefinitions });
  const createNode = tools.find((tool) => tool.name === 'create_node');
  const updateNode = tools.find((tool) => tool.name === 'update_node');
  assert.ok(createNode);
  assert.ok(updateNode);

  const createResult = await createNode.execute({ type: 'run_code' }) as {
    success: boolean;
    created_node_id: string;
  };
  assert.equal(createResult.success, true);

  const updateResult = await updateNode.execute({
    nodeId: createResult.created_node_id,
    label: 'Parse file type',
  }) as {
    success: boolean;
    workflow: Workflow;
  };

  assert.equal(updateResult.success, true);
  assert.equal(updateResult.workflow.nodes.find((node) => node.id === createResult.created_node_id)?.label, 'Parse file type');
});

test('create_node rejects tool-call markup embedded in node data', async () => {
  const tools = createWorkflowEditorFunctionTools({ workflow, nodeDefinitions });
  const createNode = tools.find((tool) => tool.name === 'create_node');
  assert.ok(createNode);

  const result = await createNode.execute({
    type: 'run_code',
    data: {
      code: 'async function main() { return {}; }',
      inputs: { item: [] },
      'invoke name="create_node"': {
        type: 'switch',
        data: { conditions: { item: [] } },
      },
      $text: '\n',
    },
  }) as {
    success: boolean;
    message: string;
    property: string;
  };

  assert.equal(result.success, false);
  assert.equal(result.property, 'inputs');
  assert.match(result.message, /data\.inputFields array/);
});

test('node data validation rejects item-wrapped field and condition arrays', async () => {
  const tools = createWorkflowEditorFunctionTools({ workflow, nodeDefinitions });
  const createNode = tools.find((tool) => tool.name === 'create_node');
  const updateNode = tools.find((tool) => tool.name === 'update_node');
  assert.ok(createNode);
  assert.ok(updateNode);

  const createSwitchResult = await createNode.execute({
    type: 'switch',
    data: {
      conditions: {
        item: [{ id: 'cond_1', variable: '{{ __data__["node"].fileType }}', operator: 'equals', value: 'video' }],
      },
    },
  }) as {
    success: boolean;
    message: string;
    property: string;
  };

  assert.equal(createSwitchResult.success, false);
  assert.equal(createSwitchResult.property, 'conditions');
  assert.match(createSwitchResult.message, /expected conditions/);

  const createCodeResult = await createNode.execute({ type: 'run_code' }) as {
    success: boolean;
    created_node_id: string;
  };
  assert.equal(createCodeResult.success, true);

  const updateResult = await updateNode.execute({
    nodeId: createCodeResult.created_node_id,
    data: {
      inputFields: { item: [{ key: 'fileName', type: 'string' }] },
    },
  }) as {
    success: boolean;
    message: string;
    property: string;
  };

  assert.equal(updateResult.success, false);
  assert.equal(updateResult.property, 'inputFields');
  assert.match(updateResult.message, /Do not wrap fields/);
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

test('auto_layout arranges nodes inside loop_body scope', async () => {
  const tools = createWorkflowEditorFunctionTools({ workflow, nodeDefinitions });
  const createNode = tools.find((tool) => tool.name === 'create_node');
  const createEdge = tools.find((tool) => tool.name === 'create_edge');
  const updateNode = tools.find((tool) => tool.name === 'update_node');
  const autoLayout = tools.find((tool) => tool.name === 'auto_layout');
  assert.ok(createNode);
  assert.ok(createEdge);
  assert.ok(updateNode);
  assert.ok(autoLayout);

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

  const toastResult = await createNode.execute({
    type: 'toast',
    label: '输出循环索引',
    scopeNodeId: loopBodyNode.id,
  }) as {
    success: boolean;
    created_node_id: string;
  };
  assert.equal(toastResult.success, true);

  const firstEdgeResult = await createEdge.execute({
    source: loopStartNode.id,
    target: toastResult.created_node_id,
  }) as { success: boolean };
  assert.equal(firstEdgeResult.success, true);
  const secondEdgeResult = await createEdge.execute({
    source: toastResult.created_node_id,
    target: loopEndNode.id,
  }) as { success: boolean };
  assert.equal(secondEdgeResult.success, true);

  const movedToastResult = await updateNode.execute({
    nodeId: toastResult.created_node_id,
    data: { nodeWidth: 220, nodeHeight: 120 },
  }) as { success: boolean };
  assert.equal(movedToastResult.success, true);

  const layoutResult = await autoLayout.execute({}) as {
    success: boolean;
    affected_node_count: number;
    workflow_patch: { nodes: Workflow['nodes'] };
  };

  assert.equal(layoutResult.success, true);
  const nodes = layoutResult.workflow_patch.nodes;
  const laidOutLoopBodyNode = nodes.find((node) => node.id === loopBodyNode.id);
  const laidOutStartNode = nodes.find((node) => node.id === loopStartNode.id);
  const laidOutToastNode = nodes.find((node) => node.id === toastResult.created_node_id);
  const laidOutEndNode = nodes.find((node) => node.id === loopEndNode.id);
  assert.ok(laidOutLoopBodyNode);
  assert.ok(laidOutStartNode);
  assert.ok(laidOutToastNode);
  assert.ok(laidOutEndNode);
  assert.equal(laidOutStartNode.position.x < laidOutToastNode.position.x, true);
  assert.equal(laidOutToastNode.position.x < laidOutEndNode.position.x, true);
  assert.equal(laidOutStartNode.position.x >= laidOutLoopBodyNode.position.x + 80, true);
  assert.equal(
    (laidOutLoopBodyNode.data.nodeWidth as number) >= laidOutEndNode.position.x - laidOutLoopBodyNode.position.x + 220 + 100,
    true,
  );
  assert.equal(layoutResult.affected_node_count > 0, true);
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
