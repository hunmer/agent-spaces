import type { NodeTypeDefinition, Workflow } from '@agent-spaces/shared';
import type { AgentFunctionTool } from '../../../adapters/agent-runtime-types.js';

export type JsonRecord = Record<string, unknown>;

export interface WorkflowEditorToolContext {
  workspaceId?: string;
  workflow: Workflow;
  nodeDefinitions: NodeTypeDefinition[];
}

export type WorkflowEditorFunctionTools = AgentFunctionTool[] & {
  getDraftWorkflow: () => Workflow;
};

/**
 * 工具模块间共享的可变状态与上下文。
 * `draft` 与 `versions` 是闭包可变状态，通过此对象在各工具模块间共享。
 */
export interface ToolDeps {
  ctx: WorkflowEditorToolContext;
  /** 当前编辑器草稿（可变，被各工具读写）。 */
  draft: { current: Workflow };
  /** 会话内创建的版本快照。 */
  versions: Map<string, Pick<Workflow, 'nodes' | 'edges'>>;
  /** 按 type 索引的节点定义表。 */
  definitionByType: Map<string, NodeTypeDefinition>;
  /** 把更新写入草稿并返回标准结果。 */
  commit: (next: Workflow, meta?: JsonRecord) => Record<string, unknown>;
  /** 构造 workflow 摘要 / patch 载荷。 */
  workflowPayload: (workflow: Workflow, summarize: boolean) => Record<string, unknown>;
}

