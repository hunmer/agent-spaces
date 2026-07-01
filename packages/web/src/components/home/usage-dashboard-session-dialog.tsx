"use client"

import { useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import type { AgentUsageRecord, AgentUsageSessionDetail, AgentUsageSessionMessage } from "@agent-spaces/shared"
import { ChevronDown, Loader2 } from "lucide-react"

import { ChatMessageList } from "@/components/chat/chat-message-list"
import { ContextPartChatView } from "@/components/chat/message-context-to-chat"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { JsonViewer } from "@/components/viewers/json-viewer"
import { sdk } from "@/lib/sdk"
import { cn } from "@/lib/utils"

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
        <DialogHeader className="border-b px-4 pt-4 pb-3">
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
        </DialogHeader>

        <Tabs defaultValue="messages" className="min-h-0 flex-1 px-4 pb-4">
          <TabsList variant="line" className="border-b px-0">
            <TabsTrigger value="messages" className="rounded-none px-3 text-xs">
              {t("sessionDetail.messages")}
            </TabsTrigger>
            <TabsTrigger value="raw" className="rounded-none px-3 text-xs">
              {t("sessionDetail.raw")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="messages" className="min-h-0">
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
                <ChatMessageList
                  messages={messages.map((message) => ({
                    id: message.id,
                    role: message.role,
                    content: message.content,
                    timestamp: message.createdAt,
                    timeline: message.timeline,
                    contextPart: message.contextPart,
                    sourceChannelName: message.sourceChannelName,
                    metadata: message.metadata,
                  }))}
                  workspaceId={record?.workspaceId}
                  renderMessageExtras={(message) => (
                    <SessionMessageExtras message={message} t={t} />
                  )}
                />
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="raw" className="min-h-0">
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

function SessionMessageExtras({
  message,
  t,
}: {
  message: {
    contextPart?: AgentUsageSessionMessage["contextPart"]
    sourceChannelName?: string
    metadata?: AgentUsageSessionMessage["metadata"]
  }
  t: ReturnType<typeof useTranslations<"home">>
}) {
  const [open, setOpen] = useState(false)

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
      {message.contextPart ? (
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-left text-xs font-medium hover:bg-muted/50">
            <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
            {t("sessionDetail.promptInfo")}
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <ContextPartChatView part={message.contextPart} />
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  )
}

export function SessionDetailButton({ onClick }: { onClick: () => void }) {
  const t = useTranslations("home")

  return (
    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onClick}>
      {t("sessionDetail.view")}
    </Button>
  )
}
