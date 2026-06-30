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
