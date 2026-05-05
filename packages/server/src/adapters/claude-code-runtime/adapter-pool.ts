import type { AgentRuntimeConfig } from '../agent-runtime-types.js';
import type { ClaudeAdapterRun, SharedClaudeAdapter } from './types.js';
import { isAnthropicBridgeProvider, formatBridgeProvider } from './types.js';
import { createAnthropicBridgeServer, findAvailablePort, listen, closeServer } from './anthropic-bridge.js';

const activeClaudeAdapters = new Map<string, SharedClaudeAdapter>();

export async function startClaudeAdapterIfNeeded(config: AgentRuntimeConfig): Promise<ClaudeAdapterRun | null> {
  if (!isAnthropicBridgeProvider(config.provider)) return null;
  const adapterBaseURL = config.adapterBaseURL?.trim() || config.baseURL?.trim();
  if (!adapterBaseURL) throw new Error(`apiBase is required for ${formatBridgeProvider(config.provider)}`);
  if (!config.apiKey?.trim()) throw new Error(`apiKey is required for ${formatBridgeProvider(config.provider)}`);
  if (!config.model?.trim()) throw new Error(`modelId is required for ${formatBridgeProvider(config.provider)}`);

  const adapterConfig = {
    provider: config.provider,
    baseUrl: adapterBaseURL,
    apiKey: config.apiKey,
    model: config.model,
  };
  const key = JSON.stringify(adapterConfig);
  const existing = activeClaudeAdapters.get(key);
  if (existing) {
    existing.refs += 1;
    return {
      url: existing.url,
      release: () => releaseClaudeAdapter(existing.key),
    };
  }

  const server = createAnthropicBridgeServer(adapterConfig);
  const port = await findAvailablePort(3080);
  const url = await listen(server, port);
  const adapter: SharedClaudeAdapter = {
    key,
    server,
    url,
    refs: 1,
  };
  activeClaudeAdapters.set(key, adapter);
  return {
    url,
    release: () => releaseClaudeAdapter(key),
  };
}

async function releaseClaudeAdapter(key: string): Promise<void> {
  const adapter = activeClaudeAdapters.get(key);
  if (!adapter) return;
  adapter.refs -= 1;
  if (adapter.refs > 0) return;
  activeClaudeAdapters.delete(key);
  await closeServer(adapter.server);
}

export function getClaudeCodeModel(config: AgentRuntimeConfig): string | undefined {
  if (isAnthropicBridgeProvider(config.provider)) {
    return process.env.CLAUDE_CODE_MODEL || undefined;
  }
  return config.model;
}
