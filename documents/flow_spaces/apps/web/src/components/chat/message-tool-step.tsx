"use client"

import type { Message, MessagePart } from "@agent-spaces/shared"
import type { LucideIcon } from "lucide-react"
import { BookOpenIcon, BotIcon, CheckCircle2Icon, CheckIcon, ChevronDownIcon, CircleIcon, CopyIcon, EyeIcon, FileEditIcon, FileTextIcon, FolderSearchIcon, GlobeIcon, CircleHelpIcon, MessageSquareTextIcon, PencilIcon, SearchIcon, SparklesIcon, SquareCheckIcon, TerminalIcon, WebhookIcon, WrenchIcon } from "lucide-react"
import { useState, useCallback } from "react"
import { useTranslations } from "next-intl"
import { Markdown } from "@/components/ui/markdown"
import { Button } from "@/components/ui/button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useEditorStore } from "@/stores/editor"
import { sdk } from '@/lib/sdk'
import { cn, copyToClipboard } from "@/lib/utils"
import { DiffViewer } from "@/components/git/diff-viewer"
import {
  ChainOfThoughtStep,
} from "./chain-of-thought"
import { ReadonlyCodeBlock } from "./readonly-code-block"
import { Terminal } from "./terminal"

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
  Skill: SparklesIcon,
  AskUserQuestion: CircleHelpIcon,
  LoadClaudeMd: BookOpenIcon,
}

export function getToolIcon(toolName?: string, status?: "complete" | "active"): LucideIcon {
  if (toolName && toolIconMap[toolName]) return toolIconMap[toolName]
  if (toolName?.startsWith("mcp__") || toolName?.startsWith("mcp-")) return WrenchIcon
  return status === "complete" ? CheckCircle2Icon : CircleIcon
}

export function AiMessageStep({
  text,
  status,
  workspaceId,
}: {
  text: string
  status: "complete" | "active"
  workspaceId?: string
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
      {!shouldFold || open ? <Markdown content={text} workspaceId={workspaceId} /> : null}
    </ChainOfThoughtStep>
  )
}

export function ToolStep({
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
  const [viewOpen, setViewOpen] = useState(false)
  const t = useTranslations('chat')

  const handleOpenFile = async () => {
    if (!chain.filePath) return
    await openFile(workspaceId, chain.filePath)
  }

  const loadDetail = useCallback(async () => {
    if (detail || !chain.detailId) return detail
    setLoading(true)
    setError(null)
    try {
      const data = await sdk.channel.getToolDetail(workspaceId, message.channelId, message.id, chain.detailId) as ToolDetailData
      setDetail(data)
      return data
    } catch (err) {
      setError(err instanceof Error ? err.message : t('messageParts.failedToLoadDetails'))
      return null
    } finally {
      setLoading(false)
    }
  }, [detail, chain.detailId, workspaceId, message.channelId, message.id, t])

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
      await copyToClipboard(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard unavailable */ }
  }

  const handleView = async () => {
    await loadDetail()
    setViewOpen(true)
  }

  return (
    <ChainOfThoughtStep
      icon={getToolIcon(chain.toolName, status)}
      label={
        <ContextMenu>
          <ContextMenuTrigger className="group/tool-step flex min-w-0 max-w-full items-center gap-1.5 overflow-hidden">
            <span className="min-w-0 shrink truncate">{chain.filePath ? chain.title.replace(new RegExp(`\\s+${escapeRegExp(fileName(chain.filePath))}$`), "") : chain.title}</span>
            {chain.description ? (
              <span className="min-w-0 shrink truncate text-muted-foreground text-xs">
                {chain.description}
              </span>
            ) : null}
            {chain.filePath ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 max-w-48 shrink gap-1 px-1.5 text-xs"
                onClick={handleOpenFile}
              >
                <FileTextIcon className="size-3 shrink-0" />
                <span className="truncate">{chain.filePath}</span>
              </Button>
            ) : null}
            <div className="ml-auto flex shrink-0 items-center">
              {chain.detailId ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-5"
                  onClick={handleToggleDetail}
                >
                  <ChevronDownIcon className={cn("size-3.5 transition-transform", open && "rotate-180")} />
                </Button>
              ) : null}
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onClick={handleCopy}>
              {copied ? <CheckIcon className="size-4 text-green-500" /> : <CopyIcon className="size-4" />}
              {t('messageParts.copy')}
            </ContextMenuItem>
            <ContextMenuItem onClick={handleView}>
              <EyeIcon className="size-4" />
              {t('messageParts.view')}
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      }
      description={chain.command}
      status={status}
    >
      {chain.answer ? (
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
          <div className="text-muted-foreground text-xs">{t('messageParts.result')}</div>
          <div className="font-medium">{chain.answer}</div>
        </div>
      ) : null}
      {open ? (
        <div className="min-w-0 max-w-full space-y-2 overflow-hidden">
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
      <ToolDetailDialog
        open={viewOpen}
        onOpenChange={setViewOpen}
        detail={detail}
        toolName={chain.toolName}
        loading={loading}
        error={error}
        t={t}
      />
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
    <div className="min-w-0 max-w-full space-y-2 overflow-hidden">
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

function countCharacters(text: string) {
  return Array.from(text.trim()).length
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

function ToolDetailDialog({
  open,
  onOpenChange,
  detail,
  toolName,
  loading,
  error,
  t,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  detail: ToolDetailData | null
  toolName?: string
  loading: boolean
  error: string | null
  t: ReturnType<typeof useTranslations>
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{toolName ?? t('messageParts.raw')}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="py-8 text-center text-muted-foreground text-sm">{t('messageParts.loadingDetails')}</div>
        ) : error ? (
          <div className="py-8 text-center text-destructive text-sm">{error}</div>
        ) : detail ? (
          <div className="grid gap-4 md:grid-cols-2">
            <ReadonlyCodeBlock
              title={t('messageParts.input')}
              value={formatDetailValue(detail.input) || "-"}
              language={isJsonValue(detail.input) ? "json" : "plaintext"}
              height={320}
            />
            <ReadonlyCodeBlock
              title={t('messageParts.output')}
              value={formatDetailValue(detail.output) || "-"}
              language={isJsonValue(detail.output) ? "json" : "plaintext"}
              height={320}
            />
          </div>
        ) : (
          <div className="py-8 text-center text-muted-foreground text-sm">{t('messageParts.noDetails')}</div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined
}
