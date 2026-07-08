"use client";

import { useEffect, useRef, useState } from "react";
import type { WorkflowTemplate } from "@agent-spaces/shared";
import { useTranslations } from "next-intl";
import { EllipsisVertical, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TeamManagementPage, type TeamManagementPageHandle } from "@/components/teams/team-management-page";
import { WorkflowListDialog } from "@/components/workflow/workflow-list-dialog";
import { useWorkflowStore } from "@/stores/workflow";

function extractAgentRunIds(workflow: WorkflowTemplate): string[] {
  const ids: string[] = [];
  for (const node of workflow.nodes ?? []) {
    if (node.type !== "agent_run") continue;
    const id = typeof node.data?.agentConfigId === "string" ? node.data.agentConfigId.trim() : "";
    if (id) ids.push(id);
  }
  return Array.from(new Set(ids));
}

export function TeamManagementDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("teams");
  const pageRef = useRef<TeamManagementPageHandle>(null);
  const [canCreate, setCanCreate] = useState(false);
  const [workflowListOpen, setWorkflowListOpen] = useState(false);

  const { workflows, loadWorkflows } = useWorkflowStore();

  useEffect(() => {
    if (open) void loadWorkflows();
  }, [open, loadWorkflows]);

  const handleImportFromWorkflow = (workflow: WorkflowTemplate) => {
    setWorkflowListOpen(false);
    const memberIds = extractAgentRunIds(workflow);
    pageRef.current?.openCreateDialogWithDefaults({
      name: workflow.name,
      description: workflow.description ?? "",
      members: memberIds,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex !h-[80vh] !w-[80vw] !max-w-none flex-col overflow-hidden p-0">
        <DialogHeader className="flex shrink-0 flex-row items-center justify-between gap-3 border-b px-6 py-3">
          <div className="flex flex-col gap-1">
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              className="me-6"
              disabled={!canCreate}
              onClick={() => pageRef.current?.openCreateDialog()}
            >
              <Plus className="size-4" />
              {t("newTeam")}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="icon" className="me-6" disabled={!canCreate}>
                    <EllipsisVertical className="size-4" />
                  </Button>
                }
              />
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setWorkflowListOpen(true)}>
                  {t("importFromWorkflow")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-auto">
          <TeamManagementPage
            ref={pageRef}
            embedded
            onCanCreateChange={setCanCreate}
          />
        </div>
      </DialogContent>

      <WorkflowListDialog
        open={workflowListOpen}
        workflows={workflows}
        onSelect={handleImportFromWorkflow}
        onCreate={() => {}}
        onClose={() => setWorkflowListOpen(false)}
        showCreate={false}
      />
    </Dialog>
  );
}
