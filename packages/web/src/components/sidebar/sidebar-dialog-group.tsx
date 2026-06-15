"use client";

import { AgentDialog } from "@/components/sidebar/agent-dialog";
import { ModelsDialog } from "@/components/sidebar/models-dialog";
import { ProvidersDialog } from "@/components/sidebar/providers-dialog";
import { SettingsDialog } from "@/components/sidebar/settings-dialog";
import { SkillsDialog } from "@/components/sidebar/skills-dialog";
import { PromptsDialog } from "@/components/sidebar/prompts-dialog";
import { OutputStylesDialog } from "@/components/sidebar/output-styles-dialog";
import { McpsDialog } from "@/components/sidebar/mcps-dialog";
import { HooksDialog } from "@/components/sidebar/hooks-dialog";
import { AgentCommandsDialog } from "@/components/sidebar/agent-commands-dialog";
import { ToolsDialog } from "@/components/sidebar/tools-dialog";
import { LayoutManagerDialog } from "@/components/sidebar/layout-manager-dialog";
import {
  LAYOUT_STORAGE_KEY,
  LAYOUT_RESET_EVENT,
  applyLayoutToStorage,
} from "@/lib/layout-templates";
import type { useSidebarDialogs } from "./use-sidebar-dialogs";

export function SidebarDialogGroup({
  dialogs,
  currentWorkspaceId,
}: {
  dialogs: ReturnType<typeof useSidebarDialogs>;
  currentWorkspaceId: string | null;
}) {
  return (
    <>
      <AgentDialog open={dialogs.agentDialogOpen} onOpenChange={dialogs.setAgentDialogOpen} />
      <SkillsDialog open={dialogs.skillsDialogOpen} onOpenChange={dialogs.setSkillsDialogOpen} />
      <PromptsDialog open={dialogs.promptsDialogOpen} onOpenChange={dialogs.setPromptsDialogOpen} />
      <OutputStylesDialog open={dialogs.outputStylesDialogOpen} onOpenChange={dialogs.setOutputStylesDialogOpen} />
      <McpsDialog open={dialogs.mcpsDialogOpen} onOpenChange={dialogs.setMcpsDialogOpen} />
      <HooksDialog open={dialogs.hooksDialogOpen} onOpenChange={dialogs.setHooksDialogOpen} />
      <AgentCommandsDialog open={dialogs.agentCommandsDialogOpen} onOpenChange={dialogs.setAgentCommandsDialogOpen} />
      <ToolsDialog open={dialogs.toolsDialogOpen} onOpenChange={dialogs.setToolsDialogOpen} />
      <SettingsDialog open={dialogs.settingsDialogOpen} onOpenChange={dialogs.setSettingsDialogOpen} />
      <ModelsDialog open={dialogs.modelsDialogOpen} onOpenChange={dialogs.setModelsDialogOpen} initialProvider={dialogs.modelsDialogProvider} />
      <ProvidersDialog
        open={dialogs.providersDialogOpen}
        onOpenChange={dialogs.setProvidersDialogOpen}
        onAddModel={(providerName) => {
          dialogs.setModelsDialogProvider(providerName);
          dialogs.setModelsDialogOpen(true);
        }}
      />
      <LayoutManagerDialog
        open={dialogs.layoutDialogOpen}
        onOpenChange={dialogs.setLayoutDialogOpen}
        title="布局管理"
        description="保存、切换或管理工作空间布局"
        getCurrentLayout={() => {
          try {
            const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
            return raw ? JSON.parse(raw) : null;
          } catch {
            return null;
          }
        }}
        onApply={(json) => applyLayoutToStorage(json)}
        onReset={() => window.dispatchEvent(new CustomEvent(LAYOUT_RESET_EVENT))}
      />
    </>
  );
}
