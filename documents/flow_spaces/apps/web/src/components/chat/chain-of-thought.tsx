"use client"

import {
  BrainIcon,
  ChevronDownIcon,
  DotIcon,
  type LucideIcon,
} from "lucide-react"
import type { ComponentProps, ReactNode } from "react"
import { createContext, memo, useCallback, useContext, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Loader } from "@/components/ui/loader"
import { cn } from "@/lib/utils"

interface ChainOfThoughtContextValue {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
}

const ChainOfThoughtContext = createContext<ChainOfThoughtContextValue | null>(null)

export function isIgnorableChainOfThoughtText(text: string) {
  const raw = text.trim()
  const trimmed = stripSubagentProgressPrefix(raw)
  const isSubagentProgress = trimmed !== raw
  return /^Claude$/i.test(trimmed)
    || /^(Reading|Searching)(\.{1,3}|…)?$/i.test(trimmed)
    || (isSubagentProgress && /^(Reading|Searching)\s+\S.+$/i.test(trimmed))
    || /^(Read|Search|Grep|Glob|SemanticSearch|WebSearch)\s+running\s+\(\d+s\)$/i.test(trimmed)
}

function stripSubagentProgressPrefix(text: string) {
  return text.replace(/^\[[^\]]+\]\s+subagent progress\s+\|\s*/i, "")
}

const useChainOfThought = () => {
  const context = useContext(ChainOfThoughtContext)
  if (!context) {
    throw new Error("ChainOfThought components must be used within ChainOfThought")
  }
  return context
}

export type ChainOfThoughtProps = ComponentProps<"div"> & {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
}

export const ChainOfThought = memo(
  ({
    className,
    open,
    defaultOpen = false,
    onOpenChange,
    children,
    ...props
  }: ChainOfThoughtProps) => {
    const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen)
    const isOpen = open ?? uncontrolledOpen
    const setIsOpen = useCallback(
      (nextOpen: boolean) => {
        if (open === undefined) {
          setUncontrolledOpen(nextOpen)
        }
        onOpenChange?.(nextOpen)
      },
      [onOpenChange, open],
    )

    const chainOfThoughtContext = useMemo(() => ({ isOpen, setIsOpen }), [isOpen, setIsOpen])

    return (
      <ChainOfThoughtContext.Provider value={chainOfThoughtContext}>
        <div className={cn("not-prose min-w-0 max-w-full overflow-hidden space-y-4", className)} {...props}>
          {children}
        </div>
      </ChainOfThoughtContext.Provider>
    )
  },
)

export type ChainOfThoughtHeaderProps = ComponentProps<typeof CollapsibleTrigger> & {
  loading?: boolean
}

export const ChainOfThoughtHeader = memo(
  ({ className, children, loading, ...props }: ChainOfThoughtHeaderProps) => {
    const { isOpen, setIsOpen } = useChainOfThought()
    const t = useTranslations('chat')

    return (
      <Collapsible onOpenChange={setIsOpen} open={isOpen}>
        <CollapsibleTrigger
          className={cn(
            "flex w-full items-center gap-2 text-muted-foreground text-sm transition-colors hover:text-foreground",
            className,
          )}
          {...props}
          >
          <BrainIcon className="size-4" />
          <span className="min-w-0 flex-1 truncate text-left">{children ?? t('chainOfThought.defaultHeader')}</span>
          {loading && <Loader size={14} />}
          <ChevronDownIcon
            className={cn("size-4 transition-transform", isOpen ? "rotate-180" : "rotate-0")}
          />
        </CollapsibleTrigger>
      </Collapsible>
    )
  },
)

export type ChainOfThoughtStepProps = ComponentProps<"div"> & {
  icon?: LucideIcon
  label: ReactNode
  description?: ReactNode
  status?: "complete" | "active" | "pending"
}

export const ChainOfThoughtStep = memo(
  ({
    className,
    icon: Icon = DotIcon,
    label,
    description,
    status = "complete",
    children,
    ...props
  }: ChainOfThoughtStepProps) => {
    const statusStyles = {
      complete: "text-muted-foreground",
      active: "text-foreground",
      pending: "text-muted-foreground/50",
    }

    return (
      <div
        className={cn(
          "flex gap-2 text-sm",
          statusStyles[status],
          "fade-in-0 slide-in-from-top-2 animate-in",
          className,
        )}
        {...props}
      >
        <div className="relative mt-0.5">
          <Icon className="size-4" />
          <div className="-mx-px absolute top-7 bottom-0 left-1/2 w-px bg-border" />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div>{label}</div>
          {description && <div className="text-muted-foreground text-xs">{description}</div>}
          {children}
        </div>
      </div>
    )
  },
)

export type ChainOfThoughtSearchResultsProps = ComponentProps<"div">

export const ChainOfThoughtSearchResults = memo(
  ({ className, ...props }: ChainOfThoughtSearchResultsProps) => (
    <div className={cn("flex flex-wrap items-center gap-2", className)} {...props} />
  ),
)

export type ChainOfThoughtSearchResultProps = ComponentProps<typeof Badge>

export const ChainOfThoughtSearchResult = memo(
  ({ className, children, ...props }: ChainOfThoughtSearchResultProps) => (
    <Badge
      className={cn("gap-1 px-2 py-0.5 font-normal text-xs", className)}
      variant="secondary"
      {...props}
    >
      {children}
    </Badge>
  ),
)

export type ChainOfThoughtContentProps = ComponentProps<typeof CollapsibleContent>

export const ChainOfThoughtContent = memo(
  ({ className, children, ...props }: ChainOfThoughtContentProps) => {
    const { isOpen } = useChainOfThought()

    return (
      <Collapsible open={isOpen}>
        <CollapsibleContent
          className={cn(
            "mt-2 min-w-0 max-w-full space-y-3 overflow-hidden",
            "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 text-popover-foreground outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
            className,
          )}
          {...props}
        >
          {children}
        </CollapsibleContent>
      </Collapsible>
    )
  },
)

export type ChainOfThoughtImageProps = ComponentProps<"div"> & {
  caption?: string
}

export const ChainOfThoughtImage = memo(
  ({ className, children, caption, ...props }: ChainOfThoughtImageProps) => (
    <div className={cn("mt-2 space-y-2", className)} {...props}>
      <div className="relative flex max-h-[22rem] items-center justify-center overflow-hidden rounded-lg bg-muted p-3">
        {children}
      </div>
      {caption && <p className="text-muted-foreground text-xs">{caption}</p>}
    </div>
  ),
)

ChainOfThought.displayName = "ChainOfThought"
ChainOfThoughtHeader.displayName = "ChainOfThoughtHeader"
ChainOfThoughtStep.displayName = "ChainOfThoughtStep"
ChainOfThoughtSearchResults.displayName = "ChainOfThoughtSearchResults"
ChainOfThoughtSearchResult.displayName = "ChainOfThoughtSearchResult"
ChainOfThoughtContent.displayName = "ChainOfThoughtContent"
ChainOfThoughtImage.displayName = "ChainOfThoughtImage"
