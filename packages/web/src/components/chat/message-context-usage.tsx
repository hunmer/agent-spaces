"use client"

import type { Message } from "@agent-spaces/shared"
import { BotIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useLLMStore } from "@/stores/llm"
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
import { ContextPartChatView } from "./message-context-to-chat"
import { aggregateTokenUsage, toContextUsage } from "./message-context-panel"

export function MessageContextUsage({ message }: { message: Message }) {
  const t = useTranslations('chat.contextUsage')
  const contextParts = useMemo(() => message.parts?.filter((item) => item.type === "context") ?? [], [message.parts])
  const part = contextParts[contextParts.length - 1]
  const [popoverOpen, setPopoverOpen] = useState(false)
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
        open={popoverOpen}
        onOpenChange={setPopoverOpen}
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
          <div className="border-t px-3 py-2">
            <button
              type="button"
              className="w-full text-center text-xs text-primary hover:underline cursor-pointer"
              onClick={() => {
                setPopoverOpen(false)
                setDetailsOpen(true)
              }}
            >
              {t('viewDetails')}
            </button>
          </div>
        </ContextContent>
      </Context>
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="!flex !w-[min(920px,calc(100vw-2rem))] !max-w-[min(920px,calc(100vw-2rem))] !flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle className="text-base">{t('contextStructure')}</DialogTitle>
            <DialogDescription className="text-xs">
              {t('contextDescription', { count: contextParts.length })}
            </DialogDescription>
          </DialogHeader>
          {contextParts.length ? (
            <Tabs
              value={selectedAgent?.id}
              onValueChange={setActiveAgentId}
              className="min-h-0 flex flex-1 gap-0"
            >
              <div className="flex w-56 shrink-0 flex-col border-r">
                <TabsList className="!flex h-auto w-full flex-col items-stretch gap-1 rounded-none border-0 bg-transparent p-2">
                  {contextParts.map((item, index) => (
                    <TabsTrigger key={item.id} value={item.id} className="!w-full justify-start gap-2 px-3 py-2 text-xs">
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-[10px] text-muted-foreground">{index + 1}</span>
                      <BotIcon className="size-3.5 shrink-0" />
                      <span className="min-w-0 truncate">{item.agentContext?.name || item.agentContext?.role || `Agent ${index + 1}`}</span>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
              <ScrollArea className="max-h-[min(68vh,720px)] min-w-0 flex-1">
                {contextParts.map((item) => (
                  <TabsContent key={item.id} value={item.id} className="m-0 min-w-0 p-5">
                    <ContextPartChatView part={item} />
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
