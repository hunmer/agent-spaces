"use client"

import type { MessagePart } from "@agent-spaces/shared"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

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

export function AgentContextPanel({ part }: { part: ContextPart }) {
  const agent = part.agentContext
  const usage = toContextUsage(part)
  const effectiveTokens = usage.inputTokens + usage.outputTokens + usage.reasoningTokens
  const cacheShare = usage.totalTokens > 0 ? usage.cachedInputTokens / usage.totalTokens : 0
  const outputValue = formatOutputItems(agent?.outputItems) ?? agent?.output
  const outputStats = getOutputItemsStats(agent?.outputItems) ?? getTextStats(agent?.output)
  const textBlocks = [
    { key: "systemPrompt", title: "提示词信息", value: agent?.systemPrompt, empty: "此 agent 未配置独立 system prompt。" },
    { key: "userPrompt", title: "输入信息", value: agent?.userPrompt, empty: "旧消息未记录用户输入。" },
    { key: "fullPrompt", title: "完整上下文", value: agent?.fullPrompt, empty: "旧消息未记录完整 prompt。" },
    { key: "output", title: "输出信息", value: outputValue, empty: "暂无输出信息。", stats: outputStats },
  ].map((block) => ({ ...block, stats: block.stats ?? getTextStats(block.value) }))
  const totalBlockTokens = textBlocks.reduce((sum, block) => sum + block.stats.tokens, 0)

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{agent?.name || agent?.role || "Agent"}</Badge>
        {agent?.runtime ? <Badge variant="outline">{agent.runtime}</Badge> : null}
        {(agent?.model || part.modelId) ? <Badge variant="outline">{agent?.model || part.modelId}</Badge> : null}
        {agent?.sessionId ? <span className="font-mono text-[11px] text-muted-foreground">{agent.sessionId}</span> : null}
      </div>
      <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <TokenMetric label="有效上下文" value={effectiveTokens} helper="输入 + 输出 + 推理，不含缓存命中" emphasize />
        <TokenMetric label="总用量（含缓存）" value={usage.totalTokens} helper="provider usage total" />
        <TokenMetric label="新输入" value={usage.inputTokens} />
        <TokenMetric label="输出" value={usage.outputTokens} />
        <TokenMetric label="推理" value={usage.reasoningTokens} />
        <TokenMetric label="缓存输入" value={usage.cachedInputTokens} helper={`${formatPercent(cacheShare)} of total`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ContextTextBlock key={textBlocks[0].key} title={textBlocks[0].title} value={textBlocks[0].value} empty={textBlocks[0].empty} stats={textBlocks[0].stats} totalTokens={totalBlockTokens} />
        <ContextTextBlock key={textBlocks[1].key} title={textBlocks[1].title} value={textBlocks[1].value} empty={textBlocks[1].empty} stats={textBlocks[1].stats} totalTokens={totalBlockTokens} />
      </div>
      <div className="flex flex-1 flex-col gap-4 min-h-0">
        <ContextTextBlock key={textBlocks[2].key} title={textBlocks[2].title} value={textBlocks[2].value} empty={textBlocks[2].empty} stats={textBlocks[2].stats} totalTokens={totalBlockTokens} />
        <ContextTextBlock key={textBlocks[3].key} title={textBlocks[3].title} value={textBlocks[3].value} empty={textBlocks[3].empty} stats={textBlocks[3].stats} totalTokens={totalBlockTokens} />
      </div>
    </div>
  )
}

function TokenMetric({ label, value, helper, emphasize }: { label: string; value?: number; helper?: string; emphasize?: boolean }) {
  return (
    <div className={cn("rounded-md border bg-muted/30 p-3", emphasize && "border-primary/30 bg-primary/5")}>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={cn("mt-1 font-mono text-sm", emphasize && "font-semibold text-primary")}>{formatTokenCount(value ?? 0)}</div>
      {helper ? <div className="mt-1 text-[10px] text-muted-foreground">{helper}</div> : null}
    </div>
  )
}

function ContextTextBlock({
  title,
  value,
  empty,
  stats,
  totalTokens,
}: {
  title: string
  value?: string
  empty: string
  stats: TextStats
  totalTokens: number
}) {
  const percent = totalTokens > 0 ? stats.tokens / totalTokens : 0

  return (
    <section className="min-w-0 overflow-hidden flex flex-col gap-2">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-medium text-muted-foreground">{title}</h4>
        <div className="flex flex-wrap items-center justify-end gap-1.5 font-mono text-[10px] text-muted-foreground">
          <span>{formatPercent(percent)}</span>
          <span>{formatTokenCount(stats.characters)} 字</span>
          <span>{formatTokenCount(stats.tokens)} tokens</span>
        </div>
      </div>
      <pre className={cn(
        "min-w-0 flex-1 min-h-0 whitespace-pre-wrap break-words rounded-md border bg-muted/30 p-3 font-mono text-xs leading-relaxed text-foreground overflow-auto",
        !value?.trim() && "text-muted-foreground",
        !value?.trim() && "text-muted-foreground",
      )}>
        {value?.trim() || empty}
      </pre>
    </section>
  )
}

interface TextStats {
  characters: number
  tokens: number
}

function formatOutputItems(items?: NonNullable<NonNullable<ContextPart["agentContext"]>["outputItems"]>) {
  if (!items?.length) return undefined
  return JSON.stringify(items.map((item) => ({
    id: item.id,
    type: item.type,
    title: item.title,
    toolUseId: item.toolUseId,
    toolName: item.toolName,
    characters: item.characters,
    tokens: item.tokens,
    text: item.text,
  })), null, 2)
}

function getOutputItemsStats(items?: NonNullable<NonNullable<ContextPart["agentContext"]>["outputItems"]>): TextStats | undefined {
  if (!items?.length) return undefined
  return items.reduce<TextStats>((stats, item) => ({
    characters: stats.characters + (item.characters ?? 0),
    tokens: stats.tokens + (item.tokens ?? 0),
  }), { characters: 0, tokens: 0 })
}

function getTextStats(value?: string): TextStats {
  const text = value?.trim() ?? ""
  if (!text) return { characters: 0, tokens: 0 }
  return {
    characters: Array.from(text).length,
    tokens: estimateTextTokens(text),
  }
}

function estimateTextTokens(text: string) {
  const cjkChars = text.match(/[㐀-鿿豈-﫿]/g)?.length ?? 0
  const nonCjkText = text.replace(/[㐀-鿿豈-﫿]/g, " ")
  const words = nonCjkText.match(/[A-Za-z0-9_]+|[^\sA-Za-z0-9_]/g)?.length ?? 0
  return Math.max(1, Math.ceil(cjkChars + words * 0.75))
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value)
}

function formatTokenCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value)
}
