import type { NodeProperty, OutputField, Workflow, WorkflowEdge, WorkflowNode } from '@agent-spaces/shared';
import { createWorkflowNodesForDefinition } from '@agent-spaces/shared';
import type { AgentFunctionTool } from '../../../adapters/agent-runtime-types.js';
import * as workflowService from '../../workflow.js';
import { getWorkflowExecutionManager } from '../workflow-exec-tools.js';
import {
  asRecord,
  booleanInput,
  clone,
  cloneWorkflow,
  createWorkflowNodeId,
  numberInput,
  objectInput,
  objectInputResult,
  schema,
  stringInput,
  stringInputAny,
  workflowSearchSchema,
} from './helpers.js';
import { mergeOutputFields, outputFieldsInput } from './output-fields.js';
import {
  NODE_PROPERTY_TYPE_DEFINITIONS,
  defaultData,
  getPropertyTypeDefinition,
  searchableDefinitionText,
  validateNodeDataPatch,
} from './node-types.js';
import {
  findReusableInsertNode,
  getInsertScopeNode,
  nextNodePosition,
  replaceConflictingScopedEdges,
  resolveScopeNode,
} from './scope.js';
import { countPositionChanges, layoutNodes } from './layout.js';
import { describeNodeUsage, summarizeNodeDefinition, summarizeWorkflow } from './summary.js';
import type { JsonRecord, WorkflowEditorFunctionTools, WorkflowEditorToolContext } from './types.js';

export type { WorkflowEditorFunctionTools, WorkflowEditorToolContext } from './types.js';

function workflowResult(success: boolean, message: string, results?: unknown[], meta?: JsonRecord) {
  return {
    success,
    message,
    ...meta,
    results,
  };
}

const DEFAULT_DRY_RUN_TIMEOUT_MS = 120_000;
const MAX_DRY_RUN_TIMEOUT_MS = 600_000;
const DRY_RUN_POLL_INTERVAL_MS = 500;

interface MissingRequiredField {
  nodeId: string;
  nodeLabel: string;
  nodeType: string;
  field: string;
  label: string;
  type: string;
  reason: string;
}

function isRequiredValueMissing(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length === 0;
  return false;
}

function isPropertyVisible(property: NodeProperty, data: JsonRecord): boolean {
  if (!property.visibleWhen) return true;
  const actual = data[property.visibleWhen.key];
  if ('equals' in property.visibleWhen) return actual === property.visibleWhen.equals;
  if (property.visibleWhen.in) return property.visibleWhen.in.includes(actual);
  return true;
}

function addMissingArrayItemFields(
  missing: MissingRequiredField[],
  node: WorkflowNode,
  property: NodeProperty,
  value: unknown,
) {
  if (property.type !== 'array' || !Array.isArray(value) || !property.fields?.length) return;
  value.forEach((item, index) => {
    const itemRecord = asRecord(item);
    for (const field of property.fields ?? []) {
      if (!field.required || !isRequiredValueMissing(itemRecord[field.key])) continue;
      missing.push({
        nodeId: node.id,
        nodeLabel: node.label,
        nodeType: node.type,
        field: `${property.key}[${index}].${field.key}`,
        label: `${property.label}.${field.label}`,
        type: field.type,
        reason: 'required array item field is empty',
      });
    }
  });
}

function findReachableNodes(workflow: Pick<Workflow, 'nodes' | 'edges'>, startNodeId: string): WorkflowNode[] | null {
  const nodeById = new Map(workflow.nodes.map((node) => [node.id, node]));
  if (!nodeById.has(startNodeId)) return null;
  const outgoing = new Map<string, WorkflowEdge[]>();
  for (const edge of workflow.edges) {
    const list = outgoing.get(edge.source) ?? [];
    list.push(edge);
    outgoing.set(edge.source, list);
  }

  const reachable: WorkflowNode[] = [];
  const visited = new Set<string>();
  const queue = [startNodeId];
  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (!nodeId || visited.has(nodeId)) continue;
    visited.add(nodeId);
    const node = nodeById.get(nodeId);
    if (!node) continue;
    reachable.push(node);
    for (const edge of outgoing.get(nodeId) ?? []) {
      if (!visited.has(edge.target)) queue.push(edge.target);
    }
  }
  return reachable;
}

function arrayStringInput(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? arrayStringInput(parsed) : [];
    } catch {
      return value.trim() ? [value.trim()] : [];
    }
  }
  return [];
}

function objectInputAny(input: JsonRecord, keys: string[]): JsonRecord {
  for (const key of keys) {
    const value = objectInput(input, key);
    if (Object.keys(value).length > 0) return value;
  }
  return {};
}

function stringInputObject(input: JsonRecord, key: string): JsonRecord {
  const value = input[key];
  if (typeof value !== 'string' || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as JsonRecord : {};
  } catch {
    return {};
  }
}

function compactObject(value: JsonRecord): JsonRecord {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function checkRequiredFields(
  workflow: Pick<Workflow, 'nodes' | 'edges'>,
  startNodeId: string,
  definitionByType: ReadonlyMap<string, { properties?: NodeProperty[] }>,
) {
  const reachableNodes = findReachableNodes(workflow, startNodeId);
  if (!reachableNodes) return { success: false as const, message: `Start node not found: ${startNodeId}` };

  const missing: MissingRequiredField[] = [];
  for (const node of reachableNodes) {
    const definition = definitionByType.get(node.type);
    if (!definition?.properties?.length) continue;
    const data = asRecord(node.data);
    for (const property of definition.properties) {
      if (!property.required || !isPropertyVisible(property, data)) continue;
      const value = data[property.key];
      if (isRequiredValueMissing(value)) {
        missing.push({
          nodeId: node.id,
          nodeLabel: node.label,
          nodeType: node.type,
          field: property.key,
          label: property.label,
          type: property.type,
          reason: 'required field is empty',
        });
        continue;
      }
      addMissingArrayItemFields(missing, node, property, value);
    }
  }

  return {
    success: true as const,
    passed: missing.length === 0,
    checked_node_count: reachableNodes.length,
    checked_node_ids: reachableNodes.map((node) => node.id),
    missing_required_fields: missing,
  };
}

export function createWorkflowEditorFunctionTools(ctx: WorkflowEditorToolContext): WorkflowEditorFunctionTools {
  const versions = new Map<string, Pick<Workflow, 'nodes' | 'edges'>>();
  let draft = cloneWorkflow(ctx.workflow);

  const workflowPayload = (workflow: Workflow, summarize: boolean) => ({
    workflow: summarizeWorkflow(workflow, summarize),
    workflow_patch: {
      workflow_id: workflow.id,
      nodes: workflow.nodes,
      edges: workflow.edges,
      updatedAt: workflow.updatedAt,
    },
  });

  const commit = (next: Workflow, meta?: JsonRecord) => {
    draft = {
      ...next,
      nodes: clone(next.nodes),
      edges: clone(next.edges),
      updatedAt: Date.now(),
    };
    return workflowResult(true, 'updated', undefined, {
      ...workflowPayload(draft, false),
      ...meta,
    });
  };

  const definitionByType = new Map(ctx.nodeDefinitions.map((definition) => [definition.type, definition]));
  const getDefinitionPluginId = (definition: unknown): string => (
    definition && typeof definition === 'object' && 'pluginId' in definition && typeof definition.pluginId === 'string'
      ? definition.pluginId
      : ''
  );
  const searchDefinitions = (input: JsonRecord) => {
    const type = stringInputAny(input, ['type', 'nodeType', 'node_type'])?.toLowerCase();
    const pluginId = stringInputAny(input, ['pluginId', 'plugin_id', 'plugin'])?.toLowerCase();
    const name = stringInput(input, 'name')?.toLowerCase();
    const keyword = stringInput(input, 'keyword')?.toLowerCase();
    const label = stringInput(input, 'label')?.toLowerCase();
    const category = stringInput(input, 'category')?.toLowerCase();
    const description = stringInput(input, 'description')?.toLowerCase();
    return ctx.nodeDefinitions.filter((definition) => {
      const checks = [
        name ? [definition.type, definition.label].join(' ').toLowerCase().includes(name) : true,
        keyword ? searchableDefinitionText(definition).includes(keyword) : true,
        type ? definition.type.toLowerCase().includes(type) : true,
        pluginId ? getDefinitionPluginId(definition).toLowerCase() === pluginId : true,
        label ? definition.label.toLowerCase().includes(label) : true,
        category ? definition.category.toLowerCase().includes(category) : true,
        description ? definition.description.toLowerCase().includes(description) : true,
      ];
      return checks.every(Boolean);
    });
  };

  const tools: AgentFunctionTool[] = [
    {
      name: 'get_workflow',
      description: '按 workflow_id 读取指定工作流的最新已保存文件数据。默认返回摘要，summarize=false 返回完整数据。',
      inputSchema: schema({
        workflow_id: { type: 'string', description: '要读取的工作流 ID。' },
        summarize: { type: 'boolean', description: '是否返回摘要，默认 true。' },
      }, ['workflow_id']),
      annotations: { readOnly: true },
      execute: async (input) => {
        const workflowId = stringInput(asRecord(input), 'workflow_id');
        if (!workflowId) return { success: false, message: 'workflow_id is required' };
        const workflow = workflowService.getWorkflow(workflowId);
        if (!workflow) return { success: false, message: `Workflow not found: ${workflowId}` };
        return { success: true, data: summarizeWorkflow(workflow, booleanInput(asRecord(input), 'summarize', true)) };
      },
    },
    {
      name: 'get_current_workflow',
      description: '读取当前编辑器中的工作流草稿，包含尚未保存的编辑状态。默认返回摘要，summarize=false 返回完整 data；字符串 "false" 也按 false 处理。',
      inputSchema: schema({ summarize: { type: 'boolean', description: '是否返回摘要，默认 true。' } }),
      annotations: { readOnly: true },
      execute: async (input) => {
        const summarize = booleanInput(asRecord(input), 'summarize', true);
        return {
          success: true,
          data: summarizeWorkflow(draft, summarize),
          ...workflowPayload(draft, summarize),
        };
      },
    },
    {
      name: 'create_workflow_version',
      description: '为当前工作流草稿创建版本快照，适合复杂或破坏性编辑前备份。',
      inputSchema: schema({ name: { type: 'string', description: '版本名称。' } }),
      execute: async (input) => {
        const name = stringInput(asRecord(input), 'name') ?? 'AI 修改前备份';
        const version = workflowService.createVersion(draft.id, {
          name,
          nodes: draft.nodes,
          edges: draft.edges,
        });
        versions.set(version.id, { nodes: clone(version.snapshot.nodes), edges: clone(version.snapshot.edges) });
        return { success: true, version_id: version.id, name: version.name };
      },
    },
    {
      name: 'restore_workflow_version',
      description: '恢复本次会话内 create_workflow_version 创建的版本快照。',
      inputSchema: schema({ version_id: { type: 'string', description: '要恢复的版本 ID。' } }, ['version_id']),
      execute: async (input) => {
        const versionId = stringInput(asRecord(input), 'version_id');
        const version = versionId ? versions.get(versionId) : undefined;
        if (!version) return { success: false, message: `Version not found: ${versionId ?? ''}` };
        return commit({ ...draft, nodes: clone(version.nodes), edges: clone(version.edges) });
      },
    },
    {
      name: 'search_nodes',
      description: '在当前工作流中搜索节点，支持 keyword/type/label/category/description 模糊匹配。',
      inputSchema: workflowSearchSchema(),
      annotations: { readOnly: true },
      execute: async (input) => {
        const record = asRecord(input);
        const defs = new Map(ctx.nodeDefinitions.map((definition) => [definition.type, definition]));
        const keyword = stringInput(record, 'keyword')?.toLowerCase();
        const type = stringInput(record, 'type')?.toLowerCase();
        const pluginId = stringInputAny(record, ['pluginId', 'plugin_id', 'plugin'])?.toLowerCase();
        const label = stringInput(record, 'label')?.toLowerCase();
        const category = stringInput(record, 'category')?.toLowerCase();
        const description = stringInput(record, 'description')?.toLowerCase();
        const nodes = draft.nodes.filter((node) => {
          const definition = defs.get(node.type);
          const checks = [
            keyword ? [node.id, node.type, node.label, definition ? searchableDefinitionText(definition) : undefined].filter(Boolean).join(' ').toLowerCase().includes(keyword) : true,
            type ? node.type.toLowerCase().includes(type) : true,
            pluginId ? getDefinitionPluginId(definition).toLowerCase() === pluginId : true,
            label ? node.label.toLowerCase().includes(label) : true,
            category ? (definition?.category ?? '').toLowerCase().includes(category) : true,
            description ? (definition?.description ?? '').toLowerCase().includes(description) : true,
          ];
          return checks.every(Boolean);
        });
        if (nodes.length > 0) {
          return {
            success: true,
            nodes: nodes.map((node) => {
              const definition = defs.get(node.type);
              return {
                ...node,
                ...(definition ? { definition: summarizeNodeDefinition(definition) } : {}),
              };
            }),
          };
        }
        return {
          success: true,
          nodes: searchDefinitions(record).map((definition) => summarizeNodeDefinition(definition)),
        };
      },
    },
    {
      name: 'list_node_types',
      description: '分页查询当前工作流可用的节点类型列表，返回轻量摘要；支持 pluginId/plugin_id/plugin 按插件 ID 精确筛选，也支持 keyword/type/label/category/description 筛选。需要某个插件下节点时优先传 pluginId；需要字段、输出和示例 data 时继续调用 search_node_usage。',
      inputSchema: schema({
        keyword: { type: 'string', description: '模糊搜索关键词，会同时匹配 type、label、category、description。' },
        pluginId: { type: 'string', description: '按插件 ID 精确筛选，例如 workflow.ffmpeg、workflow.tencent-cos。' },
        plugin_id: { type: 'string', description: '按插件 ID 精确筛选，兼容蛇形命名。' },
        plugin: { type: 'string', description: '按插件 ID 精确筛选，pluginId 的简写。' },
        type: { type: 'string', description: '按节点类型模糊筛选。' },
        label: { type: 'string', description: '按节点标签模糊筛选。' },
        category: { type: 'string', description: '按分类筛选。' },
        description: { type: 'string', description: '按节点描述模糊筛选。' },
        page: { type: 'number', description: '页码，从 1 开始，默认 1。' },
        pageSize: { type: 'number', description: '每页数量，默认 20，最大 50。' },
        page_size: { type: 'number', description: '每页数量，兼容蛇形命名。' },
      }),
      annotations: { readOnly: true },
      execute: async (input) => {
        const record = asRecord(input);
        const filtered = searchDefinitions(record);
        const page = Math.max(1, numberInput(record, 'page', 1));
        const pageSize = Math.min(50, Math.max(1, numberInput(record, 'pageSize', numberInput(record, 'page_size', 20))));
        const items = filtered.slice((page - 1) * pageSize, page * pageSize);
        return {
          success: true,
          page,
          page_size: pageSize,
          total: filtered.length,
          available_total: ctx.nodeDefinitions.length,
          nodes: items.map(summarizeNodeDefinition),
        };
      },
    },
    {
      name: 'search_node_usage',
      description: '查询当前工作流可用节点类型的具体用法，返回字段说明、句柄、输出和示例 data。准备使用陌生节点前必须调用。',
      inputSchema: workflowSearchSchema(),
      annotations: { readOnly: true },
      execute: async (input) => {
        const nodes = searchDefinitions(asRecord(input));
        return {
          success: true,
          total: nodes.length,
          available_total: ctx.nodeDefinitions.length,
          nodes: nodes.map(describeNodeUsage),
        };
      },
    },
    {
      name: 'check_workflow_chain',
      description: '从起始节点 ID 开始，沿当前工作流草稿的出边向后检查所有可达节点，返回必填字段未填写的节点和字段。通常传开始节点 ID；工作流编辑完成后必须调用，直到 passed=true。',
      inputSchema: schema({
        startNodeId: { type: 'string', description: '起始节点 ID，通常是开始节点 ID。' },
        start_node_id: { type: 'string', description: '起始节点 ID，兼容蛇形命名。' },
      }, ['startNodeId']),
      annotations: { readOnly: true },
      execute: async (input) => {
        const startNodeId = stringInputAny(asRecord(input), ['startNodeId', 'start_node_id']);
        if (!startNodeId) return { success: false, message: 'startNodeId is required' };
        const result = checkRequiredFields(draft, startNodeId, definitionByType);
        if (!result.success) return result;
        return {
          ...result,
          message: result.passed ? 'workflow chain required fields check passed' : 'workflow chain has missing required fields',
        };
      },
    },
    {
      name: 'dry_run',
      description: '使用当前未保存的工作流草稿执行一次 dry run。可传 node_ids 限定哪些节点使用自定义输入/输出；不传 node_ids 时，所有提供了自定义 inputs/outputs 的节点都会生效。outputs 用于跳过需要密钥或会产生实际消耗的节点。',
      inputSchema: schema({
        startNodeId: { type: 'string', description: '可选，起始节点 ID。多开始节点时必须提供。' },
        start_node_id: { type: 'string', description: '起始节点 ID，兼容蛇形命名。' },
        workflow_input: { type: 'object', description: '可选，工作流整体输入，会传给 start 节点。', properties: {} },
        input: { type: 'object', description: 'workflow_input alias.', properties: {} },
        workflowInput: { type: 'object', description: 'workflow_input alias.', properties: {} },
        node_ids: { type: 'array', description: '可选，只对这些节点启用自定义 inputs/outputs。', items: { type: 'string' } },
        nodeIds: { type: 'array', description: 'node_ids alias.', items: { type: 'string' } },
        inputs: { type: ['object', 'string'], description: '可选，按节点 ID 设置运行时输入，例如 { "node_id": { "field": "value" } }。也兼容 JSON 字符串。', properties: {} },
        custom_inputs: { type: ['object', 'string'], description: 'inputs alias.', properties: {} },
        outputs: { type: ['object', 'string'], description: '可选，按节点 ID 设置模拟输出；提供后该节点不执行真实逻辑，直接返回此输出。也兼容 JSON 字符串。', properties: {} },
        custom_outputs: { type: ['object', 'string'], description: 'outputs alias.', properties: {} },
        max_wait_ms: { type: 'number', description: `等待 dry run 完成的最长时间，默认 ${DEFAULT_DRY_RUN_TIMEOUT_MS}，最大 ${MAX_DRY_RUN_TIMEOUT_MS}。` },
      }),
      annotations: { readOnly: true },
      execute: async (input) => {
        const manager = getWorkflowExecutionManager();
        if (!manager) return { success: false, message: 'Workflow execution manager is not initialized' };

        const record = asRecord(input);
        const startNodeId = stringInputAny(record, ['startNodeId', 'start_node_id']);
        const snakeNodeIds = arrayStringInput(record.node_ids);
        const nodeIds = snakeNodeIds.length > 0 ? snakeNodeIds : arrayStringInput(record.nodeIds);
        const workflowInput = objectInputAny(record, ['workflow_input', 'workflowInput', 'input']);
        const dryRunInputs = {
          ...stringInputObject(record, 'inputs'),
          ...objectInputAny(record, ['inputs', 'custom_inputs']),
        };
        const dryRunOutputs = {
          ...stringInputObject(record, 'outputs'),
          ...objectInputAny(record, ['outputs', 'custom_outputs']),
        };
        const result = await manager.execute({
          workflowId: draft.id,
          input: workflowInput,
          startNodeId,
          snapshot: {
            nodes: clone(draft.nodes),
            edges: clone(draft.edges),
            groups: clone(draft.groups || []),
            variables: clone(draft.variables || []),
          },
          dryRun: {
            ...(nodeIds.length > 0 ? { nodeIds } : {}),
            inputs: dryRunInputs,
            outputs: dryRunOutputs,
          },
        }, 'workflow-editor-dry-run');

        const timeoutMs = Math.min(MAX_DRY_RUN_TIMEOUT_MS, Math.max(DRY_RUN_POLL_INTERVAL_MS, numberInput(record, 'max_wait_ms', DEFAULT_DRY_RUN_TIMEOUT_MS)));
        const startedAt = Date.now();
        let status = result.status;
        let log = manager.getExecutionRecovery({ workflowId: draft.id, executionId: result.executionId }, 'workflow-editor-dry-run').execution?.log;
        while (Date.now() - startedAt < timeoutMs) {
          const recovery = manager.getExecutionRecovery({ workflowId: draft.id, executionId: result.executionId }, 'workflow-editor-dry-run');
          log = recovery.execution?.log ?? workflowService.getExecutionLog(draft.id, result.executionId) ?? log;
          status = log?.status ?? recovery.execution?.status ?? status;
          if (status !== 'running') break;
          await sleep(DRY_RUN_POLL_INTERVAL_MS);
        }

        log = log ?? workflowService.getExecutionLog(draft.id, result.executionId) ?? undefined;
        const recovery = manager.getExecutionRecovery({ workflowId: draft.id, executionId: result.executionId }, 'workflow-editor-dry-run');
        const timedOut = status === 'running';
        const steps = log?.steps.map((step) => ({
          nodeId: step.nodeId,
          nodeLabel: step.nodeLabel,
          status: step.status,
          input: step.input,
          output: step.output,
          error: step.error,
          logs: step.logs,
        })) ?? [];
        const overrideNodeIds = Array.from(new Set([
          ...Object.keys(dryRunInputs),
          ...Object.keys(dryRunOutputs),
        ]));
        const skippedOverrideNodeIds = overrideNodeIds.filter((nodeId) => steps.some((step) => step.nodeId === nodeId && step.status === 'skipped'));
        const executedOrMockedNodeIds = steps.filter((step) => step.status === 'completed').map((step) => step.nodeId);
        const success = !timedOut
          && status === 'completed'
          && skippedOverrideNodeIds.length === 0
          && (overrideNodeIds.length === 0 || overrideNodeIds.some((nodeId) => executedOrMockedNodeIds.includes(nodeId)));
        return {
          success,
          message: timedOut
            ? `Dry run is still running after ${timeoutMs}ms.`
            : success
              ? `Dry run finished with status: ${status}.`
              : `Dry run finished with status: ${status}, but requested override nodes were not exercised.`,
          execution_id: result.executionId,
          status,
          timed_out: timedOut,
          override_node_ids: overrideNodeIds,
          skipped_override_node_ids: skippedOverrideNodeIds,
          effective_workflow_input: workflowInput,
          effective_inputs: compactObject(dryRunInputs),
          effective_outputs: compactObject(dryRunOutputs),
          steps,
          context: recovery.execution?.context,
        };
      },
    },
    {
      name: 'get_node_property_type_definition',
      description: '查询节点 properties[].type 对应的 data 值结构。遇到 agent 等非常见属性类型，写入或更新 data 前必须调用。',
      inputSchema: schema({
        type: { type: 'string', description: '属性类型名称，例如 agent。' },
        property_type: { type: 'string', description: '属性类型名称，兼容蛇形命名。' },
      }),
      annotations: { readOnly: true },
      execute: async (input) => {
        const type = stringInputAny(asRecord(input), ['type', 'property_type']);
        if (!type) return { success: false, message: 'type is required' };
        const definition = getPropertyTypeDefinition(type);
        if (!definition) {
          return {
            success: false,
            message: `Unknown property type: ${type}`,
            known_types: Array.from(NODE_PROPERTY_TYPE_DEFINITIONS.keys()),
          };
        }
        return { success: true, type, definition, description: definition.description };
      },
    },
    {
      name: 'create_node',
      description: '在工作流中创建新节点。需要指定有效节点 type，可选 label、data。调用前先用 search_node_usage 确认节点字段；data 只能包含该节点真实参数，输入字段必须写为 inputFields 数组，禁止写 inputs 或包成 { item: [...] }。要创建到 loop_body 等作用域内，传 scopeNodeId/scope_node_id，或传 source/sourceHandle 让工具从 loop-body 句柄推断。',
      inputSchema: schema({
        type: { type: 'string', description: '节点类型标识。' },
        label: { type: 'string', description: '节点显示名称。' },
        data: { type: 'object', description: '节点参数数据。', properties: {} },
        scopeNodeId: { type: 'string', description: '可选，作用域容器节点 ID，例如 loop_body 节点 ID。' },
        scope_node_id: { type: 'string', description: '可选，作用域容器节点 ID，兼容蛇形命名。' },
        parentId: { type: 'string', description: '兼容参数，等同 scopeNodeId。' },
        parent_id: { type: 'string', description: '兼容参数，等同 scope_node_id。' },
        source: { type: 'string', description: '可选，前置节点 ID；当 sourceHandle=loop-body 时自动创建到对应 loop_body。' },
        sourceHandle: { type: 'string', description: '可选，前置节点连接点。' },
        source_handle: { type: 'string', description: '可选，前置节点连接点，兼容蛇形命名。' },
      }, ['type']),
      execute: async (input) => {
        const record = asRecord(input);
        const type = stringInput(record, 'type');
        if (!type) return { success: false, message: 'type is required' };
        const definition = definitionByType.get(type);
        if (!definition) return { success: false, message: `Unknown node type: ${type}` };
        const rootData = objectInput(record, 'data');
        const validation = validateNodeDataPatch(definition, rootData);
        if (!validation.success) return validation;
        const scopeNodeResult = resolveScopeNode(draft.nodes, record);
        if (!scopeNodeResult.success) return scopeNodeResult;
        const created = createWorkflowNodesForDefinition({
          definitions: ctx.nodeDefinitions,
          type,
          rootLabel: stringInput(record, 'label'),
          position: nextNodePosition(draft.nodes, scopeNodeResult.scopeNode),
          rootData,
          scopeNode: scopeNodeResult.scopeNode,
          createNodeId: createWorkflowNodeId,
        });
        if (!created) return { success: false, message: `Failed to create node type: ${type}` };
        return commit({
          ...draft,
          nodes: [...draft.nodes, ...created.nodes],
          edges: [...draft.edges, ...created.edges],
        }, {
          created_node_id: created.rootNode.id,
          created_node_ids: created.nodes.map((node) => node.id),
          created_edge_ids: created.edges.map((edge) => edge.id),
        });
      },
    },
    {
      name: 'update_node',
      description: '更新指定节点的 label 或 data。调用前先用 search_node_usage 确认节点字段；data 会与现有 data 浅合并，必须传实际要写入的节点参数，禁止用 data:{} 或空 args 试探更新；只改显示名时才只传 label。data 应传对象，兼容 JSON 字符串。',
      inputSchema: schema({
        nodeId: { type: 'string', description: '要更新的节点 ID。' },
        node_id: { type: 'string', description: '要更新的节点 ID，兼容蛇形命名。' },
        id: { type: 'string', description: '要更新的节点 ID，兼容旧参数。' },
        label: { type: 'string', description: '可选，节点显示名称。' },
        data: { type: ['object', 'string'], description: '可选；要合并的非空节点参数对象，禁止传空对象 {}；兼容 JSON 字符串。只改显示名时传 label，不要传 data。', properties: {}, minProperties: 1 },
      }, ['nodeId']),
      execute: async (input) => {
        const record = asRecord(input);
        const nodeId = stringInputAny(record, ['nodeId', 'node_id', 'id']);
        if (!nodeId) return { success: false, message: 'nodeId is required' };
        const dataResult = objectInputResult(record, 'data');
        if (!dataResult.success) return dataResult;
        const label = stringInput(record, 'label');
        const hasDataInput = Object.prototype.hasOwnProperty.call(record, 'data');
        if (!label && (!hasDataInput || Object.keys(dataResult.value).length === 0)) {
          return {
            success: false,
            message: 'update_node requires a non-empty data object or label. Put actual node changes inside data, for example { "data": { "code": "...", "outputs": [...] } }.',
          };
        }
        const targetNode = draft.nodes.find((node) => node.id === nodeId);
        if (!targetNode) return { success: false, message: `Node not found: ${nodeId}` };
        const definition = definitionByType.get(targetNode.type);
        if (definition) {
          const validation = validateNodeDataPatch(definition, dataResult.value);
          if (!validation.success) return validation;
        }
        let found = false;
        const nodes = draft.nodes.map((node) => {
          if (node.id !== nodeId) return node;
          found = true;
          return {
            ...node,
            label: label ?? node.label,
            data: { ...node.data, ...dataResult.value },
          };
        });
        return found ? commit({ ...draft, nodes }) : { success: false, message: `Node not found: ${nodeId}` };
      },
    },
    {
      name: 'set_node_io_fields',
      description: '新增、合并或替换节点的输入/输出字段数组。输入字段写入 data.inputFields；输出字段写入 data.outputs。开始节点运行输入变量引用使用 {{ __data__["节点ID"].字段 }}，普通节点输出变量引用也使用 {{ __data__["节点ID"].字段 }}。结束节点返回结果来自 outputs，每个输出项可设置 value；动态代码节点返回结构变化后要同步更新 outputs。',
      inputSchema: schema({
        nodeId: { type: 'string', description: '要更新的节点 ID。' },
        node_id: { type: 'string', description: '要更新的节点 ID，兼容蛇形命名。' },
        fieldKind: { type: 'string', enum: ['inputFields', 'outputs'], description: '要更新的字段类型：inputFields 或 outputs。' },
        field_kind: { type: 'string', enum: ['inputFields', 'outputs'], description: '要更新的字段类型，兼容蛇形命名。' },
        mode: { type: 'string', enum: ['append', 'merge', 'replace'], description: 'append 追加新字段；merge 按 key 合并/覆盖；replace 替换整个数组。默认 merge。' },
        fields: {
          type: ['array', 'string'],
          description: '字段数组，每项至少包含 key 和 type；兼容 JSON 字符串数组。object 类型可带 children；结束节点 outputs 可带 value。',
          items: {
            type: 'object',
            properties: {
              key: { type: 'string', description: '字段 key。' },
              type: { type: 'string', description: '字段类型，例如 string/number/boolean/object/file/any/string[]/number[]/file[]/any[]。' },
              value: { description: '输出字段值，结束节点常用，可为变量引用。' },
              description: { type: 'string', description: '字段说明。' },
              required: { type: 'boolean', description: '是否必填，常用于输入字段。' },
              children: { type: 'array', description: 'object 字段的子字段。' },
            },
            required: ['key', 'type'],
          },
        },
      }, ['fields']),
      execute: async (input) => {
        const record = asRecord(input);
        const nodeId = stringInputAny(record, ['nodeId', 'node_id']);
        if (!nodeId) return { success: false, message: 'nodeId is required' };
        const fieldKind = stringInputAny(record, ['fieldKind', 'field_kind']);
        if (fieldKind !== 'inputFields' && fieldKind !== 'outputs') {
          return { success: false, message: 'fieldKind must be inputFields or outputs' };
        }
        const rawMode = stringInput(record, 'mode') ?? 'merge';
        const mode = rawMode === 'append' || rawMode === 'replace' || rawMode === 'merge' ? rawMode : 'merge';
        const fieldsResult = outputFieldsInput(record.fields);
        if (!fieldsResult.success) return fieldsResult;

        let found = false;
        const nodes = draft.nodes.map((node) => {
          if (node.id !== nodeId) return node;
          found = true;
          const existing = Array.isArray(node.data?.[fieldKind]) ? node.data[fieldKind] as OutputField[] : [];
          return {
            ...node,
            data: {
              ...node.data,
              [fieldKind]: mergeOutputFields(existing, fieldsResult.fields, mode),
            },
          };
        });
        return found ? commit({ ...draft, nodes }) : { success: false, message: `Node not found: ${nodeId}` };
      },
    },
    {
      name: 'delete_node',
      description: '删除指定节点及其相关连线。',
      inputSchema: schema({
        nodeId: { type: 'string', description: '要删除的节点 ID。' },
        node_id: { type: 'string', description: '要删除的节点 ID，兼容蛇形命名。' },
      }),
      annotations: { destructive: true },
      execute: async (input) => {
        const nodeId = stringInputAny(asRecord(input), ['nodeId', 'node_id']);
        if (!nodeId) return { success: false, message: 'nodeId is required' };
        if (!draft.nodes.some((node) => node.id === nodeId)) return { success: false, message: `Node not found: ${nodeId}` };
        return commit({
          ...draft,
          nodes: draft.nodes.filter((node) => node.id !== nodeId),
          edges: draft.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
        });
      },
    },
    {
      name: 'create_edge',
      description: '创建连线。source/target 是节点 ID；多输出节点应传 sourceHandle。',
      inputSchema: schema({
        source: { type: 'string', description: '起始节点 ID。' },
        target: { type: 'string', description: '目标节点 ID。' },
        sourceHandle: { type: 'string', description: '起始连接点。' },
        source_handle: { type: 'string', description: '起始连接点，兼容蛇形命名。' },
        targetHandle: { type: 'string', description: '目标连接点。' },
        target_handle: { type: 'string', description: '目标连接点，兼容蛇形命名。' },
      }, ['source', 'target']),
      execute: async (input) => {
        const record = asRecord(input);
        const source = stringInput(record, 'source');
        const target = stringInput(record, 'target');
        if (!source || !target) return { success: false, message: 'source and target are required' };
        if (!draft.nodes.some((node) => node.id === source)) return { success: false, message: `Source node not found: ${source}` };
        if (!draft.nodes.some((node) => node.id === target)) return { success: false, message: `Target node not found: ${target}` };
        const edge: WorkflowEdge = {
          id: `e-${source}-${target}-${Date.now().toString(36)}`,
          source,
          target,
          sourceHandle: stringInputAny(record, ['sourceHandle', 'source_handle']) ?? undefined,
          targetHandle: stringInputAny(record, ['targetHandle', 'target_handle']) ?? undefined,
        };
        const replacement = replaceConflictingScopedEdges(draft.nodes, draft.edges, edge);
        return commit({ ...draft, edges: [...replacement.edges, edge] }, {
          removed_edge_ids: replacement.removedEdgeIds,
        });
      },
    },
    {
      name: 'delete_edge',
      description: '删除指定连线。',
      inputSchema: schema({
        edgeId: { type: 'string', description: '要删除的连线 ID。' },
        edge_id: { type: 'string', description: '要删除的连线 ID，兼容蛇形命名。' },
      }),
      annotations: { destructive: true },
      execute: async (input) => {
        const edgeId = stringInputAny(asRecord(input), ['edgeId', 'edge_id']);
        if (!edgeId) return { success: false, message: 'edgeId is required' };
        if (!draft.edges.some((edge) => edge.id === edgeId)) return { success: false, message: `Edge not found: ${edgeId}` };
        return commit({ ...draft, edges: draft.edges.filter((edge) => edge.id !== edgeId) });
      },
    },
    {
      name: 'insert_node',
      description: '在已有连线中插入节点，替换为 source -> 节点 -> target 两条边。调用前先用 search_node_usage 确认节点字段；data 只能包含该节点真实参数。可传 nodeId/node_id 复用现有节点；不传时会优先复用同作用域内未连线且类型/标签/data 匹配的节点，避免先 create_node 后再 delete_node。',
      inputSchema: schema({
        edgeId: { type: 'string', description: '要插入的边 ID。' },
        edge_id: { type: 'string', description: '要插入的边 ID，兼容蛇形命名。' },
        nodeId: { type: 'string', description: '可选，要复用并插入的现有节点 ID。' },
        node_id: { type: 'string', description: '可选，要复用并插入的现有节点 ID，兼容蛇形命名。' },
        type: { type: 'string', description: '新节点类型。' },
        label: { type: 'string', description: '新节点显示名称。' },
        data: { type: 'object', description: '新节点参数。', properties: {} },
      }),
      execute: async (input) => {
        const record = asRecord(input);
        const edgeId = stringInputAny(record, ['edgeId', 'edge_id']);
        const type = stringInput(record, 'type');
        const reuseNodeId = stringInputAny(record, ['nodeId', 'node_id']);
        const edge = draft.edges.find((item) => item.id === edgeId);
        if (!edge) return { success: false, message: `Edge not found: ${edgeId ?? ''}` };
        const sourceNode = draft.nodes.find((node) => node.id === edge.source);
        const targetNode = draft.nodes.find((node) => node.id === edge.target);
        const scopeNode = getInsertScopeNode(draft.nodes, edge.source, edge.sourceHandle);
        const insertPosition = {
          x: ((sourceNode?.position.x ?? 0) + (targetNode?.position.x ?? 260)) / 2,
          y: ((sourceNode?.position.y ?? 0) + (targetNode?.position.y ?? 0)) / 2,
        };
        const data = objectInput(record, 'data');
        const reuseNode = reuseNodeId
          ? draft.nodes.find((node) => node.id === reuseNodeId)
          : findReusableInsertNode(draft.nodes, draft.edges, {
              type,
              label: stringInput(record, 'label'),
              data,
              scopeNode,
            });
        if (reuseNodeId && !reuseNode) return { success: false, message: `Node not found: ${reuseNodeId}` };
        const insertType = type ?? reuseNode?.type;
        if (!insertType) return { success: false, message: 'type is required' };
        const definition = definitionByType.get(insertType);
        if (!definition) return { success: false, message: `Unknown node type: ${insertType}` };
        if (reuseNode && reuseNode.type !== insertType) {
          return { success: false, message: `Node type mismatch: ${reuseNode.id} is ${reuseNode.type}, expected ${insertType}` };
        }

        const nodeId = reuseNode?.id ?? `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const node: WorkflowNode = {
          ...(reuseNode ?? {}),
          id: nodeId,
          type: insertType,
          label: stringInput(record, 'label') ?? reuseNode?.label ?? definition.label,
          position: insertPosition,
          data: { ...defaultData(definition), ...(reuseNode?.data ?? {}), ...data },
          composite: scopeNode ? {
            ...(reuseNode?.composite ?? {}),
            rootId: scopeNode.composite?.rootId || scopeNode.id,
            parentId: scopeNode.id,
            generated: false,
            hidden: false,
          } : reuseNode?.composite,
        };
        const nodes = reuseNode
          ? draft.nodes.map((item) => item.id === node.id ? node : item)
          : [...draft.nodes, node];
        return commit({
          ...draft,
          nodes,
          edges: [
            ...draft.edges.filter((item) => item.id !== edgeId),
            { id: `e-${edge.source}-${nodeId}`, source: edge.source, target: nodeId, sourceHandle: edge.sourceHandle },
            { id: `e-${nodeId}-${edge.target}`, source: nodeId, target: edge.target, targetHandle: edge.targetHandle },
          ],
        }, {
          inserted_node_id: nodeId,
          reused_node: !!reuseNode,
        });
      },
    },
    {
      name: 'batch_update',
      description: '批量执行 create_node/update_node/delete_node/create_edge/delete_edge 操作。',
      inputSchema: schema({
        operations: {
          type: 'array',
          description: '每项为 { tool, args }。',
          items: { type: 'object', properties: { tool: { type: 'string' }, args: { type: 'object', properties: {} } } },
        },
      }, ['operations']),
      execute: async (input) => {
        const operationsInput = asRecord(input).operations;
        const operations = Array.isArray(operationsInput) ? operationsInput : [];
        const toolMap = new Map(tools.map((tool) => [tool.name, tool]));
        const results: unknown[] = [];
        for (const operation of operations) {
          const record = asRecord(operation);
          const toolName = stringInput(record, 'tool');
          if (!toolName || toolName === 'batch_update') return { success: false, message: `Invalid batch tool: ${toolName ?? ''}` };
          const tool = toolMap.get(toolName);
          if (!tool) return { success: false, message: `Unknown batch tool: ${toolName}` };
          const result = await tool.execute(record.args);
          results.push(result);
          if (asRecord(result).success === false) return { success: false, results };
        }
        return workflowResult(true, 'batch updated', results);
      },
    },
    {
      name: 'auto_layout',
      description: '自动整理当前工作流节点位置。direction 可选 LR 或 TB。',
      inputSchema: schema({ direction: { type: 'string', description: '布局方向，LR 或 TB，默认 LR。' } }),
      execute: async (input) => {
        const direction = stringInput(asRecord(input), 'direction') === 'TB' ? 'TB' : 'LR';
        const nodes = layoutNodes(draft.nodes, draft.edges, ctx.nodeDefinitions, direction);
        const affectedNodeCount = countPositionChanges(draft.nodes, nodes);
        return commit({ ...draft, nodes }, { affected_node_count: affectedNodeCount });
      },
    },
    {
      name: 'saveworkflow',
      description: '保存当前工作流草稿到后端，触发后端工作流校验，并返回后端文本。通常在 auto_layout 后调用；success=false 时根据 message 修正工作流。',
      inputSchema: schema({}),
      execute: async () => {
        try {
          const saved = workflowService.updateWorkflow(draft.id, draft);
          draft = cloneWorkflow(saved);
          const backendMessage = 'Workflow saved and backend validation passed.';
          return workflowResult(true, backendMessage, undefined, {
            ...workflowPayload(draft, false),
            backend_message: backendMessage,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : '保存工作流失败';
          return {
            success: false,
            message,
            backend_message: message,
          };
        }
      },
    },
  ];

  return Object.assign(tools, {
    getDraftWorkflow: () => cloneWorkflow(draft),
  });
}
