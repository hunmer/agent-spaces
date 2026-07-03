"use client";

import { useRouter, usePathname } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { LayoutGrid, MoreHorizontal, PanelLeft, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { tauriNavigate } from "@/lib/navigate";
import { useWorkspaceStore } from "@/stores/workspace";
import { useSidebar } from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { workspaceIdFromLocation } from "@/lib/routes";

function buildWorkspaceHref(id: string) {
  return `/workspace/${id}`;
}

export function WorkspaceTabs() {
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const openWorkspaceDialog = useWorkspaceStore((state) => state.openWorkspaceDialog);
  const { toggleSidebar } = useSidebar();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tc = useTranslations("common");

  const activeId = workspaceIdFromLocation(pathname, searchParams.toString());

  return (
    <div className="flex items-center h-12 px-3 bg-transparent overflow-x-auto shrink-0">
      <button
        onClick={() => toggleSidebar()}
        className="flex items-center justify-center size-8 rounded-lg text-muted-foreground hover:bg-accent/50 transition-colors shrink-0 md:hidden cursor-pointer"
      >
        <PanelLeft size={16} />
      </button>
      <div className="flex items-center gap-1 rounded-xl p-1">
        {workspaces.filter(ws => !ws.isWorktree).map((ws) => (
          <button
            key={ws.id}
            onClick={() => tauriNavigate(router, buildWorkspaceHref(ws.id))}
            className={cn(
              "flex items-center gap-1.5 px-3.5 h-7 text-[13px] font-medium rounded-lg transition-all whitespace-nowrap",
              activeId === ws.id
                ? "bg-primary text-primary-foreground shadow-[rgba(0,0,0,0.08)_0px_4px_6px]"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
            )}
          >
            <span className="max-w-[160px] truncate">{ws.name}</span>
          </button>
        ))}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center justify-center size-8 rounded-lg text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors shrink-0 cursor-pointer ml-auto">
          <MoreHorizontal size={16} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => openWorkspaceDialog()}>
            <Plus className="size-3.5" />
            {tc("add")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => tauriNavigate(router, "/workspaces")}>
            <LayoutGrid className="size-3.5" />
            {tc("manage")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
