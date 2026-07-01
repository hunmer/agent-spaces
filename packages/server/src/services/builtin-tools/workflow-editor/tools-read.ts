import type { AgentFunctionTool } from '../../../adapters/agent-runtime-types.js';
import { listAvailableAgentCapabilities } from '../../agent-capability-catalog.js';
import * as agentService from '../../agent.js';
import * as workflowService from '../../workflow.js';
import {
  asRecord,
  arrayStringInput,
  booleanInput,
  getMcpServerNames,
  numberInput,
  schema,
  stringInput,
  stringInputAny,
  workflowSearchSchema,
} from './helpers.js';
import {
  NODE_PROPERTY_TYPE_DEFINITIONS,
  getPropertyTypeDefinition,
  searchableDefinitionText,
} from './node-types.js';
import { describeNodeUsage, summarizeNodeDefinition, summarizeWorkflow } from './summary.js';
import { checkRequiredFields } from './validation.js';
import type { ToolDeps, ToolFactory } from './types.js';

/** 列出环境能力 / agent preset 清单。 */
const listAvailableAgentCapabilitiesTool: ToolFactory = () => ({
  name: 'list_available_agent_capabilities',
  description: '列出当前环境里可用的 MCP、skills、内置 tools 清单。设计多 agent workflow 前先调用它，再决定哪些能力可以分配。',
  inputSchema: schema({}),
  annotations: { readOnly: true },
  execute: async () => ({
    success: true,
    data: listAvailableAgentCapabilities(),
  }),
});

const listAgentCapabilitiesTool: ToolFactory = (deps) => ({
  name: 'list_agent_capabilities',
  description: '列出当前可用的 agent preset，以及它们配置的 mcps、skills、tools 和模型字段。设计多 agent workflow 前先调用它，再按职责分配能力。',
  inputSchema: schema({
    agent_ids: {
      type: 'array',
      description: '可选，只返回这些 agent preset ID。',
      items: { type: 'string' },
    },
    include_disabled: {
      type: 'boolean',
      description: '是否包含 disabled 的 agent preset，默认 false。',
    },
  }),
  annotations: { readOnly: true },
  execute: async (input) => {
    const record = asRecord(input);
    const includeDisabled = booleanInput(record, 'include_disabled', false);
    const requestedIds = new Set(arrayStringInput(record.agent_ids));
    const presets = agentService.listPresets(deps.ctx.workspaceId ?? '')
      .filter((agent) => (includeDisabled || agent.enabled !== false) && (!requestedIds.size || requestedIds.has(agent.id)))
      .map((agent) => {
        const configDir = deps.ctx.workspaceId ? agentService.getAgentConfigDir(deps.ctx.workspaceId, agent) : undefined;
        const resolvedMcpServers = agentService.getMcpServers(agent.mcps);
        const resolvedSkills = agentService.getAvailableSkillNames(configDir, agent.skills);
        const configuredSkills = arrayStringInput(agent.skills);
        return {
          id: agent.id,
          name: agent.name,
          role: agent.role,
          description: agent.description ?? '',
          enabled: agent.enabled,
          providerId: agent.providerId ?? '',
          modelId: agent.modelId ?? '',
          modelProvider: agent.modelProvider ?? '',
          mcp_servers: Object.keys(resolvedMcpServers ?? {}).length ? Object.keys(resolvedMcpServers ?? {}) : getMcpServerNames(agent.mcps),
          skills: resolvedSkills.length ? resolvedSkills : configuredSkills,
          tools: Array.isArray(agent.tools) ? [...agent.tools] : [],
        };
      });
    return {
      success: true,
      total: presets.length,
      agents: presets,
    };
  },
});

const getWorkflowTool: ToolFactory = () => ({
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
});

const getCurrentWorkflowTool: ToolFactory = (deps) => ({
  name: 'get_current_workflow',
  description: '读取当前编辑器中的工作流草稿，包含尚未保存的编辑状态。默认返回摘要，summarize=false 返回完整 data；字符串 "false" 也按 false 处理。',
  inputSchema: schema({ summarize: { type: 'boolean', description: '是否返回摘要，默认 true。' } }),
  annotations: { readOnly: true },
  execute: async (input) => {
    const summarize = booleanInput(asRecord(input), 'summarize', true);
    return {
      success: true,
      data: summarizeWorkflow(deps.draft.current, summarize),
      ...deps.workflowPayload(deps.draft.current, summarize),
    };
  },
});

const searchNodesTool: ToolFactory = (deps) => ({
  name: 'search_nodes',
  description: '在当前工作流中搜索节点，支持 keyword/type/label/category/description 模糊匹配。',
  inputSchema: workflowSearchSchema(),
  annotations: { readOnly: true },
  execute: async (input) => {
    const record = asRecord(input);
    const defs = new Map(deps.ctx.nodeDefinitions.map((definition) => [definition.type, definition]));
    const keyword = stringInput(record, 'keyword')?.toLowerCase();
    const type = stringInput(record, 'type')?.toLowerCase();
    const pluginId = stringInputAny(record, ['pluginId', 'plugin_id', 'plugin'])?.toLowerCase();
    const label = stringInput(record, 'label')?.toLowerCase();
    const category = stringInput(record, 'category')?.toLowerCase();
    const description = stringInput(record, 'description')?.toLowerCase();
    const nodes = deps.draft.current.nodes.filter((node) => {
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
      nodes: searchDefinitions(deps, record).map((definition) => summarizeNodeDefinition(definition)),
    };
  },
});

const listNodeTypesTool: ToolFactory = (deps) => ({
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
    const filtered = searchDefinitions(deps, record);
    const page = Math.max(1, numberInput(record, 'page', 1));
    const pageSize = Math.min(50, Math.max(1, numberInput(record, 'pageSize', numberInput(record, 'page_size', 20))));
    const items = filtered.slice((page - 1) * pageSize, page * pageSize);
    return {
      success: true,
      page,
      page_size: pageSize,
      total: filtered.length,
      available_total: deps.ctx.nodeDefinitions.length,
      nodes: items.map(summarizeNodeDefinition),
    };
  },
});

const searchNodeUsageTool: ToolFactory = (deps) => ({
  name: 'search_node_usage',
  description: '查询当前工作流可用节点类型的具体用法，返回字段说明、句柄、输出和示例 data。准备使用陌生节点前必须调用。',
  inputSchema: workflowSearchSchema(),
  annotations: { readOnly: true },
  execute: async (input) => {
    const nodes = searchDefinitions(deps, asRecord(input));
    return {
      success: true,
      total: nodes.length,
      available_total: deps.ctx.nodeDefinitions.length,
      nodes: nodes.map(describeNodeUsage),
    };
  },
});

const checkWorkflowChainTool: ToolFactory = (deps) => ({
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
    const result = checkRequiredFields(deps.draft.current, startNodeId, deps.definitionByType);
    if (!result.success) return result;
    return {
      ...result,
      message: result.passed ? 'workflow chain required fields check passed' : 'workflow chain has missing required fields',
    };
  },
});

const getNodePropertyTypeDefinitionTool: ToolFactory = () => ({
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
});

/** 按多字段筛选节点定义。 */
function searchDefinitions(
  deps: ToolDeps,
  input: Record<string, unknown>,
) {
  const type = stringInputAny(input, ['type', 'nodeType', 'node_type'])?.toLowerCase();
  const pluginId = stringInputAny(input, ['pluginId', 'plugin_id', 'plugin'])?.toLowerCase();
  const name = stringInput(input, 'name')?.toLowerCase();
  const keyword = stringInput(input, 'keyword')?.toLowerCase();
  const label = stringInput(input, 'label')?.toLowerCase();
  const category = stringInput(input, 'category')?.toLowerCase();
  const description = stringInput(input, 'description')?.toLowerCase();
  return deps.ctx.nodeDefinitions.filter((definition) => {
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
}

function getDefinitionPluginId(definition: unknown): string {
  return definition && typeof definition === 'object' && 'pluginId' in definition && typeof definition.pluginId === 'string'
    ? definition.pluginId
    : '';
}

/** 只读 / 发现类工具。 */
export function createReadTools(deps: ToolDeps): AgentFunctionTool[] {
  return [
    listAvailableAgentCapabilitiesTool(deps),
    listAgentCapabilitiesTool(deps),
    getWorkflowTool(deps),
    getCurrentWorkflowTool(deps),
    searchNodesTool(deps),
    listNodeTypesTool(deps),
    searchNodeUsageTool(deps),
    checkWorkflowChainTool(deps),
    getNodePropertyTypeDefinitionTool(deps),
  ];
}
