"use client"

import { useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import type { AgentUsageRecord, AgentUsageSessionDetail, AgentUsageSessionMessage } from "@agent-spaces/shared"
import { Loader2, Trash2 } from "lucide-react"

import { ContextPartChatView } from "@/components/chat/message-context-to-chat"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Markdown } from "@/components/ui/markdown"
import { JsonViewer } from "@/components/viewers/json-viewer"
import { sdk } from "@/lib/sdk"

import { formatCurrency, formatDuration, formatTokens } from "./usage-dashboard-utils"

export function UsageDashboardSessionDialog({
  record,
  open,
  onOpenChange,
}: {
  record: AgentUsageRecord | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("home")
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<AgentUsageSessionDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState("messages")

  useEffect(() => {
    if (!open || !record) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setDetail(null)
    sdk.agent.sessionDetail(record.agentSessionId)
      .then((data) => {
        if (cancelled) return
        setDetail(data)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, record])

  const messages = useMemo(() => detail?.messages ?? [], [detail])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] !w-[min(1120px,calc(100vw-2rem))] !max-w-[min(1120px,calc(100vw-2rem))] gap-3 overflow-hidden p-0">
        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader className="border-b px-4 pt-4 pb-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-1 min-w-0">
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  <span>{record?.summary || t("sessionDetail.title")}</span>
                  {record?.runtime ? <Badge variant="outline">{record.runtime}</Badge> : null}
                  {record?.model ? <Badge variant="outline">{record.model}</Badge> : null}
                  {record?.status ? <Badge variant="secondary">{record.status}</Badge> : null}
                </DialogTitle>
                <DialogDescription className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <span>{t("sessionDetail.requests")}: {formatTokens(record?.totalTokens ?? 0)}</span>
                  <span>{t("sessionDetail.cost")}: {formatCurrency(record?.totalCostUsd ?? 0)}</span>
                  <span>{t("sessionDetail.duration")}: {formatDuration(record?.durationMs ?? 0)}</span>
                  {record?.agentSessionId ? <span className="font-mono">{record.agentSessionId}</span> : null}
                </DialogDescription>
                {detail?.systemPrompt ? (
                  <div className="mt-2 rounded-md border bg-muted/30 p-3">
                    <div className="mb-2 text-[11px] font-medium text-muted-foreground">
                      {t("sessionDetail.systemPrompt")}
                    </div>
                    <pre className="max-h-36 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-foreground">
                      {detail.systemPrompt}
                    </pre>
                  </div>
                ) : null}
              </div>
              <TabsList variant="line" className="shrink-0 px-0 me-5">
                <TabsTrigger value="messages" className="rounded-none px-3 text-xs">
                  {t("sessionDetail.messages")}
                </TabsTrigger>
                <TabsTrigger value="raw" className="rounded-none px-3 text-xs">
                  {t("sessionDetail.raw")}
                </TabsTrigger>
              </TabsList>
            </div>
          </DialogHeader>

          <TabsContent value="messages" className="mt-0 min-h-0 px-4 pb-4">
            <ScrollArea className="h-[65vh]" viewportClassName="pr-3">
              {loading ? (
                <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  {t("sessionDetail.loading")}
                </div>
              ) : error ? (
                <div className="flex h-40 items-center justify-center text-sm text-destructive">
                  {error}
                </div>
              ) : messages.length === 0 ? (
                <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                  {t("sessionDetail.empty")}
                </div>
              ) : (
                <div className="flex flex-col gap-3 py-3">
                  {messages.map((message) => (
                    <SessionMessageCard
                      key={message.id}
                      message={message}
                    />
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="raw" className="mt-0 min-h-0 px-4 pb-4">
            <ScrollArea className="h-[65vh]" viewportClassName="pr-3">
              <div className="space-y-3 py-3">
                {detail?.cliHistoryPath ? (
                  <div className="rounded-md border bg-muted/30 px-3 py-2 font-mono text-xs text-muted-foreground">
                    {detail.cliHistoryPath}
                  </div>
                ) : null}
                <JsonViewer
                  data={((detail?.rawSession ?? detail) || null) as never}
                  title={t("sessionDetail.raw")}
                  defaultExpanded={1}
                  rootName="session"
                />
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

function SessionMessageCard({
  message,
}: {
  message: Pick<AgentUsageSessionMessage, "content" | "createdAt" | "role" | "contextPart" | "sourceChannelName" | "metadata">
}) {
  const hasExtras = !!message.contextPart || !!message.sourceChannelName || !!message.metadata?.runtimeSessionId || !!message.metadata?.runtime

  return (
    <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <Badge variant={message.role === "user" ? "secondary" : "default"}>
          {message.role === "user" ? "user" : "agent"}
        </Badge>
        <span className="text-[10px] text-muted-foreground">
          {new Date(message.createdAt).toLocaleString()}
        </span>
      </div>
      <div className="rounded-md bg-background/80 px-3 py-2 text-sm">
        {message.role === "user" ? (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        ) : (
          <Markdown content={message.content} />
        )}
      </div>
      {hasExtras ? <SessionMessageExtras message={message} /> : null}
    </div>
  )
}

function SessionMessageExtras({
  message,
}: {
  message: {
    contextPart?: AgentUsageSessionMessage["contextPart"]
    sourceChannelName?: string
    metadata?: AgentUsageSessionMessage["metadata"]
  }
}) {
  if (!message.contextPart && !message.sourceChannelName && !message.metadata?.runtimeSessionId) {
    return null
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
        {message.sourceChannelName ? <Badge variant="outline">{message.sourceChannelName}</Badge> : null}
        {message.metadata?.runtime ? <Badge variant="outline">{message.metadata.runtime}</Badge> : null}
        {message.metadata?.runtimeSessionId ? <span className="font-mono">{message.metadata.runtimeSessionId}</span> : null}
      </div>
      {message.contextPart ? <ContextPartChatView part={message.contextPart} /> : null}
    </div>
  )
}

export function SessionDetailButton({ onView, onDelete }: { onView: () => void; onDelete: () => void }) {
  const t = useTranslations("home")

  return (
    <div className="flex items-center gap-1">
      <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onView}>
        {t("sessionDetail.view")}
      </Button>
      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button type="button" variant="ghost" size="icon-sm" className="size-7 text-muted-foreground hover:text-destructive" aria-label={t("sessionDetail.delete")}>
              <Trash2 className="size-3.5" />
            </Button>
          }
        />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("sessionDetail.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("sessionDetail.deleteConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("sessionDetail.cancel")}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={onDelete}>
              {t("sessionDetail.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
