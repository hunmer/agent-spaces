"use client"

import type { Message, MessagePart } from "@agent-spaces/shared"
import { HelpCircleIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { Markdown } from "@/components/ui/markdown"
import { Loader } from "@/components/ui/loader"
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
      const visibleChains = part.chains.filter((chain) => {
        const text = chain.text ?? chain.description ?? chain.title
        return !isIgnorableChainOfThoughtText(text)
      })
      const visibleChainStepCount = visibleChains.filter((chain) => chain.kind !== "message").length
      if (visibleChains.length === 0) return null
      return (
        <ChainOfThought defaultOpen={message.status === "pending"} className="max-w-none">
          <ChainOfThoughtHeader loading={message.status === "pending" || message.status === "streaming"}>{t('messageParts.chainSteps', { count: visibleChainStepCount })}</ChainOfThoughtHeader>
          <ChainOfThoughtContent className="max-h-[300px] overflow-y-auto">
            {visibleChains.map((chain) => {
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
                    <Markdown content={output} />
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
