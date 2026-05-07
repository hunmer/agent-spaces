import type { AgentConfig } from './workspace.js';

export interface WorkflowTemplate {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  viewport?: { x: number; y: number; zoom: number };
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowNode {
  id: string;
  type: 'agent';
  position: { x: number; y: number };
  data: {
    label: string;
    agentConfigId: string;
    role: AgentConfig['role'];
    avatarUrl?: string;
    modelId?: string;
    taskTitleTemplate?: string;
    taskDescriptionTemplate?: string;
  };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
}
