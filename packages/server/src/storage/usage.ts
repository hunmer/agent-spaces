import type { MessageTokenUsage } from '@agent-spaces/shared';

export function extractUsageFromOutput(output: string[]): MessageTokenUsage {
  const usage: MessageTokenUsage = {};
  for (const line of output.flatMap((item) => item.split(/\r?\n/))) {
    const lower = line.toLowerCase();
    if (!lower.includes('token')) continue;
    const input = line.match(/\bin(?:put)?[=:\s]+([\d,]+)/i)?.[1];
    const outputTokens = line.match(/\bout(?:put)?[=:\s]+([\d,]+)/i)?.[1];
    const total = line.match(/\b(?:total(?: tokens)?|tokens?)[=:\s]+([\d,]+)/i)?.[1];
    const cached = line.match(/\bcached(?: input)?[=:\s]+([\d,]+)/i)?.[1];
    const reasoning = line.match(/\breasoning[=:\s]+([\d,]+)/i)?.[1];
    if (input) usage.inputTokens = parseTokenCount(input);
    if (outputTokens) usage.outputTokens = parseTokenCount(outputTokens);
    if (total) usage.totalTokens = parseTokenCount(total);
    if (cached) usage.cachedInputTokens = parseTokenCount(cached);
    if (reasoning) usage.reasoningTokens = parseTokenCount(reasoning);
  }
  return usage;
}

function parseTokenCount(value: string): number {
  return Number(value.replace(/,/g, '')) || 0;
}

