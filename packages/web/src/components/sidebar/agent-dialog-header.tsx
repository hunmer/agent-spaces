"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Bot,
  ChevronDown,
  Plus,
  RefreshCw,
  RotateCcw,
  WandSparkles,
} from "lucide-react";
import {
  type AgentPreset,
  type BuiltInRole,
  ROLE_COLORS,
  ROLE_OPTIONS,
} from "./agent-shared";
import { FIXED_AGENT_IDS } from "./agent-dialog-data";
import type { AgentEditorHandle } from "./agent-editor";

interface AgentDialogHeaderProps {
  standalone: boolean;
  selectedAgent: AgentPreset | null;
  singleAgent: boolean;
  saving: boolean;
  syncingTemplates: boolean;
  editorRef: React.RefObject<AgentEditorHandle | null>;
  roleFilterSet: Set<string> | null;
  addRoleOptions: BuiltInRole[];
  onBack: () => void;
  onOpenChange: (open: boolean) => void;
  onSyncTemplates: () => void;
  onAutoGenerate: () => void;
  handleAddAgent: (role: BuiltInRole | "empty") => void;
}

export function AgentDialogHeader({
  standalone,
  selectedAgent,
  singleAgent,
  saving,
  syncingTemplates,
  editorRef,
  roleFilterSet,
  addRoleOptions,
  onBack,
  onOpenChange,
  onSyncTemplates,
  onAutoGenerate,
  handleAddAgent,
}: AgentDialogHeaderProps) {
  const t = useTranslations("agent");
  const tc = useTranslations("common");

  const addDropdown = (compact?: boolean) => (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" disabled={saving}>
            <Plus className="size-3.5" />
            {!compact && t("dialog.add")}
            <ChevronDown className="size-3.5" />
          </Button>
        }
      />
      <DropdownMenuContent side="bottom" align="end" className="w-44">
        <DropdownMenuGroup>
          {!roleFilterSet && (
            <DropdownMenuItem className="gap-2" onClick={() => handleAddAgent("empty")}>
              <span className="size-2 rounded-full bg-muted" />
              <span>{t("dialog.addEmpty")}</span>
            </DropdownMenuItem>
          )}
          {Array.from(new Set(ROLE_OPTIONS)).map((role) => (
            <DropdownMenuItem key={role} className="gap-2" onClick={() => handleAddAgent(role)}>
              <span className={cn("size-2 rounded-full", ROLE_COLORS[role].split(" ")[0])} />
              <span className="capitalize">{t(`role.${role}.name`)}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const syncButton = (
    <Button variant="outline" size="sm" onClick={onSyncTemplates} disabled={syncingTemplates}>
      <RefreshCw className={cn("size-3.5", syncingTemplates && "animate-spin")} />
      {t("dialog.syncTemplates")}
    </Button>
  );

  const smartCreateButton = (
    <Button variant="outline" size="sm" onClick={onAutoGenerate}>
      <WandSparkles className="size-3.5" />
      {t("dialog.smartCreate")}
    </Button>
  );

  const backButton = (onClick: () => void) => (
    <Button variant="ghost" size="icon" onClick={onClick}>
      <ArrowLeft className="size-4" />
    </Button>
  );

  const resetButton = selectedAgent && FIXED_AGENT_IDS.has(selectedAgent.id) ? (
    <Button variant="outline" size="sm" disabled={saving} onClick={() => editorRef.current?.reset()}>
      <RotateCcw className="size-3.5" />
      {tc("reset")}
    </Button>
  ) : null;

  const generateButton = selectedAgent ? (
    <Button variant="outline" size="sm" onClick={() => editorRef.current?.openGenerate()}>
      <WandSparkles className="size-3.5" />
      {t("dialog.smartCreate")}
    </Button>
  ) : null;

  // Non-standalone: Dialog header with DialogHeader/Title/Description
  if (!standalone) {
    return (
      <div className="flex items-center gap-3 border-b px-5 pr-12 py-4">
        {selectedAgent ? (
          backButton(singleAgent ? () => onOpenChange(false) : onBack)
        ) : (
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10">
            <Bot className="size-4 text-primary" />
          </div>
        )}
        <DialogHeader className="flex-1 space-y-0">
          <DialogTitle className="text-base">
            {selectedAgent ? selectedAgent.name : t("dialog.title")}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {selectedAgent ? t("dialog.editDescription") : t("dialog.listDescription")}
          </DialogDescription>
        </DialogHeader>
        {resetButton}
        {generateButton}
        {!selectedAgent && !singleAgent && (
          <div className="flex items-center gap-2">
            {syncButton}
            {smartCreateButton}
            {addDropdown()}
          </div>
        )}
      </div>
    );
  }

  // Standalone: toolbar when no agent selected
  if (!selectedAgent && !singleAgent) {
    return (
      <div className="flex items-center justify-end gap-2 px-5 py-3 border-b">
        {syncButton}
        {smartCreateButton}
        {addDropdown()}
      </div>
    );
  }

  // Standalone: toolbar when agent selected
  if (selectedAgent) {
    return (
      <div className="flex items-center gap-3 px-5 py-3 border-b">
        {backButton(singleAgent ? () => onOpenChange(false) : onBack)}
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-medium truncate">{selectedAgent.name}</h2>
          <p className="text-xs text-muted-foreground">{t("dialog.editDescription")}</p>
        </div>
        {resetButton}
        {generateButton}
      </div>
    );
  }

  return null;
}
