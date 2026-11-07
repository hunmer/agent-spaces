import type { AgentConfig } from '@agent-spaces/shared';

export interface WorkflowTemplatePreset {
  id: string;
  name: string;
  description: string;
  category?: string;
  data: {
    name: string;
    description: string;
    nodes: {
      id: string;
      type: string;
      position: { x: number; y: number };
      data: { label: string; role: string; modelId: string; [k: string]: unknown };
    }[];
    edges: { id: string; source: string; target: string }[];
    agents: Record<string, Omit<AgentConfig, 'apiKey'>>;
  };
}
