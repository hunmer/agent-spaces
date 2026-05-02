"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Workspace } from "@agent-spaces/shared";

export function WorkspaceTabs() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const router = useRouter();
  const pathname = usePathname();

  const activeId = pathname.startsWith("/workspace/")
    ? pathname.split("/workspace/")[1]
    : null;

  useEffect(() => {
    fetch("/api/workspaces")
      .then((r) => r.json())
      .then(setWorkspaces)
      .catch(() => {});
  }, []);

  if (workspaces.length === 0) return null;

  return (
    <div className="flex items-center h-9 bg-background border-b overflow-x-auto shrink-0">
      {workspaces.map((ws) => (
        <button
          key={ws.id}
          onClick={() => router.push(`/workspace/${ws.id}`)}
          className={cn(
            "group flex items-center gap-1.5 px-3 h-full text-sm border-r whitespace-nowrap hover:bg-accent/50 transition-colors",
            activeId === ws.id
              ? "bg-accent text-accent-foreground font-medium"
              : "text-muted-foreground"
          )}
        >
          <span className="max-w-[160px] truncate">{ws.name}</span>
          {activeId === ws.id && (
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
              active
            </Badge>
          )}
        </button>
      ))}
    </div>
  );
}
