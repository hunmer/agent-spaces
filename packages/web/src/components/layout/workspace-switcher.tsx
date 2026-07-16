"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, Plus, Settings2, Check, FolderOpen } from "lucide-react";
import { useTranslations } from "next-intl";
import { tauriNavigate } from "@/lib/navigate";
import { useWorkspaceStore } from "@/stores/workspace";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { workspaceIdFromLocation } from "@/lib/routes";

function buildWorkspaceHref(id: string) {
  return `/workspace/${id}`;
}

/**
 * 工作空间切换器：用作 FlexLayoutShell 工具栏标题区的自定义 UI。
 * 点击展开所有工作空间，可切换 / 新建 / 管理。
 */
export function WorkspaceSwitcher({ workspaceId }: { workspaceId: string }) {
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const openWorkspaceDialog = useWorkspaceStore((state) => state.openWorkspaceDialog);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tc = useTranslations("common");

  const list = workspaces.filter((ws) => !ws.isWorktree);
  const activeId = workspaceIdFromLocation(pathname, searchParams.toString()) || workspaceId;
  const active = list.find((ws) => ws.id === activeId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium hover:bg-accent transition-colors"
            title={active?.name ?? "Workspace"}
          >
            <FolderOpen className="size-4 text-muted-foreground" />
            <span className="max-w-[180px] truncate">{active?.name ?? "Workspace"}</span>
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </button>
        }
      />
      <DropdownMenuContent align="start" className="min-w-56">
        {list.length === 0 && (
          <div className="px-2 py-3 text-center text-xs text-muted-foreground">暂无工作空间</div>
        )}
        {list.map((ws) => (
          <DropdownMenuItem
            key={ws.id}
            onClick={() => tauriNavigate(router, buildWorkspaceHref(ws.id))}
            className="gap-2"
          >
            <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate">{ws.name}</span>
            {ws.id === activeId && <Check className="size-3.5 text-primary" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => openWorkspaceDialog()}>
          <Plus className="size-3.5" />
          {tc("add")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => tauriNavigate(router, "/workspaces")}>
          <Settings2 className="size-3.5" />
          {tc("manage")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
