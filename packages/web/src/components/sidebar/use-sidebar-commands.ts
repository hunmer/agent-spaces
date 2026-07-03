"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Bot,
  Brain,
  Server,
  Pencil,
  Sparkles,
  MessageSquare,
  Plug,
  PanelLeftClose,
  Settings,
  Hash,
  CircleDot,
  Zap,
  Wrench,
  Terminal,
  GitBranch,
} from "lucide-react";
import { useCommandPalette } from "@/stores/command-palette";
import { useChannelStore } from "@/stores/channel";
import { useIssueStore } from "@/stores/issue";
import { useMobilePanelStore } from "@/stores/mobile-panel";
import type { useSidebarDialogs } from "./use-sidebar-dialogs";

export function useSidebarCommands({
  isMobile,
  router,
  toggleSidebarWithAnimation,
  dialogs,
}: {
  isMobile: boolean;
  router: ReturnType<typeof useRouter>;
  toggleSidebarWithAnimation: () => void;
  dialogs: ReturnType<typeof useSidebarDialogs>;
}) {
  const registerCommands = useCommandPalette((s) => s.registerMany);
  const tSidebar = useTranslations("sidebar");
  const tPalette = useTranslations("commandPalette");

  useEffect(() => {
    const openSettingsPage = (path: string, setter?: React.Dispatch<React.SetStateAction<boolean>>) => {
      if (isMobile || !setter) {
        router.push(path);
      } else {
        setter(true);
      }
    };

    const cmds = [
      {
        id: "toggle-sidebar",
        label: tSidebar("commands.toggleSidebar"),
        group: tPalette("groups.view"),
        icon: PanelLeftClose,
        action: () => toggleSidebarWithAnimation(),
      },
      {
        id: "latest-channel",
        label: tSidebar("commands.openLatestChannel"),
        group: tPalette("groups.navigation"),
        icon: Hash,
        action: () => {
          const { channels, setActiveChannel } = useChannelStore.getState();
          if (channels.length > 0) {
            setActiveChannel(channels[channels.length - 1].id);
            useMobilePanelStore.getState().setActivePanel("chat");
          }
        },
      },
      {
        id: "latest-issue",
        label: tSidebar("commands.openLatestIssue"),
        group: tPalette("groups.navigation"),
        icon: CircleDot,
        action: () => {
          const { issues, setActiveIssue } = useIssueStore.getState();
          if (issues.length > 0) {
            setActiveIssue(issues[issues.length - 1].id);
            useMobilePanelStore.getState().setActivePanel("issue-detail");
          }
        },
      },
      {
        id: "open-settings",
        label: tSidebar("commands.openGeneralSettings"),
        group: tPalette("groups.settings"),
        icon: Settings,
        action: () => openSettingsPage("/settings", dialogs.setSettingsDialogOpen),
      },
      {
        id: "open-agents",
        label: tSidebar("commands.openAgentSettings"),
        group: tPalette("groups.settings"),
        icon: Bot,
        action: () => openSettingsPage("/settings/agents", dialogs.setAgentDialogOpen),
      },
      {
        id: "open-skills",
        label: tSidebar("commands.openSkillsSettings"),
        group: tPalette("groups.settings"),
        icon: Sparkles,
        action: () => openSettingsPage("/settings/skills", dialogs.setSkillsDialogOpen),
      },
      {
        id: "open-prompts",
        label: tSidebar("commands.openPromptSettings"),
        group: tPalette("groups.settings"),
        icon: MessageSquare,
        action: () => openSettingsPage("/settings/prompts", dialogs.setPromptsDialogOpen),
      },
      {
        id: "open-output-styles",
        label: tSidebar("commands.openOutputStyleSettings"),
        group: tPalette("groups.settings"),
        icon: Pencil,
        action: () => openSettingsPage("/settings/output-styles", dialogs.setOutputStylesDialogOpen),
      },
      {
        id: "open-mcps",
        label: tSidebar("commands.openMcpSettings"),
        group: tPalette("groups.settings"),
        icon: Plug,
        action: () => openSettingsPage("/settings/mcps", dialogs.setMcpsDialogOpen),
      },
      {
        id: "open-models",
        label: tSidebar("commands.openModelSettings"),
        group: tPalette("groups.settings"),
        icon: Brain,
        action: () => {
          if (isMobile) {
            router.push("/settings/models");
          } else {
            dialogs.setModelsDialogProvider(undefined);
            dialogs.setModelsDialogOpen(true);
          }
        },
      },
      {
        id: "open-providers",
        label: tSidebar("commands.openProviderSettings"),
        group: tPalette("groups.settings"),
        icon: Server,
        action: () => openSettingsPage("/settings/providers", dialogs.setProvidersDialogOpen),
      },
      {
        id: "open-hooks",
        label: tSidebar("commands.openHookSettings"),
        group: tPalette("groups.settings"),
        icon: Zap,
        action: () => {
          if (isMobile) {
            router.push("/settings");
          } else {
            dialogs.setHooksDialogOpen(true);
          }
        },
      },
      {
        id: "open-commands",
        label: tSidebar("commands.openAgentCommands"),
        group: tPalette("groups.settings"),
        icon: Terminal,
        action: () => {
          if (isMobile) {
            router.push("/settings");
          } else {
            dialogs.setAgentCommandsDialogOpen(true);
          }
        },
      },
      {
        id: "open-tools",
        label: tSidebar("commands.openToolsSettings"),
        group: tPalette("groups.settings"),
        icon: Wrench,
        action: () => {
          if (isMobile) {
            router.push("/settings/tools");
          } else {
            dialogs.setToolsDialogOpen(true);
          }
        },
      },
      {
        id: "open-workflows",
        label: tSidebar("commands.openWorkflowSettings"),
        group: tPalette("groups.navigation"),
        icon: GitBranch,
        action: () => {
          router.push("/workflows");
        },
      },
    ];
    return registerCommands(cmds);
  }, [registerCommands, toggleSidebarWithAnimation, isMobile, dialogs, router, tSidebar, tPalette]);
}
