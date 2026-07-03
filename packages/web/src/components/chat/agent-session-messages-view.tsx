"use client"

import type { ReactNode } from "react"
import { useTranslations } from "next-intl"
import type { AgentUsageSessionMessage, AgentUsageSessionToolCall, MessagePart } from "@agent-spaces/shared"
import { Badge } from "@/components/ui/badge"
import { Markdown } from "@/components/ui/markdown"
import { JsonViewer } from "@/components/viewers/json-viewer"

type ContextPart = Extract<MessagePart, { type: "context" }>

export type SessionTimelineItem =
  | { kind: "user"; key: string; message: AgentUsageSessionMessage }
  | { kind: "tool"; key: string; toolCall: AgentUsageSessionToolCall; message: AgentUsageSessionMessage }
  | { kind: "agent"; key: string; message: AgentUsageSessionMessage }

/**
 * 把会话消息列表拆解成 user / tool / agent 时间线条目。
 * - user 消息原样保留
 * - agent 消息的 toolCalls 展开为独立的 tool 条目，剩余 content 作为 agent 最终回复
 */
export function buildSessionTimelineItems(messages: AgentUsageSessionMessage[]): SessionTimelineItem[] {
  const items: SessionTimelineItem[] = []
  for (const message of messages) {
    if (message.role === "user") {
      items.push({ kind: "user", key: `u-${message.id}`, message })
      continue
    }
    for (const toolCall of message.toolCalls ?? []) {
      items.push({ kind: "tool", key: `t-${toolCall.id}`, toolCall, message })
    }
    if (message.content && message.content.trim().length > 0) {
      items.push({ kind: "agent", key: `a-${message.id}`, message })
    }
  }
  return items
}

export interface AgentSessionMessagesViewProps {
  messages: AgentUsageSessionMessage[]
  /**
   * agent 消息附带 contextPart 时的自定义渲染。
   * 由调用方注入以避免公共组件与上层组件循环依赖。
   */
  renderContextPart?: (part: ContextPart) => ReactNode
  className?: string
}

/**
 * 会话消息时间线统一展示：user / tool / agent 卡片。
 * 抽自 usage-dashboard-session-dialog，供 dashboard 与 context part 复用。
 */
export function AgentSessionMessagesView({
  messages,
  renderContextPart,
  className,
}: AgentSessionMessagesViewProps) {
  const items = buildSessionTimelineItems(messages)
  if (items.length === 0) return null
  return (
    <div className={className ?? "flex flex-col gap-3"}>
      {items.map((item) => (
        <SessionTimelineItem key={item.key} item={item} renderContextPart={renderContextPart} />
      ))}
    </div>
  )
}

function SessionTimelineItem({
  item,
  renderContextPart,
}: {
  item: SessionTimelineItem
  renderContextPart?: (part: ContextPart) => ReactNode
}) {
  if (item.kind === "user") return <UserMessageCard message={item.message} />
  if (item.kind === "tool") return <ToolCallCard toolCall={item.toolCall} message={item.message} />
  return <AgentFinalMessageCard message={item.message} renderContextPart={renderContextPart} />
}

function UserMessageCard({ message }: { message: AgentUsageSessionMessage }) {
  return (
    <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <Badge variant="secondary">user</Badge>
        <span className="text-[10px] text-muted-foreground">
          {new Date(message.createdAt).toLocaleString()}
        </span>
      </div>
      <div className="rounded-md bg-background/80 px-3 py-2 text-sm">
        <Markdown content={message.content} />
      </div>
      <SessionMessageMeta message={message} />
    </div>
  )
}

function ToolCallCard({
  toolCall,
  message,
}: {
  toolCall: AgentUsageSessionToolCall
  message: AgentUsageSessionMessage
}) {
  const t = useTranslations("home")
  return (
    <div className="ml-6 space-y-2 rounded-lg border bg-background/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline">tool</Badge>
          <Badge variant="outline">{toolCall.toolName || toolCall.title}</Badge>
          {toolCall.status ? (
            <Badge variant={toolCall.status === "success" ? "secondary" : "outline"}>{toolCall.status}</Badge>
          ) : null}
        </div>
        <span className="text-[10px] text-muted-foreground">
          {toolCall.createdAt ? new Date(toolCall.createdAt).toLocaleString() : new Date(message.createdAt).toLocaleString()}
        </span>
      </div>
      {toolCall.title && toolCall.title !== toolCall.toolName ? (
        <div className="text-xs text-muted-foreground">{toolCall.title}</div>
      ) : null}
      {toolCall.input !== undefined ? (
        <div>
          <div className="mb-1 text-[11px] text-muted-foreground">{t("sessionDetail.toolInput")}</div>
          <ToolCallValue value={toolCall.input} rootName="input" />
        </div>
      ) : null}
      {toolCall.result !== undefined ? (
        <div className="mt-2">
          <div className="mb-1 text-[11px] text-muted-foreground">{t("sessionDetail.toolResult")}</div>
          <ToolCallValue value={toolCall.result} rootName="result" />
        </div>
      ) : null}
    </div>
  )
}

function AgentFinalMessageCard({
  message,
  renderContextPart,
}: {
  message: AgentUsageSessionMessage
  renderContextPart?: (part: ContextPart) => ReactNode
}) {
  return (
    <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <Badge variant="default">agent</Badge>
        <span className="text-[10px] text-muted-foreground">
          {new Date(message.createdAt).toLocaleString()}
        </span>
      </div>
      <div className="rounded-md bg-background/80 px-3 py-2 text-sm">
        <Markdown content={message.content} />
      </div>
      {message.contextPart && renderContextPart ? renderContextPart(message.contextPart) : null}
      <SessionMessageMeta message={message} />
    </div>
  )
}

function SessionMessageMeta({ message }: { message: AgentUsageSessionMessage }) {
  if (!message.sourceChannelName && !message.metadata?.runtimeSessionId && !message.metadata?.runtime) {
    return null
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[10px] text-muted-foreground">
      {message.sourceChannelName ? <Badge variant="outline">{message.sourceChannelName}</Badge> : null}
      {message.metadata?.runtime ? <Badge variant="outline">{message.metadata.runtime}</Badge> : null}
      {message.metadata?.runtimeSessionId ? <span className="font-mono">{message.metadata.runtimeSessionId}</span> : null}
    </div>
  )
}

function ToolCallValue({ value, rootName }: { value: unknown; rootName: string }) {
  if (typeof value === "string") {
    return (
      <pre className="overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-2 text-xs leading-5">
        {value}
      </pre>
    )
  }

  return (
    <JsonViewer
      data={(value ?? null) as never}
      title={rootName}
      defaultExpanded={1}
      rootName={rootName}
    />
  )
}
