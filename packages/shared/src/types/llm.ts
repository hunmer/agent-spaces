export interface LLMModel {
  id: string;
  modelId: string;
  name: string;
  provider: string;
  cost?: LLMModelCost;
  maxContextTokens?: number;
  thinkingEnabled: boolean;
  thinkingEffort: LLMThinkingEffort;
  vision: boolean;
  reasoning: boolean;
  embedding: boolean;
}

export type LLMThinkingEffort = 'low' | 'medium' | 'high';

export interface LLMModelCost {
  inputPerMillion: number;
  outputPerMillion: number;
}

export interface LLMProvider {
  id: string;
  name: string;
  apiBase: string;
  apiKey: string;
  createdAt: string;
  updatedAt: string;
}
