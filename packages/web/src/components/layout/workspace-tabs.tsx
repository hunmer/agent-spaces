"use client";

import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { useWorkspaceTabs } from "@/stores/workspace-tabs";
import { cn } from "@/lib/utils";

export function WorkspaceTabs() {
  const { tabs, activeId, closeTab } = useWorkspaceTabs();
  const router = useRouter();

  if (tabs.length === 0) return null;

  return (
    <div className="flex items-center h-9 bg-background border-b overflow-x-auto shrink-0">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => router.push(`/workspace/${tab.id}`)}
          className={cn(
            "group flex items-center gap-1.5 px-3 h-full text-sm border-r whitespace-nowrap hover:bg-accent/50 transition-colors",
            activeId === tab.id
              ? "bg-accent text-accent-foreground font-medium"
              : "text-muted-foreground"
          )}
        >
          <span className="max-w-[160px] truncate">{tab.name}</span>
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              closeTab(tab.id);
              if (activeId === tab.id) {
                const remaining = tabs.filter((t) => t.id !== tab.id);
                if (remaining.length > 0) {
                  router.push(`/workspace/${remaining[0].id}`);
                } else {
                  router.push("/");
                }
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.stopPropagation();
                closeTab(tab.id);
                if (activeId === tab.id) {
                  const remaining = tabs.filter((t) => t.id !== tab.id);
                  if (remaining.length > 0) {
                    router.push(`/workspace/${remaining[0].id}`);
                  } else {
                    router.push("/");
                  }
                }
              }
            }}
            className="opacity-0 group-hover:opacity-100 hover:bg-muted rounded p-0.5 transition-opacity"
          >
            <X className="h-3 w-3" />
          </span>
        </button>
      ))}
    </div>
  );
}
