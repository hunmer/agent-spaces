"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { StartupTab } from "./startup-tab";
import { LanguageTab } from "./language-tab";
import { AccountTab } from "./account-tab";
import { SecurityTab } from "./security-tab";
import { Button } from "@/components/ui/button";
import { PlayIcon } from "lucide-react";

const TOUR_KEY = "agent-spaces:chat-tour-completed";
const WORKSPACE_TOUR_KEY = "agent-spaces:workspace-tour-completed";
const WORKFLOW_TOUR_KEY = "agent-spaces:workflow-tour-completed";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <h3 className="text-xs font-semibold text-foreground">{title}</h3>
      <div className="rounded-lg border border-border/60 p-4">
        {children}
      </div>
    </div>
  );
}

export function GeneralTab() {
  const t = useTranslations("settings");
  const router = useRouter();

  const replayTour = () => {
    try { localStorage.removeItem(TOUR_KEY); } catch {}
    router.push("/chat?tour=1");
  };

  const replayWorkspaceTour = () => {
    try { localStorage.removeItem(WORKSPACE_TOUR_KEY); } catch {}
    const id = localStorage.getItem("lastWorkspaceId");
    router.push(id ? `/workspace/${id}?wstour=1` : "/");
  };

  const replayWorkflowTour = () => {
    try {
      localStorage.removeItem(WORKFLOW_TOUR_KEY);
      sessionStorage.setItem("agent-spaces:workflow-tour-pending", "1");
    } catch {}
    router.push("/workflows");
  };

  return (
    <div className="space-y-5">
      <Section title={t("startup")}>
        <StartupTab />
      </Section>
      <Section title={t("language")}>
        <LanguageTab />
      </Section>
      <Section title={t("userAvatar")}>
        <AccountTab />
      </Section>
      <Section title={t("security")}>
        <SecurityTab />
      </Section>
      <Section title={t("tour")}>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">{t("tourDesc")}</p>
            <Button variant="outline" size="sm" className="shrink-0 gap-2" onClick={replayTour}>
              <PlayIcon className="size-4" />
              {t("replayTour")}
            </Button>
          </div>
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">{t("workspaceTourDesc")}</p>
            <Button variant="outline" size="sm" className="shrink-0 gap-2" onClick={replayWorkspaceTour}>
              <PlayIcon className="size-4" />
              {t("replayWorkspaceTour")}
            </Button>
          </div>
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">{t("workflowTourDesc")}</p>
            <Button variant="outline" size="sm" className="shrink-0 gap-2" onClick={replayWorkflowTour}>
              <PlayIcon className="size-4" />
              {t("replayWorkflowTour")}
            </Button>
          </div>
        </div>
      </Section>
    </div>
  );
}
