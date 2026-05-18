"use client"

import type { Message, MessagePart } from "@agent-spaces/shared"
import type { LucideIcon } from "lucide-react"
import { BookOpenIcon, BotIcon, CheckIcon, CheckCircle2Icon, ChevronDownIcon, CircleIcon, CopyIcon, FileEditIcon, FileTextIcon, FolderSearchIcon, GlobeIcon, HelpCircleIcon, MessageSquareTextIcon, PencilIcon, CircleHelpIcon, SearchIcon, SquareCheckIcon, TerminalIcon, WrenchIcon, WebhookIcon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { Markdown } from "@/components/ui/markdown"
import { Loader } from "@/components/ui/loader"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useEditorStore } from "@/stores/editor"
import { useLLMStore } from "@/stores/llm"
import { cn } from "@/lib/utils"
import { DiffViewer } from "@/components/git/diff-viewer"
import {
  Agent,
  AgentContent,
  AgentHeader,
  AgentInstructions,
  AgentTool,
  AgentTools,
} from "./subagent"
import {
  Attachment,
  AttachmentInfo,
  AttachmentPreview,
  Attachments,
  type AttachmentData,
} from "./attachments"
import {
  Confirmation,
  ConfirmationAccepted,
  ConfirmationActions,
  ConfirmationAction,
  ConfirmationRejected,
  ConfirmationRequest,
  ConfirmationTitle,
} from "./confirmation"
import {
  Context,
  ContextCacheUsage,
  ContextContent,
  ContextContentBody,
  ContextContentFooter,
  ContextContentHeader,
  ContextInputUsage,
  ContextOutputUsage,
  ContextReasoningUsage,
  ContextTrigger,
} from "./context"
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
} from "./chain-of-thought"
import { Terminal } from "./terminal"
import { ReadonlyCodeBlock } from "./readonly-code-block"

interface MessagePartsProps {
  message: Message
  isUser: boolean
  workspaceId: string
}

export function MessageParts({ message, isUser, workspaceId }: MessagePartsProps) {
  const t = useTranslations('chat')
  const messageParts = message.parts ?? []
  const parts = messageParts.filter((part) => part.type !== "context")
  const hasTextPart = parts.some((part) => part.type === "text")
  const shouldRenderLegacyContent = messageParts.length === 0 && message.content

  return (
    <div className="space-y-3 min-w-0 overflow-hidden">
      {message.attachments?.length ? (
        <MessageAttachments attachments={message.attachments} isUser={isUser} />
      ) : null}
      {parts.length > 0 ? parts.map((part) => (
        <MessagePartView key={part.id} part={dedupeDisplayPart(part)} message={message} workspaceId={workspaceId} />
      )) : null}
      {!hasTextPart && shouldRenderLegacyContent ? (
        isUser ? <UserContent content={message.content} /> : <Markdown content={dedupeRepeatedTextBlock(message.content)} />
      ) : null}
      {message.status === "pending" && parts.length === 0 ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader size={14} />
          <span>{t('messageParts.agentProcessing')}</span>
        </div>
      ) : null}
    </div>
  )
}

export function MessageContextUsage({ message }: { message: Message }) {
  const contextParts = useMemo(() => message.parts?.filter((item) => item.type === "context") ?? [], [message.parts])
  const part = contextParts[contextParts.length - 1]
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [activeAgentId, setActiveAgentId] = useState<string | undefined>()
  const models = useLLMStore((state) => state.models)
  const ensureModels = useLLMStore((state) => state.ensure)
  const configuredModel = part?.modelId
    ? models.find((model) => model.modelId === part.modelId || model.name === part.modelId)
    : undefined
  const maxTokens = configuredModel?.maxContextTokens ?? part?.maxTokens

  useEffect(() => {
    if (!part) return
    void ensureModels()
  }, [ensureModels, part])

  if (!part || !maxTokens) return null

  const totalUsedTokens = contextParts.reduce((sum, item) => sum + item.usedTokens, 0)
  const aggregateUsage = aggregateTokenUsage(contextParts)
  const overviewPart = contextParts.length > 1
    ? {
        ...part,
        usedTokens: totalUsedTokens,
        usage: aggregateUsage,
      }
    : part
  const overviewUsage = toContextUsage(overviewPart)
  const selectedAgent = contextParts.find((item) => item.id === activeAgentId) ?? contextParts[0]

  return (
    <>
      <Context
        usedTokens={overviewPart.usedTokens}
        maxTokens={maxTokens}
        modelId={overviewPart.modelId}
        usage={overviewUsage}
      >
        <ContextTrigger className="h-5 gap-1 px-1.5 text-[10px]" onClick={() => setDetailsOpen(true)} />
        <ContextContent>
          <ContextContentHeader />
          <ContextContentBody className="space-y-2">
            <ContextInputUsage />
            <ContextOutputUsage />
            <ContextReasoningUsage />
            <ContextCacheUsage />
          </ContextContentBody>
          <ContextContentFooter />
        </ContextContent>
      </Context>
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="!w-[min(920px,calc(100vw-2rem))] !max-w-[min(920px,calc(100vw-2rem))] gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle className="text-base">Agent 上下文结构</DialogTitle>
            <DialogDescription className="text-xs">
              此条消息包含 {contextParts.length} 次 agent 运行。选择 tab 查看提示词、输入、输出和 token 消耗。
            </DialogDescription>
          </DialogHeader>
          {contextParts.length ? (
            <Tabs
              value={selectedAgent?.id}
              onValueChange={setActiveAgentId}
              className="min-h-0 gap-0"
            >
              <div className="border-b px-5 py-3">
                <ScrollArea className="w-full">
                  <TabsList className="h-8 max-w-full justify-start overflow-x-auto rounded-md">
                    {contextParts.map((item, index) => (
                      <TabsTrigger key={item.id} value={item.id} className="max-w-44 px-2 text-xs">
                        <BotIcon className="size-3.5" />
                        <span className="truncate">{item.agentContext?.name || item.agentContext?.role || `Agent ${index + 1}`}</span>
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </ScrollArea>
              </div>
              <ScrollArea className="max-h-[min(68vh,720px)]">
                {contextParts.map((item) => (
                  <TabsContent key={item.id} value={item.id} className="m-0 p-5">
                    <AgentContextPanel part={item} />
                  </TabsContent>
                ))}
              </ScrollArea>
            </Tabs>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}

type ContextPart = Extract<MessagePart, { type: "context" }>

function toContextUsage(part: ContextPart) {
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

function aggregateTokenUsage(parts: ContextPart[]) {
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

function AgentContextPanel({ part }: { part: ContextPart }) {
  const agent = part.agentContext
  const usage = toContextUsage(part)
  const textBlocks = [
    { key: "systemPrompt", title: "提示词信息", value: agent?.systemPrompt, empty: "此 agent 未配置独立 system prompt。" },
    { key: "userPrompt", title: "输入信息", value: agent?.userPrompt, empty: "旧消息未记录用户输入。" },
    { key: "fullPrompt", title: "完整上下文", value: agent?.fullPrompt, empty: "旧消息未记录完整 prompt。", tall: true },
    { key: "output", title: "输出信息", value: agent?.output, empty: "暂无输出信息。", tall: true },
  ].map((block) => ({ ...block, stats: getTextStats(block.value) }))
  const totalBlockTokens = textBlocks.reduce((sum, block) => sum + block.stats.tokens, 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{agent?.name || agent?.role || "Agent"}</Badge>
        {agent?.runtime ? <Badge variant="outline">{agent.runtime}</Badge> : null}
        {(agent?.model || part.modelId) ? <Badge variant="outline">{agent?.model || part.modelId}</Badge> : null}
        {agent?.sessionId ? <span className="font-mono text-[11px] text-muted-foreground">{agent.sessionId}</span> : null}
      </div>
      <div className="grid gap-2 sm:grid-cols-5">
        <TokenMetric label="总 token" value={usage.totalTokens} />
        <TokenMetric label="输入" value={usage.inputTokens} />
        <TokenMetric label="输出" value={usage.outputTokens} />
        <TokenMetric label="推理" value={usage.reasoningTokens} />
        <TokenMetric label="缓存输入" value={usage.cachedInputTokens} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ContextTextBlock {...textBlocks[0]} totalTokens={totalBlockTokens} />
        <ContextTextBlock {...textBlocks[1]} totalTokens={totalBlockTokens} />
      </div>
      <ContextTextBlock {...textBlocks[2]} totalTokens={totalBlockTokens} />
      <ContextTextBlock {...textBlocks[3]} totalTokens={totalBlockTokens} />
    </div>
  )
}

function TokenMetric({ label, value }: { label: string; value?: number }) {
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-sm">{formatTokenCount(value ?? 0)}</div>
    </div>
  )
}

function ContextTextBlock({
  title,
  value,
  empty,
  tall,
  stats,
  totalTokens,
}: {
  title: string
  value?: string
  empty: string
  tall?: boolean
  stats: TextStats
  totalTokens: number
}) {
  const percent = totalTokens > 0 ? stats.tokens / totalTokens : 0

  return (
    <section className="min-w-0 space-y-2">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-medium text-muted-foreground">{title}</h4>
        <div className="flex flex-wrap items-center justify-end gap-1.5 font-mono text-[10px] text-muted-foreground">
          <span>{formatPercent(percent)}</span>
          <span>{formatTokenCount(stats.characters)} 字</span>
          <span>{formatTokenCount(stats.tokens)} tokens</span>
        </div>
      </div>
      <pre className={cn(
        "min-w-0 whitespace-pre-wrap break-words rounded-md border bg-muted/30 p-3 font-mono text-xs leading-relaxed text-foreground",
        tall ? "max-h-72 overflow-auto" : "max-h-48 overflow-auto",
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

function getTextStats(value?: string): TextStats {
  const text = value?.trim() ?? ""
  if (!text) return { characters: 0, tokens: 0 }
  return {
    characters: Array.from(text).length,
    tokens: estimateTextTokens(text),
  }
}

function estimateTextTokens(text: string) {
  const cjkChars = text.match(/[\u3400-\u9fff\uf900-\ufaff]/g)?.length ?? 0
  const nonCjkText = text.replace(/[\u3400-\u9fff\uf900-\ufaff]/g, " ")
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

function dedupeDisplayPart(part: MessagePart): MessagePart {
  if (part.type !== "text") return part
  const text = dedupeRepeatedTextBlock(part.text)
  return text === part.text ? part : { ...part, text }
}

function dedupeRepeatedTextBlock(text: string) {
  const lines = text.split(/\r?\n/)
  let next = [...lines]

  while (next.length > 1 && next.length % 2 === 0) {
    const middle = next.length / 2
    const first = next.slice(0, middle)
    const second = next.slice(middle)
    if (normalizeDisplayText(first.join("\n")) !== normalizeDisplayText(second.join("\n"))) break
    next = first
  }

  return next.join("\n")
}

function normalizeDisplayText(text: string) {
  return text.trim().replace(/\s+/g, " ")
}

function MessagePartView({ part, message, workspaceId }: { part: MessagePart; message: Message; workspaceId: string }) {
  const t = useTranslations('chat')

  switch (part.type) {
    case "text":
      return <Markdown content={part.text} />
    case "user_message":
      return <UserReplyPart text={part.text} senderName={part.senderName || "用户"} />
    case "reasoning":
      return (
        <ChainOfThought defaultOpen={part.status === "streaming"} className="max-w-none">
          <ChainOfThoughtHeader loading={part.status === "streaming"}>
            {part.status === "streaming" ? t('messageParts.agentThinking') : t('messageParts.aiIntermediateOutput')}
          </ChainOfThoughtHeader>
          <ChainOfThoughtContent className="max-h-[300px] overflow-y-auto">
            <div className="pl-6 text-xs text-muted-foreground">
              <Markdown content={part.text} />
            </div>
          </ChainOfThoughtContent>
        </ChainOfThought>
      )
    case "chain":
      const visibleChainStepCount = part.chains.filter((chain) => chain.kind !== "message").length
      return (
        <ChainOfThought defaultOpen={message.status === "pending"} className="max-w-none">
          <ChainOfThoughtHeader loading={message.status === "pending" || message.status === "streaming"}>{t('messageParts.chainSteps', { count: visibleChainStepCount })}</ChainOfThoughtHeader>
          <ChainOfThoughtContent className="max-h-[300px] overflow-y-auto">
            {part.chains.map((chain) => {
              const completed = chain.status === "completed"
              if (chain.kind === "message") {
                return (
                  <AiMessageStep
                    key={chain.id}
                    text={chain.text ?? chain.title}
                    status={completed ? "complete" : "active"}
                  />
                )
              }
              return (
                <ToolStep
                  key={chain.id}
                  chain={chain}
                  message={message}
                  workspaceId={workspaceId}
                  status={completed ? "complete" : "active"}
                />
              )
            })}
          </ChainOfThoughtContent>
        </ChainOfThought>
      )
    case "terminal":
      return (
        <Terminal
          output={part.command ? `$ ${part.command}\n${part.output}` : part.output}
          isStreaming={part.status === "streaming"}
          className={part.status === "error" ? "border-destructive/40" : undefined}
        />
      )
    case "confirmation": {
      const approval = normalizeApproval(part.id, part.approval)
      return (
        <Confirmation
          approval={approval}
          state={approval.approved === undefined ? "approval-requested" : "approval-responded"}
        >
          <ConfirmationTitle>
            <ConfirmationRequest>
              {part.title}
              {part.description ? <span className="block text-xs">{part.description}</span> : null}
            </ConfirmationRequest>
            <ConfirmationAccepted>{part.title}</ConfirmationAccepted>
            <ConfirmationRejected>{part.approval?.reason ?? part.title}</ConfirmationRejected>
          </ConfirmationTitle>
          <ConfirmationActions>
            <ConfirmationAction variant="outline">{t('messageParts.reject')}</ConfirmationAction>
            <ConfirmationAction>{t('messageParts.approve')}</ConfirmationAction>
          </ConfirmationActions>
        </Confirmation>
      )
    }
    case "context":
      return null
    case "subagent":
      return (
        <Agent>
          <AgentHeader name={part.name} model={part.model} />
          {(part.instructions || part.output || part.tools?.length) ? (
            <AgentContent>
              {part.instructions ? <AgentInstructions>{part.instructions}</AgentInstructions> : null}
              {part.output ? (
                <div className="space-y-2">
                  <span className="font-medium text-muted-foreground text-sm">{t('messageParts.result')}</span>
                  <div className="rounded-md bg-muted/50 p-3 text-sm">
                    <Markdown content={part.output} />
                  </div>
                </div>
              ) : null}
              {part.tools?.length ? (
                <AgentTools>
                  {part.tools.map((tool, index) => (
                    <AgentTool
                      key={`${tool.name ?? "tool"}-${index}`}
                      value={`tool-${index}`}
                      tool={{
                        description: tool.description ?? tool.name,
                        inputSchema: tool.inputSchema,
                        jsonSchema: tool.jsonSchema,
                      }}
                    />
                  ))}
                </AgentTools>
              ) : null}
            </AgentContent>
          ) : null}
        </Agent>
      )
    case "ask_user_question":
      if (part.status !== "answered" && !part.answer) return null
      return <AnsweredQuestionSummary question={part.question} answer={part.answer ?? ""} />
    default:
      return null
  }
}

function UserReplyPart({ text, senderName }: { text: string; senderName: string }) {
  return (
    <div className="not-prose rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
      <div className="mb-1 text-xs font-medium text-primary">{senderName}：</div>
      <UserContent content={text} />
    </div>
  )
}

function AnsweredQuestionSummary({
  question,
  answer,
}: {
  question: string
  answer: string
}) {
  return (
    <div className="not-prose flex items-start gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
      <HelpCircleIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-muted-foreground">{question}</div>
        <div className="font-medium">{answer}</div>
      </div>
    </div>
  )
}

function AiMessageStep({
  text,
  status,
}: {
  text: string
  status: "complete" | "active"
}) {
  const t = useTranslations('chat')
  const shouldFold = countCharacters(text) >= 300
  const [open, setOpen] = useState(false)

  return (
    <ChainOfThoughtStep
      icon={MessageSquareTextIcon}
      label={
        <div className="flex min-w-0 items-center gap-1.5">
          <span>{t('messageParts.aiMessage')}</span>
          {shouldFold ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="ml-auto size-5"
              onClick={() => setOpen(!open)}
            >
              <ChevronDownIcon className={cn("size-3.5 transition-transform", open && "rotate-180")} />
            </Button>
          ) : null}
        </div>
      }
      status={status}
    >
      {!shouldFold || open ? <Markdown content={text} /> : null}
    </ChainOfThoughtStep>
  )
}

function countCharacters(text: string) {
  return Array.from(text.trim()).length
}

const toolIconMap: Record<string, LucideIcon> = {
  Read: BookOpenIcon,
  Write: FileTextIcon,
  Edit: PencilIcon,
  MultiEdit: FileEditIcon,
  Bash: TerminalIcon,
  TodoWrite: SquareCheckIcon,
  Grep: SearchIcon,
  Glob: FolderSearchIcon,
  Search: SearchIcon,
  SemanticSearch: SearchIcon,
  WebSearch: GlobeIcon,
  WebFetch: WebhookIcon,
  Fetch: WebhookIcon,
  Task: MessageSquareTextIcon,
  Agent: BotIcon,
  AskUserQuestion: CircleHelpIcon,
}

function getToolIcon(toolName?: string, status?: "complete" | "active"): LucideIcon {
  if (toolName && toolIconMap[toolName]) return toolIconMap[toolName]
  if (toolName?.startsWith("mcp__") || toolName?.startsWith("mcp-")) return WrenchIcon
  return status === "complete" ? CheckCircle2Icon : CircleIcon
}

function ToolStep({
  chain,
  message,
  workspaceId,
  status,
}: {
  chain: Extract<MessagePart, { type: "chain" }>["chains"][number]
  message: Message
  workspaceId: string
  status: "complete" | "active"
}) {
  const openFile = useEditorStore((state) => state.openFile)
  const [open, setOpen] = useState(false)
  const [detail, setDetail] = useState<ToolDetailData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const t = useTranslations('chat')

  const handleOpenFile = async () => {
    if (!chain.filePath) return
    await openFile(workspaceId, chain.filePath)
  }

  const loadDetail = async () => {
    if (detail || !chain.detailId) return detail
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/channels/${message.channelId}/messages/${message.id}/tool-details/${chain.detailId}`,
      )
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json() as ToolDetailData
      setDetail(data)
      return data
    } catch (err) {
      setError(err instanceof Error ? err.message : t('messageParts.failedToLoadDetails'))
      return null
    } finally {
      setLoading(false)
    }
  }

  const handleToggleDetail = async () => {
    const nextOpen = !open
    setOpen(nextOpen)
    if (!nextOpen || loading) return
    await loadDetail()
  }

  const handleCopy = async () => {
    const data = detail ?? await loadDetail()
    const text = data ? formatToolCopyText(data) : chain.command ?? chain.title
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard unavailable */ }
  }

  return (
    <ChainOfThoughtStep
      icon={getToolIcon(chain.toolName, status)}
      label={
        <div className="group/tool-step flex min-w-0 flex-wrap items-center gap-1.5">
          <span>{chain.filePath ? chain.title.replace(new RegExp(`\\s+${escapeRegExp(fileName(chain.filePath))}$`), "") : chain.title}</span>
          {chain.description ? (
            <span className="min-w-0 max-w-72 truncate text-muted-foreground text-xs">
              {chain.description}
            </span>
          ) : null}
          {chain.filePath ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 max-w-full gap-1 px-1.5 text-xs"
              onClick={handleOpenFile}
            >
              <FileTextIcon className="size-3" />
              <span className="max-w-52 truncate">{chain.filePath}</span>
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="ml-auto size-5 shrink-0 opacity-0 transition-opacity group-hover/tool-step:opacity-100 focus-visible:opacity-100"
            onClick={handleCopy}
          >
            {copied ? <CheckIcon className="size-3 text-green-500" /> : <CopyIcon className="size-3" />}
          </Button>
          {chain.detailId ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-5 shrink-0"
              onClick={handleToggleDetail}
            >
              <ChevronDownIcon className={cn("size-3.5 transition-transform", open && "rotate-180")} />
            </Button>
          ) : null}
        </div>
      }
      description={chain.command}
      status={status}
    >
      {open ? (
        <div className="space-y-2">
          {loading ? (
            <div className="rounded-md border bg-muted/40 p-2 text-muted-foreground text-xs">{t('messageParts.loadingDetails')}</div>
          ) : error ? (
            <div className="rounded-md border bg-muted/40 p-2 text-destructive text-xs">{error}</div>
          ) : detail ? (
            <ToolDetailView detail={detail} toolName={chain.toolName} filePath={chain.filePath} />
          ) : (
            <div className="rounded-md border bg-muted/40 p-2 text-muted-foreground text-xs">{t('messageParts.noDetails')}</div>
          )}
        </div>
      ) : null}
    </ChainOfThoughtStep>
  )
}

interface ToolDetailData {
  raw?: string
  input?: unknown
  output?: unknown
}

function formatToolCopyText(detail: ToolDetailData) {
  if (detail.input !== undefined || detail.output !== undefined) {
    return JSON.stringify({ input: detail.input, output: detail.output }, null, 2)
  }
  return detail.raw ?? ""
}

function ToolDetailView({
  detail,
  toolName,
  filePath,
}: {
  detail: ToolDetailData
  toolName?: string
  filePath?: string
}) {
  const t = useTranslations('chat')

  if (/^(Bash|Shell|Command)$/i.test(toolName ?? "")) {
    const command = extractCommandFromInput(detail.input)
    const output = typeof detail.output === "string" ? detail.output : JSON.stringify(detail.output ?? "", null, 2)
    return (
      <Terminal
        output={command ? `$ ${command}\n${output}` : output}
      />
    )
  }

  const editDiff = buildEditDiff(detail.input, detail.output, filePath)
  if (editDiff && /^(Edit|MultiEdit)$/i.test(toolName ?? "")) {
    return (
      <div className="h-80 overflow-hidden rounded-md border bg-background">
        <DiffViewer
          oldContent={editDiff.oldContent}
          newContent={editDiff.newContent}
          path={editDiff.path}
        />
      </div>
    )
  }

  const sections = buildDetailSections(detail, t)
  if (sections.length === 0 && detail.raw) {
    return <ReadonlyCodeBlock title={t('messageParts.raw')} value={detail.raw} language="plaintext" />
  }

  return (
    <div className="space-y-2">
      {sections.map((section) => (
        <ReadonlyCodeBlock
          key={section.title}
          title={section.title}
          value={section.value}
          language={section.language}
          height={section.height}
        />
      ))}
    </div>
  )
}

function extractCommandFromInput(input: unknown): string | undefined {
  if (!input || typeof input !== "object") return typeof input === "string" ? input : undefined
  const record = input as Record<string, unknown>
  const cmd = record.command ?? record.Command
  return typeof cmd === "string" ? cmd : undefined
}

function buildDetailSections(detail: ToolDetailData, t: ReturnType<typeof useTranslations>) {
  const sections: Array<{ title: string; value: string; language: string; height?: number }> = []
  if (detail.input !== undefined) {
    sections.push({
      title: t('messageParts.input'),
      value: formatDetailValue(detail.input),
      language: isJsonValue(detail.input) ? "json" : "plaintext",
      height: 180,
    })
  }
  if (detail.output !== undefined) {
    sections.push({
      title: t('messageParts.output'),
      value: formatDetailValue(detail.output),
      language: isJsonValue(detail.output) ? "json" : "plaintext",
      height: 220,
    })
  }
  return sections
}

function fileName(path: string) {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function formatDetailValue(value: unknown) {
  if (typeof value === "string") return value
  return JSON.stringify(value, null, 2)
}

function isJsonValue(value: unknown) {
  return typeof value !== "string"
}

function buildEditDiff(input: unknown, output: unknown, fallbackPath?: string) {
  if (!input || typeof input !== "object") return null
  const record = input as Record<string, unknown>
  const path = stringValue(record.file_path) ?? stringValue(record.path) ?? fallbackPath ?? "edit"
  const outputContent = extractOutputFileContent(output)

  const oldString = stringValue(record.old_string)
  const newString = stringValue(record.new_string)
  if (oldString !== undefined && newString !== undefined) {
    return {
      path,
      oldContent: oldString,
      newContent: outputContent ?? newString,
    }
  }

  const edits = Array.isArray(record.edits) ? record.edits : []
  if (edits.length > 0) {
    const oldContent = edits
      .map((edit, index) => {
        if (!edit || typeof edit !== "object") return `#${index + 1}`
        return stringValue((edit as Record<string, unknown>).old_string) ?? `#${index + 1}`
      })
      .join("\n\n")
    const newContent = outputContent ?? edits
      .map((edit, index) => {
        if (!edit || typeof edit !== "object") return `#${index + 1}`
        return stringValue((edit as Record<string, unknown>).new_string) ?? `#${index + 1}`
      })
      .join("\n\n")

    return { path, oldContent, newContent }
  }

  return null
}

function extractOutputFileContent(output: unknown) {
  if (!output || typeof output !== "object") return undefined
  const record = output as Record<string, unknown>
  const directContent = stringValue(record.content)
  if (directContent !== undefined) return directContent

  const file = record.file
  if (file && typeof file === "object") {
    return stringValue((file as Record<string, unknown>).content)
  }

  return undefined
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined
}

function normalizeApproval(id: string, approval: Extract<MessagePart, { type: "confirmation" }>["approval"]) {
  if (!approval || approval.approved === undefined) return { id: approval?.id ?? id }
  return {
    id: approval.id,
    approved: approval.approved,
    reason: approval.reason,
  }
}

function MessageAttachments({ attachments, isUser }: { attachments: NonNullable<Message["attachments"]>; isUser: boolean }) {
  return (
    <Attachments variant="inline" className={isUser ? "justify-end" : "justify-start"}>
      {attachments.map((attachment, index) => (
        <Attachment key={`${attachment.path}-${index}`} data={attachmentToData(attachment, index)}>
          <AttachmentPreview />
          <AttachmentInfo showMediaType />
        </Attachment>
      ))}
    </Attachments>
  )
}

function attachmentToData(attachment: NonNullable<Message["attachments"]>[number], index: number): AttachmentData {
  return {
    id: `${attachment.path || attachment.name}-${index}`,
    type: "file",
    filename: attachment.name,
    mediaType: attachment.type,
    url: attachment.url || attachment.path,
  }
}

function UserContent({ content }: { content: string }) {
  if (/<[a-z][\s\S]*>/i.test(content)) {
    return <span className="tiptap tiptap-message" dangerouslySetInnerHTML={{ __html: content }} />
  }
  return <span className="whitespace-pre-wrap break-all">{content}</span>
}
