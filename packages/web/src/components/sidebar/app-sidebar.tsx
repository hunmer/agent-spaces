"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
import {
  Home,
  FolderOpen,
  Settings,
  Bot,
  Brain,
  Server,
  Pencil,
  Trash2,
  FolderSearch,
  LayoutGrid,
  GitBranch,
  Sparkles,
  Plug,
} from "lucide-react";
import { UserIcon } from "@/components/common/user-icon";
import { AgentDialog } from "@/components/sidebar/agent-dialog";
import { ModelsDialog } from "@/components/sidebar/models-dialog";
import { ProvidersDialog } from "@/components/sidebar/providers-dialog";
import { SettingsDialog } from "@/components/sidebar/settings-dialog";
import { SkillsDialog } from "@/components/sidebar/skills-dialog";
import { McpsDialog } from "@/components/sidebar/mcps-dialog";
import type { Route } from "./nav-main";
import DashboardNavigation from "@/components/sidebar/nav-main";
import { NotificationsPopover } from "@/components/sidebar/nav-notifications";
import { ServerSwitcher } from "@/components/sidebar/server-switcher";
import { WorkspaceDialog } from "@/components/workspace/workspace-dialog";
import { useWorkspaceStore } from "@/stores/workspace";
import type { Workspace } from "@agent-spaces/shared";

export function DashboardSidebar() {
  const { state } = useSidebar();
  const pathname = usePathname();
  const router = useRouter();
  const ts = useTranslations('sidebar');
  const tc = useTranslations('common');

  const sampleNotifications = [
    {
      id: "1",
      avatar: "/avatars/01.png",
      fallback: "OM",
      text: ts('notifications.sample1'),
      time: ts('notifications.sample1Time'),
    },
    {
      id: "2",
      avatar: "/avatars/02.png",
      fallback: "JL",
      text: ts('notifications.sample2'),
      time: ts('notifications.sample2Time'),
    },
    {
      id: "3",
      avatar: "/avatars/03.png",
      fallback: "HH",
      text: ts('notifications.sample3'),
      time: ts('notifications.sample3Time'),
    },
  ];
  const isCollapsed = state === "collapsed";
  const isWorkspace = pathname.startsWith("/workspace/");
  const currentWorkspaceId = pathname.match(/^\/workspace\/([^/]+)/)?.[1];
  const workspaces = useWorkspaceStore((store) => store.workspaces);
  const setWorkspaces = useWorkspaceStore((store) => store.setWorkspaces);
  const upsertWorkspace = useWorkspaceStore((store) => store.upsertWorkspace);
  const removeWorkspace = useWorkspaceStore((store) => store.removeWorkspace);
  const [agentDialogOpen, setAgentDialogOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [modelsDialogOpen, setModelsDialogOpen] = useState(false);
  const [providersDialogOpen, setProvidersDialogOpen] = useState(false);
  const [skillsDialogOpen, setSkillsDialogOpen] = useState(false);
  const [mcpsDialogOpen, setMcpsDialogOpen] = useState(false);
  const [wsDialogOpen, setWsDialogOpen] = useState(false);
  const [editingWs, setEditingWs] = useState<Workspace | null>(null);
  const [modelsDialogProvider, setModelsDialogProvider] = useState<string | undefined>(undefined);

  const refreshWorkspaces = useCallback(() => {
    fetch("/api/workspaces")
      .then((r) => r.json())
      .then(setWorkspaces)
      .catch(() => {});
  }, [setWorkspaces]);

  useEffect(() => {
    refreshWorkspaces();
  }, [refreshWorkspaces]);

  const handleWsSubmit = async (data: { name: string; boundDirs: string[] }) => {
    if (editingWs) {
      const res = await fetch(`/api/workspaces/${editingWs.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const updated = await res.json();
      upsertWorkspace(updated);
    } else {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const ws = await res.json();
      upsertWorkspace(ws);
    }
  };

  const handleDelete = async (ws: Workspace) => {
    await fetch(`/api/workspaces/${ws.id}`, { method: "DELETE" });
    removeWorkspace(ws.id);
    if (currentWorkspaceId === ws.id) {
      const remaining = workspaces.filter((w) => w.id !== ws.id);
      router.push(remaining.length > 0 ? `/workspace/${remaining[0].id}` : "/");
    }
  };

  const openEditDialog = (ws: Workspace) => {
    setEditingWs(ws);
    setWsDialogOpen(true);
  };

  const openCreateDialog = () => {
    setEditingWs(null);
    setWsDialogOpen(true);
  };

  const dashboardRoutes: Route[] = [
    {
      id: "home",
      title: ts('nav.home'),
      icon: <Home className="size-4" />,
      link: "/",
    },
    {
      id: "workspaces",
      title: ts('nav.workspaces'),
      icon: <FolderOpen className="size-4" />,
      link: "/",
      onAdd: openCreateDialog,
      addLabel: ts('nav.addWorkspace'),
      manageLink: "/workspaces",
      subs: [
        ...workspaces.map((ws) => ({
          title: ws.name,
          link: `/workspace/${ws.id}`,
          icon: <FolderOpen className="size-4" />,
          menuItems: [
            {
              label: tc('edit'),
              icon: <Pencil className="size-3.5" />,
              onClick: () => openEditDialog(ws),
            },
            {
              label: tc('open'),
              icon: <FolderSearch className="size-3.5" />,
              onClick: () => fetch(`/api/workspaces/${ws.id}/reveal`, { method: 'POST' }),
            },
            {
              label: tc('delete'),
              icon: <Trash2 className="size-3.5" />,
              variant: "destructive" as const,
              onClick: () => handleDelete(ws),
            },
          ],
        })),
      ],
    },
    {
      id: "workflows",
      title: ts('nav.workflows'),
      icon: <GitBranch className="size-4" />,
      link: "/workflows",
    },
    {
      id: "settings",
      title: ts('nav.settings'),
      icon: <Settings className="size-4" />,
      link: "#",
      subs: [
        { title: ts('nav.general'), link: "#", onClick: () => setSettingsDialogOpen(true) },
        { title: ts('nav.agents'), link: "#", icon: <Bot className="size-3.5" />, onClick: () => setAgentDialogOpen(true) },
        { title: ts('nav.skills'), link: "#", icon: <Sparkles className="size-3.5" />, onClick: () => setSkillsDialogOpen(true) },
        { title: ts('nav.mcps'), link: "#", icon: <Plug className="size-3.5" />, onClick: () => setMcpsDialogOpen(true) },
        { title: ts('nav.models'), link: "#", icon: <Brain className="size-3.5" />, onClick: () => { setModelsDialogProvider(undefined); setModelsDialogOpen(true); } },
        { title: ts('nav.providers'), link: "#", icon: <Server className="size-3.5" />, onClick: () => setProvidersDialogOpen(true) },
      ],
    },
  ];

  return (
    <Sidebar
      variant="floating"
      collapsible="icon"
      className={cn(isWorkspace && "bg-[#f2f3f5] dark:bg-[#0f1117]")}
    >
      <SidebarHeader
        className={cn(
          "flex rounded-xl border border-border bg-card mx-2 mt-2 px-3 py-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]",
          isCollapsed
            ? "flex-row items-center justify-between gap-y-4 md:flex-col md:items-center md:justify-center"
            : "flex-row items-center justify-between"
        )}
      >
        <a href="#" className="flex items-center gap-2">
          <UserIcon size={isCollapsed ? "sm" : "md"} />
        </a>

        <motion.div
          key={isCollapsed ? "header-collapsed" : "header-expanded"}
          className={cn(
            "flex items-center gap-2",
            isCollapsed ? "flex-row md:flex-col-reverse" : "flex-row"
          )}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
        >
          <NotificationsPopover notifications={sampleNotifications} />
          <SidebarTrigger />
        </motion.div>
      </SidebarHeader>
      <SidebarContent className="gap-2 mx-2 my-2 rounded-xl border border-border bg-card p-2 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <DashboardNavigation routes={dashboardRoutes} />
      </SidebarContent>
      <SidebarFooter className="mx-2 mb-2 rounded-xl border border-border bg-card p-2 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <ServerSwitcher />
      </SidebarFooter>
      <AgentDialog open={agentDialogOpen} onOpenChange={setAgentDialogOpen} />
      <SkillsDialog open={skillsDialogOpen} onOpenChange={setSkillsDialogOpen} />
      <McpsDialog open={mcpsDialogOpen} onOpenChange={setMcpsDialogOpen} />
      <SettingsDialog open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen} />
      <ModelsDialog open={modelsDialogOpen} onOpenChange={setModelsDialogOpen} initialProvider={modelsDialogProvider} />
      <ProvidersDialog
        open={providersDialogOpen}
        onOpenChange={setProvidersDialogOpen}
        onAddModel={(providerName) => {
          setModelsDialogProvider(providerName);
          setModelsDialogOpen(true);
        }}
      />
      <WorkspaceDialog
        open={wsDialogOpen}
        onOpenChange={setWsDialogOpen}
        workspace={editingWs}
        onSubmit={handleWsSubmit}
      />
    </Sidebar>
  );
}
