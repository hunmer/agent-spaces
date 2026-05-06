"use client"

import type { Message, MessagePart } from "@agent-spaces/shared"
import { CheckIcon, CheckCircle2Icon, ChevronDownIcon, CircleIcon, CopyIcon, FileTextIcon, HelpCircleIcon, MessageSquareTextIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { Markdown } from "@/components/ui/markdown"
import { Loader } from "@/components/ui/loader"
import { Button } from "@/components/ui/button"
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
  const messageParts = message.parts ?? []
  const parts = messageParts.filter((part) => part.type !== "context")
  const hasTextPart = parts.some((part) => part.type === "text")
  const shouldRenderLegacyContent = messageParts.length === 0 && message.content

  return (
    <div className="space-y-3">
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
          <span>Agent is processing...</span>
        </div>
      ) : null}
    </div>
  )
}

export function MessageContextUsage({ message }: { message: Message }) {
  const part = message.parts?.find((item) => item.type === "context")
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

  return (
    <Context
      usedTokens={part.usedTokens}
      maxTokens={maxTokens}
      modelId={part.modelId}
      usage={{
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
      }}
    >
      <ContextTrigger className="h-5 gap-1 px-1.5 text-[10px]" />
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
  )
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
  switch (part.type) {
    case "text":
      return <Markdown content={part.text} />
    case "reasoning":
      return (
        <ChainOfThought defaultOpen={part.status === "streaming"} className="max-w-none">
          <ChainOfThoughtHeader loading={part.status === "streaming"}>
            {part.status === "streaming" ? "Agent is thinking" : "AI intermediate output"}
          </ChainOfThoughtHeader>
          <ChainOfThoughtContent className="max-h-[300px] overflow-y-auto">
            <ChainOfThoughtStep
              icon={MessageSquareTextIcon}
              label={part.status === "streaming" ? "Streaming response" : "Intermediate message"}
              status={part.status === "streaming" ? "active" : "complete"}
            >
              <Markdown content={part.text} />
            </ChainOfThoughtStep>
          </ChainOfThoughtContent>
        </ChainOfThought>
      )
    case "chain":
      return (
        <ChainOfThought defaultOpen={message.status === "pending"} className="max-w-none">
          <ChainOfThoughtHeader loading={message.status === "pending" || message.status === "streaming"}>{part.chains.length} chain {part.chains.length === 1 ? "step" : "steps"}</ChainOfThoughtHeader>
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
            <ConfirmationAction variant="outline">Reject</ConfirmationAction>
            <ConfirmationAction>Approve</ConfirmationAction>
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
                  <span className="font-medium text-muted-foreground text-sm">Result</span>
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
  const [open, setOpen] = useState(false)

  return (
    <ChainOfThoughtStep
      icon={MessageSquareTextIcon}
      label={
        <div className="flex min-w-0 items-center gap-1.5">
          <span>AI message</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="ml-auto size-5"
            onClick={() => setOpen(!open)}
          >
            <ChevronDownIcon className={cn("size-3.5 transition-transform", open && "rotate-180")} />
          </Button>
        </div>
      }
      status={status}
    >
      {open ? <Markdown content={text} /> : null}
    </ChainOfThoughtStep>
  )
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
      setError(err instanceof Error ? err.message : "Failed to load details.")
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
      icon={status === "complete" ? CheckCircle2Icon : CircleIcon}
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
            <div className="rounded-md border bg-muted/40 p-2 text-muted-foreground text-xs">Loading details...</div>
          ) : error ? (
            <div className="rounded-md border bg-muted/40 p-2 text-destructive text-xs">{error}</div>
          ) : detail ? (
            <ToolDetailView detail={detail} toolName={chain.toolName} filePath={chain.filePath} />
          ) : (
            <div className="rounded-md border bg-muted/40 p-2 text-muted-foreground text-xs">No details available.</div>
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

  const sections = buildDetailSections(detail)
  if (sections.length === 0 && detail.raw) {
    return <ReadonlyCodeBlock title="Raw" value={detail.raw} language="plaintext" />
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

function buildDetailSections(detail: ToolDetailData) {
  const sections: Array<{ title: string; value: string; language: string; height?: number }> = []
  if (detail.input !== undefined) {
    sections.push({
      title: "Input",
      value: formatDetailValue(detail.input),
      language: isJsonValue(detail.input) ? "json" : "plaintext",
      height: 180,
    })
  }
  if (detail.output !== undefined) {
    sections.push({
      title: "Output",
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
  return <span className="whitespace-pre-wrap break-words">{content}</span>
}
