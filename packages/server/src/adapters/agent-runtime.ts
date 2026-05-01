/**
 * Agent runtime adapter interface.
 * Mock implementation for MVP — swap in open-agent-sdk later.
 */

export interface AgentRunResult {
  success: boolean;
  summary: string;
  artifacts: string[];
  error?: string;
  output: string[];
}

export interface AgentRuntime {
  execute(prompt: string, workingDir: string, options?: AgentRunOptions): Promise<AgentRunResult>;
  stop(): void;
}

export interface AgentRunOptions {
  maxTurns?: number;
  tools?: string[];
  sandboxDirs?: string[];
}

/**
 * Mock runtime — simulates agent execution with configurable delay.
 * Returns a deterministic result based on the prompt.
 */
export class MockAgentRuntime implements AgentRuntime {
  private aborted = false;

  async execute(prompt: string, workingDir: string, options?: AgentRunOptions): Promise<AgentRunResult> {
    const delay = 500 + Math.random() * 1500;
    const output: string[] = [];

    const steps = [
      `Reading task: ${prompt.slice(0, 80)}...`,
      `Analyzing codebase in ${workingDir}`,
      'Planning modifications...',
      'Executing changes...',
      'Running validation...',
    ];

    for (const step of steps) {
      if (this.aborted) {
        return { success: false, summary: 'Aborted', artifacts: [], error: 'Aborted by user', output };
      }
      output.push(step);
      await sleep(delay / steps.length);
    }

    return {
      success: true,
      summary: `Completed task: ${prompt.slice(0, 60)}`,
      artifacts: [],
      output,
    };
  }

  stop(): void {
    this.aborted = true;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Factory — returns mock runtime now, swap in real implementation later */
export function createAgentRuntime(_provider?: string, _model?: string): AgentRuntime {
  return new MockAgentRuntime();
}
