"use client"

import type { Message, MessagePart } from "@agent-spaces/shared"
import { AlertCircleIcon, HelpCircleIcon, CheckCircle2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Markdown } from "@/components/ui/markdown"
import { Loader } from "@/components/ui/loader"
import { cn } from "@/lib/utils"
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
  AttachmentHoverCard,
  AttachmentHoverCardContent,
  AttachmentHoverCardTrigger,
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
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  isIgnorableChainOfThoughtText,
} from "./chain-of-thought"
import { Terminal } from "./terminal"
import { AiMessageStep, ToolStep } from "./message-tool-step"

export { MessageContextUsage } from "./message-context-usage"

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
      {parts.length > 0 ? (() => {
        const lastChainIdx = parts.findLastIndex((p) => p.type === "chain")
        return parts.map((part, index) => (
          <MessagePartView
            key={part.id}
            part={dedupeDisplayPart(part)}
            message={message}
            workspaceId={workspaceId}
            isLastChain={index === lastChainIdx}
          />
        ))
      })() : null}
      {!hasTextPart && shouldRenderLegacyContent ? (
        isUser ? <UserContent content={message.content} /> : <Markdown content={dedupeRepeatedTextBlock(message.content)} workspaceId={workspaceId} />
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

function MessagePartView({
  part,
  message,
  workspaceId,
  isLastChain,
}: {
  part: MessagePart
  message: Message
  workspaceId: string
  isLastChain?: boolean
}) {
  const t = useTranslations('chat')

  switch (part.type) {
    case "text":
      return <Markdown content={part.text} workspaceId={workspaceId} />
    case "user_message":
      return <UserReplyPart text={part.text} senderName={part.senderName || t('user')} />
    case "reasoning":
      return (
        <ChainOfThought defaultOpen={part.status === "streaming"} className="max-w-none">
          <ChainOfThoughtHeader loading={part.status === "streaming"}>
            {part.status === "streaming" ? t('messageParts.agentThinking') : t('messageParts.aiIntermediateOutput')}
          </ChainOfThoughtHeader>
          <ChainOfThoughtContent className="max-h-[300px] overflow-y-auto">
            <div className="pl-6 text-xs text-muted-foreground">
              <Markdown content={part.text} workspaceId={workspaceId} />
            </div>
          </ChainOfThoughtContent>
        </ChainOfThought>
      )
    case "chain":
      const visibleChains = part.chains.filter((chain) => {
        const text = chain.text ?? chain.description ?? chain.title
        return !isIgnorableChainOfThoughtText(text)
      })
      const visibleChainStepCount = visibleChains.filter((chain) => chain.kind !== "message").length
      if (visibleChains.length === 0) return null
      const isActive = message.status === "pending" || message.status === "streaming"
      const lastToolChain = [...visibleChains].reverse().find((c) => c.kind !== "message")
      const headerText = isActive && lastToolChain
        ? `${lastToolChain.toolName ?? lastToolChain.title} · ${t('messageParts.chainSteps', { count: visibleChainStepCount })}`
        : t('messageParts.chainSteps', { count: visibleChainStepCount })
      return (
        <ChainOfThought defaultOpen={message.status === "pending"} className="max-w-none">
          <ChainOfThoughtHeader loading={isActive && isLastChain}>
            {headerText}
          </ChainOfThoughtHeader>
          <ChainOfThoughtContent className="max-h-[300px] overflow-y-auto">
            {visibleChains.map((chain) => {
              const completed = chain.status === "completed"
              if (chain.kind === "message") {
                return (
                  <AiMessageStep
                    key={chain.id}
                    text={chain.text ?? chain.title}
                    status={completed ? "complete" : "active"}
                    workspaceId={workspaceId}
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
    case "error":
      return (
        <Alert variant="destructive" className="max-w-md">
          <AlertCircleIcon />
          {part.title ? <AlertTitle>{part.title}</AlertTitle> : null}
          <AlertDescription>{part.message}</AlertDescription>
        </Alert>
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
      const output = part.output && !isIgnorableChainOfThoughtText(part.output) ? part.output : undefined
      return (
        <Agent>
          <AgentHeader name={part.name} model={part.model} />
          {(part.instructions || output || part.tools?.length) ? (
            <AgentContent>
              {part.instructions ? <AgentInstructions>{part.instructions}</AgentInstructions> : null}
              {output ? (
                <div className="space-y-2">
                  <span className="font-medium text-muted-foreground text-sm">{t('messageParts.result')}</span>
                  <div className="rounded-md bg-muted/50 p-3 text-sm">
                    <Markdown content={output} workspaceId={workspaceId} />
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
      return <AskUserQuestionPart question={part.question} choices={part.choices} status={part.status} answer={part.answer} />
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
    <Attachments variant="inline" className={cn("gap-1.5", isUser ? "justify-end" : "justify-start")}>
      {attachments.map((attachment, index) => (
        <MessageAttachmentItem key={`${attachment.path}-${index}`} data={attachmentToData(attachment, index)} />
      ))}
    </Attachments>
  )
}

function MessageAttachmentItem({ data }: { data: AttachmentData }) {
  const [open, setOpen] = useState(false)
  const filename = data.filename || data.title || data.url || ""

  return (
    <AttachmentHoverCard openDelay={200}>
      <AttachmentHoverCardTrigger asChild>
        <Attachment
          data={data}
          className="h-10 cursor-pointer gap-2 rounded-lg px-2.5 text-sm"
          onClick={() => setOpen(true)}
        >
          <AttachmentPreview />
          <AttachmentInfo showMediaType />
        </Attachment>
      </AttachmentHoverCardTrigger>
      <AttachmentHoverCardContent className="w-72 p-3">
        <AttachmentDetail data={data} />
      </AttachmentHoverCardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="truncate pr-8">{filename}</DialogTitle>
            {data.mediaType ? (
              <DialogDescription className="truncate">{data.mediaType}</DialogDescription>
            ) : null}
          </DialogHeader>
          <AttachmentFullDetail data={data} />
        </DialogContent>
      </Dialog>
    </AttachmentHoverCard>
  )
}

function AttachmentDetail({ data }: { data: AttachmentData }) {
  const filename = data.filename || data.title || data.url || ""
  const url = data.url || ""
  const isImage = (data.mediaType ?? "").startsWith("image/")
  return (
    <div className="flex flex-col gap-2">
      {isImage && url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={filename} className="max-h-48 w-full rounded object-contain" />
      ) : null}
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{filename}</div>
        {data.mediaType ? (
          <div className="truncate text-xs text-muted-foreground">{data.mediaType}</div>
        ) : null}
        {url && url !== filename ? (
          <div className="truncate text-xs text-muted-foreground">{url}</div>
        ) : null}
      </div>
    </div>
  )
}

function AttachmentFullDetail({ data }: { data: AttachmentData }) {
  const t = useTranslations("chat")
  const filename = data.filename || data.title || ""
  const url = data.url || ""
  const isImage = (data.mediaType ?? "").startsWith("image/")
  const isVideo = (data.mediaType ?? "").startsWith("video/")
  const isAudio = (data.mediaType ?? "").startsWith("audio/")
  const rows = [
    data.filename && [t("attachments.fileName"), data.filename],
    data.title && [t("attachments.title"), data.title],
    data.mediaType && [t("attachments.mediaType"), data.mediaType],
    data.url && [t("attachments.url"), data.url],
  ].filter(Boolean) as [string, string][]

  const openExternal = () => {
    if (!url) return
    if (url.startsWith("http")) window.open(url, "_blank", "noopener,noreferrer")
    else window.location.href = url
  }

  return (
    <div className="flex flex-col gap-4">
      {(isImage || isVideo || isAudio) && url ? (
        <div className="flex max-h-80 items-center justify-center overflow-hidden rounded-lg bg-muted/40">
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={filename} className="max-h-80 w-full object-contain" />
          ) : isVideo ? (
            <video src={url} controls className="max-h-80 w-full" />
          ) : (
            <audio src={url} controls className="w-full" />
          )}
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex flex-col gap-0.5 text-sm">
            <span className="text-xs text-muted-foreground">{label}</span>
            <span className="break-all">{value}</span>
          </div>
        ))}
      </div>

      {url ? (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={openExternal}>
            {t("attachments.open")}
          </Button>
        </div>
      ) : null}
    </div>
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
  return <span className="whitespace-pre-wrap break-all select-text">{content}</span>
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

// ---- Inline ask_user_question rendering (historical) ----

function AskUserQuestionPart({
  question, choices, status, answer,
}: {
  question: string
  choices?: string[]
  status?: 'requested' | 'answered'
  answer?: string
}) {
  const isAnswered = status === 'answered' || answer
  return (
    <div className="not-prose my-2 rounded-lg border bg-muted/40 px-3 py-2.5 text-sm">
      <div className="flex items-start gap-2">
        <HelpCircleIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-foreground">{question}</p>
          {choices && choices.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {choices.map((choice, i) => (
                <span
                  key={i}
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    isAnswered && answer === choice
                      ? 'bg-primary/15 text-primary'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {choice}
                </span>
              ))}
            </div>
          )}
          {isAnswered && answer && (
            <div className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
              <CheckCircle2Icon className="size-3" />
              <span>Answer: <span className="font-medium text-foreground">{answer}</span></span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
