"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { tauriNavigate } from "@/lib/navigate";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { UserIcon } from "@/components/common/user-icon";
import DashboardNavigation from "@/components/sidebar/nav-main";
import { NotificationsPopover } from "@/components/sidebar/nav-notifications";
import { useIsMobile } from "@/hooks/use-mobile";
import { ServerSwitcher } from "@/components/sidebar/server-switcher";
import { AnimatedThemeToggler } from "@/components/decorations/animated-theme-toggler";
import { CommandIcon, GraduationCap } from "lucide-react";
import { useWorkspaceStore } from "@/stores/workspace";
import { useNotificationStore } from "@/stores/notification";
import { useKeyboardShortcuts } from "@/stores/keyboard-shortcuts";
import type { Workspace } from "@agent-spaces/shared";
import { isWorkspacePath, workspaceIdFromLocation } from "@/lib/routes";
import { getWS } from "@/lib/ws";
import { sdk } from "@/lib/sdk";
import { useSidebarDialogs } from "./use-sidebar-dialogs";
import { useSidebarEvents } from "./use-sidebar-events";
import { useSidebarCommands } from "./use-sidebar-commands";
import { useCommandPalette } from "@/stores/command-palette";
import { buildDashboardRoutes } from "./sidebar-dashboard-routes";
import { SidebarDialogGroup } from "./sidebar-dialog-group";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { removeToken } from "@/lib/auth";
import { LogOut } from "lucide-react";

function buildWorkspaceHref(id: string) {
  return `/workspace/${id}`;
}

export function DashboardSidebar() {
  const { state, toggleSidebar, setOpenMobile } = useSidebar();
  const { matchesEvent } = useKeyboardShortcuts();
  const pathname = usePathname();
  const router = useRouter();
  const ts = useTranslations("sidebar");

  const isCollapsed = state === "collapsed";
  const [userToggled, setUserToggled] = useState(false);
  const toggleSidebarWithAnimation = useCallback(() => {
    setUserToggled(true);
    toggleSidebar();
  }, [toggleSidebar]);
  const isWorkspace = isWorkspacePath(pathname);
  const isMobile = useIsMobile();
  const currentWorkspaceId = workspaceIdFromLocation(
    pathname,
    typeof window !== "undefined" ? window.location.search : ""
  );
  const workspaces = useWorkspaceStore((store) => store.workspaces);
  const setWorkspaces = useWorkspaceStore((store) => store.setWorkspaces);
  const removeWorkspace = useWorkspaceStore((store) => store.removeWorkspace);
  const openWorkspaceDialog = useWorkspaceStore((s) => s.openWorkspaceDialog);
  const [wsConnected, setWsConnected] = useState(false);
  const dialogs = useSidebarDialogs(isMobile);

  useEffect(() => {
    if (!currentWorkspaceId) {
      setWsConnected(false);
      return;
    }
    const check = () => {
      try {
        setWsConnected(getWS(currentWorkspaceId).connected);
      } catch {
        setWsConnected(false);
      }
    };
    check();
    const id = setInterval(check, 3000);
    return () => clearInterval(id);
  }, [currentWorkspaceId]);

  const refreshWorkspaces = useCallback(() => {
    sdk.workspace.list()
      .then(setWorkspaces)
      .catch(() => {});
  }, [setWorkspaces]);

  useEffect(() => {
    refreshWorkspaces();
  }, [refreshWorkspaces]);

  // 通知加载：无选中 workspace（主页）时加载全局聚合通知；
  // workspace 页由 workspace-shell 负责，此处仅在主页触发。
  const notificationLoad = useNotificationStore((s) => s.load);
  useEffect(() => {
    if (!currentWorkspaceId) notificationLoad('');
  }, [currentWorkspaceId, notificationLoad]);

  const handleDelete = useCallback(
    async (ws: Workspace) => {
      await sdk.workspace.delete(ws.id);
      removeWorkspace(ws.id);
      if (currentWorkspaceId === ws.id) {
        const remaining = workspaces.filter((w) => w.id !== ws.id);
        tauriNavigate(
          router,
          remaining.length > 0
            ? buildWorkspaceHref(remaining[0].id)
            : "/"
        );
      }
    },
    [removeWorkspace, currentWorkspaceId, workspaces, router]
  );

  useSidebarEvents({
    toggleSidebarWithAnimation,
    isMobile,
    router,
    setterMap: dialogs.setterMap,
    matchesEvent,
    setUserToggled,
  });

  useSidebarCommands({
    isMobile,
    router,
    toggleSidebarWithAnimation,
    dialogs,
  });

  const dashboardRoutes = buildDashboardRoutes({
    tSidebar: ts,
    tCommon: useTranslations("common"),
    isMobile,
    workspaces,
    openWorkspaceDialog,
    handleDelete,
    setterMap: dialogs.setterMap,
    setModelsDialogProvider: dialogs.setModelsDialogProvider,
  });

  return (
    <Sidebar
      variant="floating"
      collapsible="icon"
      animateStateChange={userToggled}
      className="overflow-hidden"
    >
      <SidebarHeader
        className={cn(
          "flex shrink-0 rounded-xl border border-sidebar-border bg-sidebar mx-2 mt-2 px-3 py-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]",
          isCollapsed
            ? "flex-row items-center justify-between gap-y-4 md:flex-col md:items-center md:justify-center"
            : "flex-row items-center justify-between"
        )}
      >
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 relative outline-none">
            <UserIcon size={isCollapsed ? "sm" : "md"} />
            <span
              className={cn(
                "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-sidebar",
                wsConnected ? "bg-green-500" : "bg-yellow-500"
              )}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start" className="w-48">
            <DropdownMenuItem onClick={() => { removeToken(); router.push("/login"); }}>
              <LogOut className="mr-2 h-4 w-4" />
              {ts("logout")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <motion.div
          key={isCollapsed ? "header-collapsed" : "header-expanded"}
          className={cn(
            "flex items-center gap-2",
            isCollapsed ? "flex-row md:flex-col-reverse" : "flex-row"
          )}
          initial={userToggled ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          transition={
            userToggled ? { duration: 0.8 } : { duration: 0 }
          }
        >
          <button
            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => {
              if (isMobile) setOpenMobile(false);
              useCommandPalette.getState().toggle();
            }}
            title={ts("commandPalette")}
          >
            <CommandIcon className="size-4" />
          </button>
          <NotificationsPopover workspaceId={currentWorkspaceId ?? ""} />
          <SidebarTrigger onClick={() => setUserToggled(true)} />
        </motion.div>
      </SidebarHeader>
      <SidebarContent className="min-h-0 overflow-y-auto group-data-[collapsible=icon]:overflow-y-auto gap-2 mx-2 my-2 rounded-xl border border-sidebar-border bg-sidebar p-2 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <DashboardNavigation routes={dashboardRoutes} pathname={pathname} />
        <div className="mt-auto pt-2">
          <button
            type="button"
            onClick={() => tauriNavigate(router, "/learn")}
            title={ts("nav.learn")}
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <GraduationCap className="size-4" />
          </button>
          <AnimatedThemeToggler />
        </div>
      </SidebarContent>
      <SidebarFooter className="shrink-0 mx-2 mb-2 rounded-xl border border-sidebar-border bg-sidebar p-2 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <ServerSwitcher />
      </SidebarFooter>
      <SidebarDialogGroup dialogs={dialogs} currentWorkspaceId={currentWorkspaceId} />
    </Sidebar>
  );
}
