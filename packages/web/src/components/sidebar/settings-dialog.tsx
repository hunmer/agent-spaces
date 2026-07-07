"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Palette, Mic, GitBranch, Store, Bot, Info, Keyboard, Database, Package, BookOpen, Workflow, TerminalSquare, Settings } from "lucide-react";
import { GitSettingsForm } from "@/components/git/git-settings-form";
import { AppearanceTab } from "./settings/appearance-tab";
import { GeneralTab } from "./settings/general-tab";
import { SpeechSettingsTab } from "./settings/speech-settings-tab";
import { RobotAccountsTab } from "./settings/robot-accounts-tab";
import { AboutTab } from "./settings/about-tab";
import { ShortcutsTab } from "./settings/shortcuts-tab";
import { AgentStoreTab } from "./settings/agent-store-tab";
import { DataTab } from "./settings/data-tab";
import { NpmSettingsTab } from "./settings/npm-settings-tab";
import { ModelCatalogTab } from "./settings/model-catalog-tab";
import { WorkflowTab } from "./settings/workflow-tab";
import { RuntimeTab } from "./settings/runtime-tab";

const tabs = [
  { key: "appearance", icon: Palette },
  { key: "general", icon: Settings },
  { key: "robots", icon: Bot },
  { key: "agent_store", icon: Store },
  { key: "npm", icon: Package },
  { key: "model_catalog", icon: BookOpen },
  { key: "workflow", icon: Workflow },
  { key: "runtime", icon: TerminalSquare },
  { key: "data", icon: Database },
  { key: "git", icon: GitBranch },
  { key: "speech", icon: Mic },
  { key: "shortcuts", icon: Keyboard },
  { key: "about", icon: Info },
] as const;

type TabKey = (typeof tabs)[number]["key"];

export function SettingsDialog({
  open,
  onOpenChange,
  standalone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  standalone?: boolean;
}) {
  const t = useTranslations("settings");
  const [activeTab, setActiveTab] = useState<TabKey>("appearance");

  const tabLabels: Record<TabKey, string> = {
    appearance: t("theme"),
    general: t("general"),
    robots: t("robots"),
    agent_store: t("agentStore"),
    npm: t("npm"),
    model_catalog: t("modelCatalogTab"),
    workflow: t("workflow"),
    runtime: t("runtime"),
    data: t("data"),
    git: t("git"),
    speech: t("speech"),
    shortcuts: t("shortcuts"),
    about: t("about"),
  };

  const renderContent = () => {
    switch (activeTab) {
      case "appearance":
        return <AppearanceTab />;
      case "general":
        return <GeneralTab />;
      case "robots":
        return <RobotAccountsTab />;
      case "agent_store":
        return <AgentStoreTab />;
      case "npm":
        return <NpmSettingsTab />;
      case "model_catalog":
        return <ModelCatalogTab />;
      case "workflow":
        return <WorkflowTab />;
      case "runtime":
        return <RuntimeTab />;
      case "data":
        return <DataTab />;
      case "git":
        return <GitSettings />;
      case "speech":
        return <SpeechSettingsTab />;
      case "shortcuts":
        return <ShortcutsTab />;
      case "about":
        return <AboutTab />;
    }
  };

  const sidebar = (
    <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
      <div className="flex sm:flex-col sm:w-48 sm:border-r sm:py-3 sm:px-2 shrink-0 overflow-x-auto overflow-y-auto border-b sm:border-b-0 gap-1 px-2 py-2">
        {tabs.map(({ key, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={cn(
              "flex items-center gap-2 rounded-md px-2.5 py-2 text-xs font-medium transition-colors whitespace-nowrap",
              activeTab === key
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {tabLabels[key]}
          </button>
        ))}
      </div>
      <form
        autoComplete="off"
        onSubmit={(e) => e.preventDefault()}
        className="flex-1 p-5 min-w-0 overflow-y-auto"
      >
        {renderContent()}
      </form>
    </div>
  );

  if (standalone) return sidebar;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!w-[80vw] !max-w-[80vw] !h-[80vh] p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-5 py-4 border-b shrink-0">
          <DialogTitle className="text-base">{t("title")}</DialogTitle>
          <DialogDescription className="text-xs">{t("description")}</DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{sidebar}</div>
      </DialogContent>
    </Dialog>
  );
}

function GitSettings() {
  return (
    <div className="space-y-5">
      <div>
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2.5 block">
          Git
        </label>
        <GitSettingsForm scope="global" />
      </div>
    </div>
  );
}
