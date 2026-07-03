"use client"

import { useMemo } from "react"
import { useTranslations } from "next-intl"
import type { AgentUsageSessionMessage, MessagePart } from "@agent-spaces/shared"
import { Badge } from "@/components/ui/badge"
import { AgentSessionMessagesView } from "./agent-session-messages-view"
import { TokenMetric, formatPercent, toContextUsage, type ContextPart } from "./message-context-panel"

type OutputItem = NonNullable<NonNullable<Extract<MessagePart, { type: "context" }>["agentContext"]>["outputItems"]>[number]

/**
 * 把 context part 的 agentContext（systemPrompt / userPrompt / fullPrompt / output / outputItems）
 * 拆解成会话消息列表，工具调用展开为独立的 tool call，最终输出作为 agent 回复。
 */
export function contextPartToSessionMessages(part: ContextPart): AgentUsageSessionMessage[] {
  const agent = part.agentContext
  const messages: AgentUsageSessionMessage[] = []
  const zeroTs = new Date(0).toISOString()

  const pushText = (content: string | undefined, role: "user" | "agent", suffix: string) => {
    const text = content?.trim()
    if (!text) return
    messages.push({ id: `${part.id}-${suffix}`, role, content: text, createdAt: zeroTs })
  }

  pushText(agent?.systemPrompt, "agent", "system")
  pushText(agent?.userPrompt, "user", "user")
  pushText(agent?.fullPrompt, "agent", "full")

  const outputItems = agent?.outputItems
  const toolCalls = outputItemsToToolCalls(outputItems)
  const outputText = collectOutputText(outputItems) ?? agent?.output?.trim()

  if (outputText || toolCalls.length) {
    messages.push({
      id: `${part.id}-output`,
      role: "agent",
      content: outputText || "",
      createdAt: zeroTs,
      toolCalls,
    })
  }

  return messages
}

/**
 * 单个 context part 的统一展示：顶部 agent 信息 + token 网格 + 会话消息时间线（工具按顺序调用）。
 */
export function ContextPartChatView({ part }: { part: ContextPart }) {
  const t = useTranslations("home")
  const usage = toContextUsage(part)
  const effectiveTokens = usage.inputTokens + usage.outputTokens + usage.reasoningTokens
  const cacheShare = usage.totalTokens > 0 ? usage.cachedInputTokens / usage.totalTokens : 0
  const messages = useMemo(() => contextPartToSessionMessages(part), [part])

  return (
    <div className="rounded-md border p-3">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{part.agentContext?.name || part.agentContext?.role || "Agent"}</Badge>
        {part.agentContext?.runtime ? <Badge variant="outline">{part.agentContext.runtime}</Badge> : null}
        {(part.agentContext?.model || part.modelId) ? <Badge variant="outline">{part.agentContext?.model || part.modelId}</Badge> : null}
        {part.agentContext?.sessionId ? <span className="font-mono text-[11px] text-muted-foreground">{part.agentContext.sessionId}</span> : null}
      </div>
      <div className="mb-3 grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <TokenMetric label={t("sessionDetail.effectiveContext")} value={effectiveTokens} emphasize />
        <TokenMetric label={t("sessionDetail.totalUsageWithCache")} value={usage.totalTokens} />
        <TokenMetric label={t("sessionDetail.newInput")} value={usage.inputTokens} />
        <TokenMetric label={t("sessionDetail.output")} value={usage.outputTokens} />
        <TokenMetric label={t("sessionDetail.reasoning")} value={usage.reasoningTokens} />
        <TokenMetric label={t("sessionDetail.cachedInput")} value={usage.cachedInputTokens} helper={`${formatPercent(cacheShare)} of total`} />
      </div>
      {messages.length ? (
        <AgentSessionMessagesView messages={messages} />
      ) : (
        <div className="flex h-20 items-center justify-center text-sm text-muted-foreground">
          {t("sessionDetail.empty")}
        </div>
      )}
    </div>
  )
}

function outputItemsToToolCalls(items?: OutputItem[]): NonNullable<AgentUsageSessionMessage["toolCalls"]> {
  if (!items?.length) return []
  const result: NonNullable<AgentUsageSessionMessage["toolCalls"]> = []
  for (const item of items) {
    if (item.type === "tool_use") {
      result.push({
        id: item.toolUseId || item.id,
        title: item.title || item.toolName || "tool",
        toolName: item.toolName,
        status: "success",
        input: safeParseJson(item.text),
      })
    } else if (item.type === "tool_result") {
      const value = safeParseJson(item.text)
      result.push({
        id: item.toolUseId || item.id,
        title: item.title || "tool_result",
        toolName: item.toolName || "tool_result",
        status: "success",
        input: value,
        result: value,
      })
    }
  }
  return result
}

function collectOutputText(items?: OutputItem[]): string | undefined {
  if (!items?.length) return undefined
  const texts = items
    .filter((item) => item.type === "output")
    .map((item) => item.text)
    .filter((text): text is string => Boolean(text?.trim()))
  return texts.length ? texts.join("\n\n") : undefined
}

function safeParseJson(text?: string): unknown {
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}
