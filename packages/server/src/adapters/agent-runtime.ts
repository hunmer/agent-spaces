/**
 * Agent runtime adapter interface and factory.
 */

import type { AgentRuntime, AgentRuntimeConfig } from './agent-runtime-types.js';
import { HermesRuntime } from './hermes-runtime.js';
import { LangChainRuntime } from './langchain-runtime.js';
import { PiRuntime } from './pi-runtime.js';

export type {
  AgentRunOptions,
  AgentRunResult,
  AgentRuntime,
  AgentRuntimeConfig,
  AgentRuntimeKind,
} from './agent-runtime-types.js';
export { HermesRuntime } from './hermes-runtime.js';
export { GrokRuntime } from './grok-runtime.js';
export { GeminiCliRuntime } from './gemini-cli-runtime.js';
export { LangChainRuntime } from './langchain-runtime.js';
export { PiRuntime } from './pi-runtime.js';

class LazyAgentRuntime implements AgentRuntime {
  private runtimePromise: Promise<AgentRuntime> | null = null;
  private runtime: AgentRuntime | null = null;

  constructor(private readonly loader: () => Promise<AgentRuntime>) {}

  async execute(
    prompt: string,
    workingDir: string,
    options?: import('./agent-runtime-types.js').AgentRunOptions,
  ) {
    const runtime = await this.load();
    return runtime.execute(prompt, workingDir, options);
  }

  stop(): void {
    this.runtime?.stop();
  }

  private async load(): Promise<AgentRuntime> {
    if (this.runtime) return this.runtime;
    if (!this.runtimePromise) {
      this.runtimePromise = this.loader().then((runtime) => {
        this.runtime = runtime;
        return runtime;
      });
    }
    return this.runtimePromise;
  }
}

export function createAgentRuntime(config?: AgentRuntimeConfig): AgentRuntime;
export function createAgentRuntime(provider?: string, model?: string): AgentRuntime;
export function createAgentRuntime(
  configOrProvider: AgentRuntimeConfig | string = {},
  model?: string,
): AgentRuntime {
  const config =
    typeof configOrProvider === 'string'
      ? { provider: configOrProvider, model }
      : configOrProvider;

  switch (config.kind ?? 'langchain') {
    case 'open-agent-sdk':
      return new LazyAgentRuntime(async () => {
        const { OpenAgentSdkRuntime } = await import('./open-agent-sdk-runtime.js');
        return new OpenAgentSdkRuntime(config);
      });
    case 'claude-code':
      return new LazyAgentRuntime(async () => {
        const { ClaudeCodeRuntime } = await import('./claude-code-runtime/index.js');
        return new ClaudeCodeRuntime(config);
      });
    case 'codex':
      return new LazyAgentRuntime(async () => {
        const { CodexRuntime } = await import('./codex-runtime.js');
        return new CodexRuntime(config);
      });
    case 'grok':
      return new LazyAgentRuntime(async () => {
        const { GrokRuntime } = await import('./grok-runtime.js');
        return new GrokRuntime(config);
      });
    case 'gemini-cli':
      return new LazyAgentRuntime(async () => {
        const { GeminiCliRuntime } = await import('./gemini-cli-runtime.js');
        return new GeminiCliRuntime(config);
      });
    case 'langchain':
      return new LangChainRuntime(config);
    case 'hermes':
      return new HermesRuntime(config);
    case 'pi':
      return new PiRuntime(config);
  }
}
