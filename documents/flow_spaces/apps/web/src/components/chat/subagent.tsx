"use client"

import { BotIcon } from "lucide-react"
import type { ComponentProps, HTMLAttributes } from "react"
import { memo } from "react"
import { useTranslations } from "next-intl"
/**
 * @title React AI Agent
 * @credit {"name": "Vercel", "url": "https://ai-sdk.dev/elements", "license": {"name": "Apache License 2.0", "url": "https://www.apache.org/licenses/LICENSE-2.0"}}
 * @description React AI agent component for displaying AI agent configurations with tools and instructions
 * @opening Show your AI agent's configuration in a structured way—perfect for debugging, documentation, or agent builders. This component displays the agent's name, model, instructions, available tools (with expandable JSON schemas), and output schema. Great for understanding what an agent can do, what tools it has access to, and how it's configured.
 * @related [
 *   {"href":"/ai/tool","title":"React AI Tool","description":"Tool execution display"},
 *   {"href":"/ai/message","title":"React AI Message","description":"Chat message bubbles"},
 *   {"href":"/ai/reasoning","title":"React AI Reasoning","description":"Thinking process display"},
 *   {"href":"/ai/code-block","title":"React AI Code Block","description":"Syntax highlighted code"},
 *   {"href":"/ai/artifact","title":"React AI Artifact","description":"Generated content container"},
 *   {"href":"/ai/sandbox","title":"React AI Sandbox","description":"Code execution environment"}
 * ]
 * @questions [
 *   {"id":"agent-tools","title":"How do I display agent tools?","answer":"Use AgentTools with AgentTool children. Each tool shows its description as the trigger and expands to reveal the JSON schema. Pass a tool object with description and jsonSchema/inputSchema properties."},
 *   {"id":"agent-instructions","title":"How do I show agent instructions?","answer":"Use AgentInstructions with the system prompt as children. It renders in a muted box with 'Instructions' label above."},
 *   {"id":"agent-output","title":"How do I display output schema?","answer":"Use AgentOutput with a schema prop containing the TypeScript type or JSON schema as a string. Shows in a code block with syntax highlighting."},
 *   {"id":"agent-model","title":"Can I show the model being used?","answer":"Yes, pass model prop to AgentHeader. It displays as a secondary badge next to the agent name (e.g., 'gpt-4', 'claude-3')."}
 * ]
 */
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export type AgentProps = HTMLAttributes<HTMLDivElement>

export const Agent = memo(({ className, ...props }: AgentProps) => (
  <div className={cn("not-prose min-w-0 w-full rounded-md border", className)} {...props} />
))

export type AgentHeaderProps = HTMLAttributes<HTMLDivElement> & {
  name: string
  model?: string
}

export const AgentHeader = memo(({ className, name, model, ...props }: AgentHeaderProps) => (
  <div className={cn("flex min-w-0 w-full items-center justify-between gap-4 p-3", className)} {...props}>
    <div className="flex min-w-0 items-center gap-2">
      <BotIcon className="size-4 text-muted-foreground" />
      <span className="min-w-0 truncate font-medium text-sm">{name}</span>
      {model && (
        <Badge className="min-w-0 max-w-40 truncate font-mono text-xs" variant="secondary">
          {model}
        </Badge>
      )}
    </div>
  </div>
))

export type AgentContentProps = HTMLAttributes<HTMLDivElement>

export const AgentContent = memo(({ className, ...props }: AgentContentProps) => (
  <div className={cn("min-w-0 space-y-4 p-4 pt-0", className)} {...props} />
))

export type AgentInstructionsProps = HTMLAttributes<HTMLDivElement> & {
  children: string
}

export const AgentInstructions = memo(
  ({ className, children, ...props }: AgentInstructionsProps) => {
    const t = useTranslations('chat')
    return (
    <div className={cn("space-y-2", className)} {...props}>
      <span className="font-medium text-muted-foreground text-sm">{t('subagent.instructions')}</span>
      <div className="rounded-md bg-muted/50 p-3 text-muted-foreground text-sm">
        <p>{children}</p>
      </div>
    </div>
    )
  },
)

export type AgentToolsProps = ComponentProps<typeof Accordion>

export const AgentTools = memo(({ className, ...props }: AgentToolsProps) => {
  const t = useTranslations('chat')
  return (
  <div className={cn("space-y-2", className)}>
    <span className="font-medium text-muted-foreground text-sm">{t('subagent.tools')}</span>
    <Accordion className="rounded-md border" multiple {...props} />
  </div>
  )
})

interface ToolSchema {
  description?: string
  jsonSchema?: object
  inputSchema?: object
}

export type AgentToolProps = ComponentProps<typeof AccordionItem> & {
  tool: ToolSchema
}

export const AgentTool = memo(({ className, tool, value, ...props }: AgentToolProps) => {
  const schema = "jsonSchema" in tool && tool.jsonSchema ? tool.jsonSchema : tool.inputSchema
  const t = useTranslations('chat')

  return (
    <AccordionItem className={cn("border-b last:border-b-0", className)} value={value} {...props}>
      <AccordionTrigger className="px-3 py-2 text-sm hover:no-underline">
        {tool.description ?? t('subagent.noDescription')}
      </AccordionTrigger>
      <AccordionContent className="px-3 pb-3">
        <div className="rounded-md bg-muted/50">
          <pre className="max-w-full overflow-auto p-3 font-mono text-xs">
            {JSON.stringify(schema, null, 2)}
          </pre>
        </div>
      </AccordionContent>
    </AccordionItem>
  )
})

export type AgentOutputProps = HTMLAttributes<HTMLDivElement> & {
  schema: string
}

export const AgentOutput = memo(({ className, schema, ...props }: AgentOutputProps) => {
  const t = useTranslations('chat')
  return (
  <div className={cn("space-y-2", className)} {...props}>
    <span className="font-medium text-muted-foreground text-sm">{t('subagent.outputSchema')}</span>
    <div className="rounded-md bg-muted/50">
      <pre className="overflow-auto p-3 font-mono text-xs">{schema}</pre>
    </div>
  </div>
  )
})

Agent.displayName = "Agent"
AgentHeader.displayName = "AgentHeader"
AgentContent.displayName = "AgentContent"
AgentInstructions.displayName = "AgentInstructions"
AgentTools.displayName = "AgentTools"
AgentTool.displayName = "AgentTool"
AgentOutput.displayName = "AgentOutput"
