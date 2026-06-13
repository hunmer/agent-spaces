"use client";

import { JsonViewer } from "@/components/viewers/json-viewer";
import { Markdown } from "@/components/ui/markdown";
import { cn } from "@/lib/utils";
import type { WorkflowAgentTimelineItem } from "@agent-spaces/shared";
import { AlertCircle, CheckCircle2, ChevronDown, Loader2, Wrench } from "lucide-react";
import { useState } from "react";

export function normalizeChatTimeline(
  timeline?: WorkflowAgentTimelineItem[],
): WorkflowAgentTimelineItem[] {
  if (!timeline?.length) return [];
  const thinking = timeline.find((item) => item.type === "thinking");
  if (!thinking) return timeline;
  return [thinking, ...timeline.filter((item) => item.id !== thinking.id)];
}

export function ChatToolTimeline({
  timeline,
  workspaceId,
}: {
  timeline?: WorkflowAgentTimelineItem[];
  workspaceId?: string;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const items = normalizeChatTimeline(timeline);
  if (!items.length) return null;

  return (
    <div className="mt-2 flex w-full flex-col gap-1.5">
      {items.map((item, index) => {
        if (item.type === "thinking") {
          return (
            <ThinkingTimelineCard
              key={`${item.id}-${index}`}
              item={item}
              expanded={Boolean(expanded[item.id])}
              onToggle={() => setExpanded((state) => ({ ...state, [item.id]: !state[item.id] }))}
            />
          );
        }

        if (item.type === "message") {
          return <MessageTimelineCard key={`${item.id}-${index}`} item={item} workspaceId={workspaceId} />;
        }

        const open = expanded[item.id];
        const missingResult = item.status === "success" && item.result === undefined;
        const isError = item.status === "error" || missingResult;
        return (
          <div key={`${item.id}-${index}`} className="rounded-lg border bg-background/80 text-xs shadow-sm">
            <button
              type="button"
              className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
              onClick={() => setExpanded((state) => ({ ...state, [item.id]: !state[item.id] }))}
            >
              {item.status === "running" ? (
                <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
              ) : isError ? (
                <AlertCircle className="size-3.5 shrink-0 text-destructive" />
              ) : (
                <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600" />
              )}
              <Wrench className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate font-medium">{item.name}</span>
              <ChevronDown className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
            </button>
            {open ? (
              <div className="border-t px-2.5 py-2">
                <ToolJsonBlock label="Input" value={item.input} />
                {item.result !== undefined ? <ToolJsonBlock label="Result" value={item.result} /> : null}
                {missingResult ? <ToolJsonBlock label="Result" value={{ success: false, error: "Tool did not return a result." }} /> : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function MessageTimelineCard({
  item,
  workspaceId,
}: {
  item: Extract<WorkflowAgentTimelineItem, { type: "message" }>;
  workspaceId?: string;
}) {
  return (
    <div className="rounded-lg border bg-muted/50 px-2.5 py-2 text-xs leading-relaxed shadow-sm">
      <Markdown content={item.content} workspaceId={workspaceId} />
    </div>
  );
}

function ThinkingTimelineCard({
  item,
  expanded,
  onToggle,
}: {
  item: Extract<WorkflowAgentTimelineItem, { type: "thinking" }>;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 text-xs shadow-sm">
      <button type="button" className="flex w-full items-center gap-2 px-2.5 py-2 text-left" onClick={onToggle}>
        <ChevronDown className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")} />
        <span className="min-w-0 flex-1 truncate font-medium text-muted-foreground">思考过程</span>
      </button>
      {expanded ? (
        <div className="whitespace-pre-wrap break-words border-t px-2.5 py-2 text-muted-foreground">
          {item.content}
        </div>
      ) : null}
    </div>
  );
}

function ToolJsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <JsonViewer
      data={value as import("@/components/viewers/json-viewer").JsonValue}
      title={label}
      defaultExpanded={2}
      rootName={label.toLowerCase()}
      className="mb-2 last:mb-0"
      style={{ maxHeight: "10rem", overflow: "auto" }}
    />
  );
}
