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
