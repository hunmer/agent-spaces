"use client";

import { JsonViewer } from "@/components/viewers/json-viewer";
import { Markdown } from "@/components/ui/markdown";
import { cn, copyToClipboard } from "@/lib/utils";
import type { WorkflowAgentTimelineItem } from "@agent-spaces/shared";
import { AlertCircle, Check, CheckCircle2, ChevronDown, Copy, Loader2, Play, Wrench } from "lucide-react";
import { useState } from "react";

export function normalizeChatTimeline(
  timeline?: WorkflowAgentTimelineItem[],
): WorkflowAgentTimelineItem[] {
  return timeline ?? [];
}

export function ChatToolTimeline({
  timeline,
  workspaceId,
  onRerunTool,
  showTools = true,
  streaming = false,
}: {
  timeline?: WorkflowAgentTimelineItem[];
  workspaceId?: string;
  onRerunTool?: (item: Extract<WorkflowAgentTimelineItem, { type: "tool" }>) => void;
  showTools?: boolean;
  streaming?: boolean;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const items = normalizeChatTimeline(timeline);

  const handleCopyTool = async (e: React.MouseEvent, item: WorkflowAgentTimelineItem) => {
    e.stopPropagation();
    try {
      await copyToClipboard(JSON.stringify(item, null, 2));
      setCopiedId(item.id);
      window.setTimeout(() => {
        setCopiedId((current) => (current === item.id ? null : current));
      }, 1200);
    } catch {
      /* clipboard unavailable */
    }
  };
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

        if (!showTools) return null;

        const open = expanded[item.id];
        const missingResult = item.status === "success" && item.result === undefined;
        const isError = item.status === "error" || missingResult;
        return (
          <div key={`${item.id}-${index}`} className="rounded-lg border bg-background/80 text-xs shadow-sm">
            <div className="group flex w-full items-center gap-1 px-2.5 py-2">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
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
              </button>
              <button
                type="button"
                title={copiedId === item.id ? "已复制" : "复制完整 JSON"}
                className={cn(
                  "shrink-0 rounded p-1 text-muted-foreground transition-opacity hover:bg-accent hover:text-foreground",
                  copiedId === item.id ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
                )}
                onClick={(e) => handleCopyTool(e, item)}
              >
                {copiedId === item.id ? (
                  <Check className="size-3.5 text-emerald-600" />
                ) : (
                  <Copy className="size-3.5" />
                )}
              </button>
              {onRerunTool && !streaming && item.status !== "running" ? (
                <button
                  type="button"
                  title="再次运行工具"
                  className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRerunTool(item);
                  }}
                >
                  <Play className="size-3.5" />
                </button>
              ) : null}
              <button
                type="button"
                className="shrink-0 p-0.5 text-muted-foreground"
                onClick={() => setExpanded((state) => ({ ...state, [item.id]: !state[item.id] }))}
              >
                <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
              </button>
            </div>
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
  if (!item.content.trim()) return null;
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
