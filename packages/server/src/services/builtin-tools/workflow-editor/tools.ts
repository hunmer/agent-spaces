import type { Workflow } from '@agent-spaces/shared';
import type { AgentFunctionTool } from '../../../adapters/agent-runtime-types.js';
import {
  asRecord,
  clone,
  cloneWorkflow,
  stringInput,
} from './helpers.js';
import { summarizeWorkflow } from './summary.js';
import { createReadTools } from './tools-read.js';
import { createEditTools } from './tools-edit.js';
import { createDryRunTool } from './tools-run.js';
import type { JsonRecord, ToolDeps, WorkflowEditorFunctionTools, WorkflowEditorToolContext } from './types.js';

export type { WorkflowEditorFunctionTools, WorkflowEditorToolContext } from './types.js';

function workflowResult(success: boolean, message: string, results?: unknown[], meta?: JsonRecord) {
  return {
    success,
    message,
    ...meta,
    results,
  };
}

export function createWorkflowEditorFunctionTools(ctx: WorkflowEditorToolContext): WorkflowEditorFunctionTools {
  const versions = new Map<string, Pick<Workflow, 'nodes' | 'edges'>>();
  const draft = { current: cloneWorkflow(ctx.workflow) };

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
    draft.current = {
      ...next,
      nodes: clone(next.nodes),
      edges: clone(next.edges),
      updatedAt: Date.now(),
    };
    return workflowResult(true, 'updated', undefined, {
      ...workflowPayload(draft.current, false),
      ...meta,
    });
  };

  const definitionByType = new Map(ctx.nodeDefinitions.map((definition) => [definition.type, definition]));

  const deps: ToolDeps = {
    ctx,
    draft,
    versions,
    definitionByType,
    commit,
    workflowPayload,
  };

  // 按功能分组装配各工具模块
  const tools: AgentFunctionTool[] = [
    ...createReadTools(deps),
    ...createEditTools(deps),
    createDryRunTool(deps),
    {
      name: 'batch_update',
      description: '批量执行 create_node/update_node/delete_node/create_edge/delete_edge 操作。',
      inputSchema: {
        type: 'object',
        properties: {
          operations: {
            type: 'array',
            description: '每项为 { tool, args }。',
            items: { type: 'object', properties: { tool: { type: 'string' }, args: { type: 'object', properties: {} } } },
          },
        },
        required: ['operations'],
      },
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
  ];

  return Object.assign(tools, {
    getDraftWorkflow: () => cloneWorkflow(draft.current),
  });
}
