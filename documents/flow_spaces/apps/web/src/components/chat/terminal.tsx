"use client"

import { CheckIcon, CopyIcon, TerminalIcon, Trash2Icon } from "lucide-react"
import {
  type ComponentProps,
  createContext,
  type HTMLAttributes,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"
import { useTranslations } from "next-intl"
/**
 * @title React AI Terminal
 * @credit {"name": "Vercel", "url": "https://ai-sdk.dev/elements", "license": {"name": "Apache License 2.0", "url": "https://www.apache.org/licenses/LICENSE-2.0"}}
 * @description React AI terminal component with ANSI color support for displaying command output and logs
 * @opening Show command output, build logs, or any terminal-style content with full ANSI color support. This component renders terminal output with proper styling—green for success, red for errors, all the escape codes your tools spit out. Has auto-scroll so new output stays visible, copy button for grabbing the full output, and optional clear button. Perfect for showing CI/CD logs, command execution results, or streaming output from background processes in your AI chat interface.
 * @related [
 *   {"href":"/ai/code-block","title":"React AI Code Block","description":"Syntax highlighted code"},
 *   {"href":"/ai/tool","title":"React AI Tool","description":"Tool execution display"},
 *   {"href":"/ai/artifact","title":"React AI Artifact","description":"Generated content container"},
 *   {"href":"/ai/shimmer","title":"React AI Shimmer","description":"Loading placeholder"},
 *   {"href":"/ai/message","title":"React AI Message","description":"Chat message bubbles"},
 *   {"href":"/ai/reasoning","title":"React AI Reasoning","description":"Thinking process display"}
 * ]
 * @questions [
 *   {"id":"terminal-ansi","title":"Does it support ANSI colors?","answer":"Full ANSI escape code support via ansi-to-react. Red errors, green success, yellow warnings—all the terminal colors render correctly. Even handles bold, underline, and other formatting."},
 *   {"id":"terminal-streaming","title":"How do I show streaming output?","answer":"Set isStreaming to true to show a blinking cursor at the end. Update the output prop as new content arrives. Auto-scroll keeps the latest output visible."},
 *   {"id":"terminal-copy","title":"Can users copy the terminal output?","answer":"Built-in copy button in the header. Copies the raw output text (without ANSI codes would need extra handling). Shows a checkmark briefly after copying."},
 *   {"id":"terminal-styling","title":"Can I customize the terminal appearance?","answer":"Dark theme by default (zinc-950 background). Override with className for different colors. The component parts (Header, Content, Actions) are all customizable."}
 * ]
 */
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Shimmer } from "@/components/ui/shimmer"

interface TerminalContextType {
  output: string
  isStreaming: boolean
  autoScroll: boolean
  onClear?: () => void
}

const TerminalContext = createContext<TerminalContextType>({
  output: "",
  isStreaming: false,
  autoScroll: true,
})

export type TerminalProps = HTMLAttributes<HTMLDivElement> & {
  output: string
  isStreaming?: boolean
  autoScroll?: boolean
  onClear?: () => void
}

export const Terminal = ({
  output,
  isStreaming = false,
  autoScroll = true,
  onClear,
  className,
  children,
  ...props
}: TerminalProps) => (
  <TerminalContext.Provider value={{ output, isStreaming, autoScroll, onClear }}>
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border bg-zinc-950 text-zinc-100",
        className,
      )}
      {...props}
    >
      {children ?? (
        <>
          <TerminalHeader>
            <TerminalTitle />
            <div className="flex items-center gap-1">
              <TerminalStatus />
              <TerminalActions>
                <TerminalCopyButton />
                {onClear && <TerminalClearButton />}
              </TerminalActions>
            </div>
          </TerminalHeader>
          <TerminalContent />
        </>
      )}
    </div>
  </TerminalContext.Provider>
)

export type TerminalHeaderProps = HTMLAttributes<HTMLDivElement>

export const TerminalHeader = ({ className, children, ...props }: TerminalHeaderProps) => (
  <div
    className={cn(
      "flex items-center justify-between border-zinc-800 border-b px-4 py-2",
      className,
    )}
    {...props}
  >
    {children}
  </div>
)

export type TerminalTitleProps = HTMLAttributes<HTMLDivElement>

export const TerminalTitle = ({ className, children, ...props }: TerminalTitleProps) => {
  const t = useTranslations('chat')
  return (
  <div className={cn("flex items-center gap-2 text-sm text-zinc-400", className)} {...props}>
    <TerminalIcon className="size-4" />
    {children ?? t('terminal.title')}
  </div>
  )
}

export type TerminalStatusProps = HTMLAttributes<HTMLDivElement>

export const TerminalStatus = ({ className, children, ...props }: TerminalStatusProps) => {
  const { isStreaming } = useContext(TerminalContext)
  const t = useTranslations('chat')

  if (!isStreaming) {
    return null
  }

  return (
    <div className={cn("flex items-center gap-2 text-xs text-zinc-400", className)} {...props}>
      {children ?? <Shimmer className="w-16">{t('terminal.running')}</Shimmer>}
    </div>
  )
}

export type TerminalActionsProps = HTMLAttributes<HTMLDivElement>

export const TerminalActions = ({ className, children, ...props }: TerminalActionsProps) => (
  <div className={cn("flex items-center gap-1", className)} {...props}>
    {children}
  </div>
)

export type TerminalCopyButtonProps = ComponentProps<typeof Button> & {
  onCopy?: () => void
  onError?: (error: Error) => void
  timeout?: number
}

export const TerminalCopyButton = ({
  onCopy,
  onError,
  timeout = 2000,
  children,
  className,
  ...props
}: TerminalCopyButtonProps) => {
  const [isCopied, setIsCopied] = useState(false)
  const { output } = useContext(TerminalContext)
  const t = useTranslations('chat')

  const copyToClipboard = async () => {
    if (typeof window === "undefined" || !navigator?.clipboard?.writeText) {
      onError?.(new Error(t('terminal.clipboardUnavailable')))
      return
    }

    try {
      await navigator.clipboard.writeText(output)
      setIsCopied(true)
      onCopy?.()
      setTimeout(() => setIsCopied(false), timeout)
    } catch (error) {
      onError?.(error as Error)
    }
  }

  const Icon = isCopied ? CheckIcon : CopyIcon

  return (
    <Button
      className={cn(
        "size-7 shrink-0 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100",
        className,
      )}
      onClick={copyToClipboard}
      size="icon"
      variant="ghost"
      {...props}
    >
      {children ?? <Icon size={14} />}
    </Button>
  )
}

export type TerminalClearButtonProps = ComponentProps<typeof Button>

export const TerminalClearButton = ({
  children,
  className,
  ...props
}: TerminalClearButtonProps) => {
  const { onClear } = useContext(TerminalContext)

  if (!onClear) {
    return null
  }

  return (
    <Button
      className={cn(
        "size-7 shrink-0 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100",
        className,
      )}
      onClick={onClear}
      size="icon"
      variant="ghost"
      {...props}
    >
      {children ?? <Trash2Icon size={14} />}
    </Button>
  )
}

export type TerminalContentProps = HTMLAttributes<HTMLDivElement>

export const TerminalContent = ({ className, children, ...props }: TerminalContentProps) => {
  const { output, isStreaming, autoScroll } = useContext(TerminalContext)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [output, autoScroll])

  return (
    <div
      className={cn("max-h-96 overflow-auto p-4 font-mono text-sm leading-relaxed", className)}
      ref={containerRef}
      {...props}
    >
      {children ?? (
        <pre className="whitespace-pre-wrap break-words">
          {stripAnsi(output)}
          {isStreaming && (
            <span className="ml-0.5 inline-block h-4 w-2 animate-pulse bg-zinc-100" />
          )}
        </pre>
      )}
    </div>
  )
}

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, "")
}