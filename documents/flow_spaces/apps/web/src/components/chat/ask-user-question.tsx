"use client"

import { HelpCircleIcon, SendIcon } from "lucide-react"
import { useState } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface AskUserQuestionProps {
  question: string
  choices?: string[]
  answer?: string
  status?: "requested" | "answered"
  onAnswer?: (answer: string) => void
}

export function AskUserQuestion({
  question,
  choices = [],
  answer,
  status = "requested",
  onAnswer,
}: AskUserQuestionProps) {
  const [draft, setDraft] = useState("")
  const t = useTranslations('chat')
  const answered = status === "answered" || Boolean(answer)

  return (
    <div className="not-prose rounded-lg border bg-background p-3 text-sm">
      <div className="flex items-start gap-2">
        <HelpCircleIcon className="mt-0.5 size-4 text-muted-foreground" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="font-medium">{question}</div>
          {answered ? (
            <div className="rounded-md bg-muted px-3 py-2 text-muted-foreground">
              {answer}
            </div>
          ) : (
            <>
              {choices.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {choices.map((choice) => (
                    <Button
                      key={choice}
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onAnswer?.(choice)}
                      className="h-7"
                    >
                      {choice}
                    </Button>
                  ))}
                </div>
              )}
              <form
                className="flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  const value = draft.trim()
                  if (!value) return
                  onAnswer?.(value)
                  setDraft("")
                }}
              >
                <Input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  className={cn("h-8 text-sm", choices.length > 0 && "max-w-sm")}
                  placeholder={t('askUser.placeholder')}
                />
                <Button type="submit" size="icon" disabled={!draft.trim()}>
                  <SendIcon className="size-3.5" />
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
