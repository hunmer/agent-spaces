"use client";

import { useRouter, usePathname } from "next/navigation";
import { PanelLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/stores/workspace";
import { useSidebar } from "@/components/ui/sidebar";

export function WorkspaceTabs() {
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const { toggleSidebar } = useSidebar();
  const router = useRouter();
  const pathname = usePathname();

  const activeId = pathname.startsWith("/workspace/")
    ? pathname.split("/workspace/")[1]
    : null;

  if (workspaces.length === 0) return null;

  return (
    <div className="flex items-center h-9 bg-background border-b overflow-x-auto shrink-0">
      <button
        onClick={() => toggleSidebar()}
        className="flex items-center justify-center size-8 rounded-md text-muted-foreground hover:bg-accent/50 transition-colors shrink-0 md:hidden"
      >
        <PanelLeft size={16} />
      </button>
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
        </button>
      ))}
    </div>
  );
}
