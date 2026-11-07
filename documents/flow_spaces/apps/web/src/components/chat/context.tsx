"use client"

import { type ComponentProps, createContext, isValidElement, useContext } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

const PERCENT_MAX = 100
const ICON_RADIUS = 10
const ICON_VIEWBOX = 24
const ICON_CENTER = 12
const ICON_STROKE_WIDTH = 2

type ModelId = string

interface LanguageModelUsage {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  cachedInputTokens?: number
  reasoningTokens?: number
  inputTokenDetails?: unknown
  outputTokenDetails?: unknown
}

interface ContextSchema {
  usedTokens: number
  maxTokens: number
  usage?: LanguageModelUsage
  modelId?: ModelId
}

const ContextContext = createContext<ContextSchema | null>(null)

const useContextValue = () => {
  const context = useContext(ContextContext)

  if (!context) {
    throw new Error("Context components must be used within Context")
  }

  return context
}

export type ContextProps = ContextSchema & {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  defaultOpen?: boolean
  children?: React.ReactNode
}

export const Context = ({ usedTokens, maxTokens, usage, modelId, children, ...props }: ContextProps) => {
  const value = { usedTokens, maxTokens, usage, modelId }
  return (
    <ContextContext.Provider value={value}>
      <Popover {...props}>{children}</Popover>
    </ContextContext.Provider>
  )
}

const ContextIcon = () => {
  const { usedTokens, maxTokens, usage } = useContextValue()
  const nonCached = usedTokens - (usage?.cachedInputTokens ?? 0)
  const circumference = 2 * Math.PI * ICON_RADIUS
  const usedPercent = nonCached / maxTokens
  const dashOffset = circumference * (1 - usedPercent)

  return (
    <svg
      aria-label="Model context usage"
      height="20"
      role="img"
      style={{ color: "currentcolor" }}
      viewBox={`0 0 ${ICON_VIEWBOX} ${ICON_VIEWBOX}`}
      width="20"
    >
      <circle
        cx={ICON_CENTER}
        cy={ICON_CENTER}
        fill="none"
        opacity="0.25"
        r={ICON_RADIUS}
        stroke="currentColor"
        strokeWidth={ICON_STROKE_WIDTH}
      />
      <circle
        cx={ICON_CENTER}
        cy={ICON_CENTER}
        fill="none"
        opacity="0.7"
        r={ICON_RADIUS}
        stroke="currentColor"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        strokeWidth={ICON_STROKE_WIDTH}
        style={{ transformOrigin: "center", transform: "rotate(-90deg)" }}
      />
    </svg>
  )
}

export type ContextTriggerProps = ComponentProps<typeof Button>

export const ContextTrigger = ({ children, ...props }: ContextTriggerProps) => {
  const { usedTokens, maxTokens, usage } = useContextValue()
  const nonCached = usedTokens - (usage?.cachedInputTokens ?? 0)
  const usedPercent = nonCached / maxTokens
  const renderedPercent = new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(usedPercent)

  const customTrigger = isValidElement(children) ? children : undefined
  const triggerContent = customTrigger ?? (
    <Button type="button" variant="ghost" {...props}>
      <span className="font-medium text-muted-foreground">{renderedPercent}</span>
      <ContextIcon />
    </Button>
  )

  return <PopoverTrigger render={triggerContent} />
}

export type ContextContentProps = ComponentProps<typeof PopoverContent>

export const ContextContent = ({ className, ...props }: ContextContentProps) => {
  return <PopoverContent className={cn("min-w-60 divide-y overflow-hidden p-0", className)} {...props} />
}

export type ContextContentHeaderProps = ComponentProps<"div">

export const ContextContentHeader = ({
  children,
  className,
  ...props
}: ContextContentHeaderProps) => {
  const { usedTokens, maxTokens, usage } = useContextValue()
  const nonCached = usedTokens - (usage?.cachedInputTokens ?? 0)
  const usedPercent = nonCached / maxTokens
  const displayPct = new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(usedPercent)
  const used = new Intl.NumberFormat("en-US", {
    notation: "compact",
  }).format(usedTokens)
  const total = new Intl.NumberFormat("en-US", {
    notation: "compact",
  }).format(maxTokens)

  return (
    <div className={cn("w-full space-y-2 p-3", className)} {...props}>
      {children ?? (
        <>
          <div className="flex items-center justify-between gap-3 text-xs">
            <p>{displayPct}</p>
            <p className="font-mono text-muted-foreground">
              {used} / {total}
            </p>
          </div>
          <div className="space-y-2">
            <Progress className="bg-muted" value={usedPercent * PERCENT_MAX} />
          </div>
        </>
      )}
    </div>
  )
}

export type ContextContentBodyProps = ComponentProps<"div">

export const ContextContentBody = ({ children, className, ...props }: ContextContentBodyProps) => (
  <div className={cn("w-full p-3", className)} {...props}>
    {children}
  </div>
)

export type ContextContentFooterProps = ComponentProps<"div">

export const ContextContentFooter = ({
  children,
  className,
  ...props
}: ContextContentFooterProps) => {
  const { modelId, usage } = useContextValue()
  const t = useTranslations('chat')
  const costUSD = estimateCost(modelId, usage)
  const totalCost = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(costUSD ?? 0)

  return (
    <div
      className={cn(
        "flex w-full items-center justify-between gap-3 bg-secondary p-3 text-xs",
        className,
      )}
      {...props}
    >
      {children ?? (
        <>
          <span className="text-muted-foreground">{t('context.totalCost')}</span>
          <span>{totalCost}</span>
        </>
      )}
    </div>
  )
}

export type ContextInputUsageProps = ComponentProps<"div">

export const ContextInputUsage = ({ className, children, ...props }: ContextInputUsageProps) => {
  const { usage, modelId } = useContextValue()
  const t = useTranslations('chat')
  const inputTokens = usage?.inputTokens ?? 0

  if (children) {
    return children
  }

  if (!inputTokens) {
    return null
  }

  const inputCost = estimateCost(modelId, { inputTokens })
  const inputCostText = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(inputCost ?? 0)

  return (
    <div className={cn("flex items-center justify-between text-xs", className)} {...props}>
      <span className="text-muted-foreground">{t('context.input')}</span>
      <TokensWithCost costText={inputCostText} tokens={inputTokens} />
    </div>
  )
}

export type ContextOutputUsageProps = ComponentProps<"div">

export const ContextOutputUsage = ({ className, children, ...props }: ContextOutputUsageProps) => {
  const { usage, modelId } = useContextValue()
  const t = useTranslations('chat')
  const outputTokens = usage?.outputTokens ?? 0

  if (children) {
    return children
  }

  if (!outputTokens) {
    return null
  }

  const outputCost = estimateCost(modelId, { outputTokens })
  const outputCostText = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(outputCost ?? 0)

  return (
    <div className={cn("flex items-center justify-between text-xs", className)} {...props}>
      <span className="text-muted-foreground">{t('context.output')}</span>
      <TokensWithCost costText={outputCostText} tokens={outputTokens} />
    </div>
  )
}

export type ContextReasoningUsageProps = ComponentProps<"div">

export const ContextReasoningUsage = ({
  className,
  children,
  ...props
}: ContextReasoningUsageProps) => {
  const { usage, modelId } = useContextValue()
  const t = useTranslations('chat')
  const reasoningTokens = usage?.reasoningTokens ?? 0

  if (children) {
    return children
  }

  if (!reasoningTokens) {
    return null
  }

  const reasoningCost = estimateCost(modelId, { reasoningTokens })
  const reasoningCostText = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(reasoningCost ?? 0)

  return (
    <div className={cn("flex items-center justify-between text-xs", className)} {...props}>
      <span className="text-muted-foreground">{t('context.reasoning')}</span>
      <TokensWithCost costText={reasoningCostText} tokens={reasoningTokens} />
    </div>
  )
}

export type ContextCacheUsageProps = ComponentProps<"div">

export const ContextCacheUsage = ({ className, children, ...props }: ContextCacheUsageProps) => {
  const { usage, modelId } = useContextValue()
  const t = useTranslations('chat')
  const cacheTokens = usage?.cachedInputTokens ?? 0

  if (children) {
    return children
  }

  if (!cacheTokens) {
    return null
  }

  const cacheCost = estimateCost(modelId, { cachedInputTokens: cacheTokens })
  const cacheCostText = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cacheCost ?? 0)

  return (
    <div className={cn("flex items-center justify-between text-xs", className)} {...props}>
      <span className="text-muted-foreground">{t('context.cache')}</span>
      <TokensWithCost costText={cacheCostText} tokens={cacheTokens} />
    </div>
  )
}

const TokensWithCost = ({ tokens, costText }: { tokens?: number; costText?: string }) => (
  <span>
    {tokens === undefined
      ? "—"
      : new Intl.NumberFormat("en-US", {
          notation: "compact",
        }).format(tokens)}
    {costText ? <span className="ml-2 text-muted-foreground">• {costText}</span> : null}
  </span>
)

function estimateCost(modelId?: string, usage?: LanguageModelUsage): number | undefined {
  if (!modelId || !usage) return undefined
  return undefined
}
