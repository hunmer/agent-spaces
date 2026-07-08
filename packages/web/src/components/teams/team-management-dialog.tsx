"use client";

import { useRef, useState } from "react";
import type { Workspace } from "@agent-spaces/shared";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TeamManagementPage, type TeamManagementPageHandle } from "@/components/teams/team-management-page";

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
  const pageRef = useRef<TeamManagementPageHandle>(null);
  const [canCreate, setCanCreate] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex !h-[85vh] !w-[92vw] !max-w-6xl flex-col overflow-hidden p-0 sm:max-w-6xl">
        <DialogHeader className="flex shrink-0 flex-row items-center justify-between gap-3 border-b px-6 py-3">
          <div className="flex flex-col gap-1">
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </div>
          <Button
            size="sm"
            className="me-6"
            disabled={!canCreate}
            onClick={() => pageRef.current?.openCreateDialog()}
          >
            <Plus className="size-4" />
            {t("newTeam")}
          </Button>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-auto">
          <TeamManagementPage
            ref={pageRef}
            initialWorkspaces={workspaces}
            embedded
            onCanCreateChange={setCanCreate}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
