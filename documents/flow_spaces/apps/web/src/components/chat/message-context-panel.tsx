"use client"

import type { MessagePart } from "@agent-spaces/shared"
import { cn } from "@/lib/utils"

type ContextPart = Extract<MessagePart, { type: "context" }>

export { type ContextPart }

export function toContextUsage(part: ContextPart) {
  return {
    inputTokens: part.usage?.inputTokens ?? 0,
    outputTokens: part.usage?.outputTokens ?? 0,
    totalTokens: part.usage?.totalTokens ?? part.usedTokens,
    cachedInputTokens: part.usage?.cachedInputTokens ?? 0,
    reasoningTokens: part.usage?.reasoningTokens ?? 0,
    inputTokenDetails: {
      noCacheTokens: undefined,
      cacheReadTokens: undefined,
      cacheWriteTokens: undefined,
    },
    outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined },
  }
}

export function aggregateTokenUsage(parts: ContextPart[]) {
  return parts.reduce((usage, part) => ({
    inputTokens: usage.inputTokens + (part.usage?.inputTokens ?? 0),
    outputTokens: usage.outputTokens + (part.usage?.outputTokens ?? 0),
    totalTokens: usage.totalTokens + (part.usage?.totalTokens ?? part.usedTokens),
    cachedInputTokens: usage.cachedInputTokens + (part.usage?.cachedInputTokens ?? 0),
    reasoningTokens: usage.reasoningTokens + (part.usage?.reasoningTokens ?? 0),
  }), {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cachedInputTokens: 0,
    reasoningTokens: 0,
  })
}

export function TokenMetric({ label, value, helper, emphasize }: { label: string; value?: number; helper?: string; emphasize?: boolean }) {
  return (
    <div className={cn("rounded-md border bg-muted/30 p-3", emphasize && "border-primary/30 bg-primary/5")}>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={cn("mt-1 font-mono text-sm", emphasize && "font-semibold text-primary")}>{formatTokenCount(value ?? 0)}</div>
      {helper ? <div className="mt-1 text-[10px] text-muted-foreground">{helper}</div> : null}
    </div>
  )
}

export function formatPercent(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value)
}

export function formatTokenCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value)
}
