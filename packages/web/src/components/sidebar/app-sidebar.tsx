"use client";

import { useEffect, useMemo, useState } from "react";
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
} from "lucide-react";
import { Logo } from "@/components/sidebar/logo";
import { AgentDialog } from "@/components/sidebar/agent-dialog";
import type { Route } from "./nav-main";
import DashboardNavigation from "@/components/sidebar/nav-main";
import { NotificationsPopover } from "@/components/sidebar/nav-notifications";
import { TeamSwitcher } from "@/components/sidebar/team-switcher";
import type { Workspace } from "@agent-spaces/shared";

const sampleNotifications = [
  {
    id: "1",
    avatar: "/avatars/01.png",
    fallback: "OM",
    text: "New order received.",
    time: "10m ago",
  },
  {
    id: "2",
    avatar: "/avatars/02.png",
    fallback: "JL",
    text: "Server upgrade completed.",
    time: "1h ago",
  },
  {
    id: "3",
    avatar: "/avatars/03.png",
    fallback: "HH",
    text: "New user signed up.",
    time: "2h ago",
  },
];

const teams = [
  { id: "1", name: "Alpha Inc.", logo: Logo, plan: "Free" },
  { id: "2", name: "Beta Corp.", logo: Logo, plan: "Free" },
  { id: "3", name: "Gamma Tech", logo: Logo, plan: "Free" },
];

export function DashboardSidebar() {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [agentDialogOpen, setAgentDialogOpen] = useState(false);

  useEffect(() => {
    fetch("/api/workspaces")
      .then((r) => r.json())
      .then(setWorkspaces)
      .catch(() => {});
  }, []);

  const dashboardRoutes: Route[] = useMemo(() => [
    {
      id: "home",
      title: "Home",
      icon: <Home className="size-4" />,
      link: "/",
    },
    {
      id: "workspaces",
      title: "Workspaces",
      icon: <FolderOpen className="size-4" />,
      link: "/",
      subs: workspaces.map((ws) => ({
        title: ws.name,
        link: `/workspace/${ws.id}`,
        icon: <FolderOpen className="size-4" />,
      })),
    },
    {
      id: "settings",
      title: "Settings",
      icon: <Settings className="size-4" />,
      link: "#",
      subs: [
        { title: "General", link: "#" },
        { title: "Agents", link: "#", icon: <Bot className="size-3.5" />, onClick: () => setAgentDialogOpen(true) },
        { title: "Webhooks", link: "#" },
        { title: "Custom Fields", link: "#" },
      ],
    },
  ], [workspaces]);

  return (
    <Sidebar variant="floating" collapsible="icon">
      <SidebarHeader
        className={cn(
          "flex rounded-xl border border-border bg-card mx-2 mt-2 px-3 py-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]",
          isCollapsed
            ? "flex-row items-center justify-between gap-y-4 md:flex-col md:items-start md:justify-start"
            : "flex-row items-center justify-between"
        )}
      >
        <a href="#" className="flex items-center gap-2">
          <Logo className="h-8 w-8" />
          {!isCollapsed && (
            <span className="font-semibold text-black dark:text-white">
              Acme
            </span>
          )}
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
        <TeamSwitcher teams={teams} />
      </SidebarFooter>
      <AgentDialog open={agentDialogOpen} onOpenChange={setAgentDialogOpen} />
    </Sidebar>
  );
}
