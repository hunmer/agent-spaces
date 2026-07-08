"use client";

import type { Workspace } from "@agent-spaces/shared";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TeamManagementPage } from "@/components/teams/team-management-page";

export function TeamManagementDialog({
  open,
  onOpenChange,
  workspaces,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaces: Workspace[];
}) {
  const t = useTranslations("teams");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!h-[85vh] !w-[92vw] !max-w-6xl overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-auto">
          <TeamManagementPage initialWorkspaces={workspaces} embedded />
        </div>
      </DialogContent>
    </Dialog>
  );
}
