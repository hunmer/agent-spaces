import type { AgentConfig } from '@agent-spaces/shared';
import { listModels } from '../storage/llm-store.js';
import type { AgentRuntimeConfig } from '../adapters/agent-runtime-types.js';

export function getThinkingRuntimeConfig(preset: AgentConfig): Pick<AgentRuntimeConfig, 'thinkingEnabled' | 'thinkingEffort'> {
  const modelId = preset.modelId?.trim();
  if (!modelId) {
    return {
      thinkingEnabled: true,
      thinkingEffort: 'medium',
    };
  }

  const model = listModels().find((item) => item.modelId === modelId || item.name === modelId);
  return {
    thinkingEnabled: model?.thinkingEnabled ?? true,
    thinkingEffort: model?.thinkingEffort ?? 'medium',
  };
}
