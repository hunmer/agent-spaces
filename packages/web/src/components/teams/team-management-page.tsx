"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { WorkflowTemplate } from "@agent-spaces/shared";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { sdk } from "@/lib/sdk";
import type {
  TeamView,
  TeamDetail,
} from "@agent-spaces/sdk";
import { useAgentStore } from "@/stores/agent";
import { useWorkflowStore } from "@/stores/workflow";
import { CreateTeamDialog, type TeamFormDefaults, type TeamFormValues } from "@/components/teams/create-team-dialog";
import { TeamChatPanel } from "@/components/teams/team-chat-panel";
import { WorkflowListDialog } from "@/components/workflow/workflow-list-dialog";
import { TeamListPanel } from "@/components/teams/team-list-panel";
import { TeamDetailPanel } from "@/components/teams/team-detail-panel";
import { confirmDialog } from "@/stores/confirm";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { PanelLeft, PanelRight } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  PANEL_ID_LIST,
  PANEL_ID_CHAT,
  PANEL_ID_DETAIL,
  DEFAULT_LAYOUT,
  LAYOUT_KEY,
  loadSavedLayout,
  extractAgentRunIds,
} from "@/components/teams/team-management-utils";

export type TeamManagementPageHandle = {
  openCreateDialog: () => void;
  openCreateDialogWithDefaults: (defaults: TeamFormDefaults) => void;
};

export const TeamManagementPage = forwardRef<TeamManagementPageHandle, {
  onCanCreateChange?: (canCreate: boolean) => void;
}>(function TeamManagementPage({
  onCanCreateChange,
}, ref) {
  const t = useTranslations("teams");
  const tc = useTranslations("common");
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTeamId = searchParams.get("team_id") ?? "";
  const initialSessionId = searchParams.get("session_id") ?? "";
  const ensureAgents = useAgentStore((store) => store.ensure);
  const agents = useAgentStore((store) => store.agents);
  const [selectedActorId, setSelectedActorId] = useState("");
  const [teams, setTeams] = useState<TeamView[]>([]);
  const [archivedTeams, setArchivedTeams] = useState<TeamView[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState(initialTeamId);
  const [teamDetail, setTeamDetail] = useState<TeamDetail | null>(null);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [loadingArchived, setLoadingArchived] = useState(false);
  const [savingTeam, setSavingTeam] = useState(false);
  const [error, setError] = useState("");
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogDefaults, setDialogDefaults] = useState<TeamFormDefaults | undefined>(undefined);
  const [editingTeam, setEditingTeam] = useState<TeamView | null>(null);
  const [savedLayout, setSavedLayout] = useState<Record<string, number>>(loadSavedLayout);
  // 右栏初始是否展开，由持久化布局决定（detail 占比 > 0 即展开）
  const [infoSidebarOpen, setInfoSidebarOpen] = useState(() => (loadSavedLayout()[PANEL_ID_DETAIL] ?? DEFAULT_LAYOUT[PANEL_ID_DETAIL]) > 0);
  const [workflowListOpen, setWorkflowListOpen] = useState(false);
  const isMobile = useIsMobile();
  const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false);
  const [activeSession, setActiveSession] = useState<{ teamId: string; sessionId: string } | null>(() =>
    initialTeamId && initialSessionId ? { teamId: initialTeamId, sessionId: initialSessionId } : null);
  const detailPanelRef = useRef<PanelImperativeHandle>(null);
  const saveLayoutTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // 布局变化时持久化（防抖写入 localStorage）
  const handleLayoutChange = useCallback((layout: Record<string, number>) => {
    setSavedLayout(layout);
    if (saveLayoutTimer.current) clearTimeout(saveLayoutTimer.current);
    saveLayoutTimer.current = setTimeout(() => {
      try {
        window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
      } catch {}
    }, 200);
  }, []);

  // 右栏隐藏通过面板 collapse 到 0 实现（占用比例变为 0，DOM 保留）
  const toggleInfoSidebar = useCallback(() => {
    setInfoSidebarOpen((prev) => {
      const next = !prev;
      const panel = detailPanelRef.current;
      if (panel) {
        if (next) panel.expand();
        else panel.collapse();
      }
      return next;
    });
  }, []);

  const handleActiveSessionChange = useCallback((sessionId: string) => {
    setActiveSession((current) => current?.teamId === selectedTeamId && current.sessionId === sessionId
      ? current
      : { teamId: selectedTeamId, sessionId });
  }, [selectedTeamId]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (selectedTeamId) params.set("team_id", selectedTeamId);
    else params.delete("team_id");
    if (activeSession?.teamId === selectedTeamId && activeSession.sessionId) params.set("session_id", activeSession.sessionId);
    else params.delete("session_id");
    const next = params.toString();
    if (next !== searchParams.toString()) router.replace(next ? `${pathname}?${next}` : pathname);
  }, [activeSession, pathname, router, searchParams, selectedTeamId]);

  const { workflows, loadWorkflows } = useWorkflowStore();

  const availableAgents = useMemo(
    () => agents.filter((agent) => agent.enabled !== false && agent.id !== "agent-generator"),
    [agents],
  );
  const selectedTeam = teams.find((team) => team.team_id === selectedTeamId) ?? null;
  const canCreateTeam = Boolean(selectedActorId);

  useEffect(() => {
    onCanCreateChange?.(canCreateTeam);
  }, [canCreateTeam, onCanCreateChange]);

  useImperativeHandle(ref, () => ({
    openCreateDialog,
    openCreateDialogWithDefaults,
  }), []);

  useEffect(() => {
    void ensureAgents();
    void loadWorkflows();
  }, [ensureAgents, loadWorkflows]);

  function handleImportFromWorkflow(workflow: WorkflowTemplate) {
    setWorkflowListOpen(false);
    const memberIds = extractAgentRunIds(workflow);
    // eslint-disable-next-line no-console
    console.log("[handleImportFromWorkflow]", { workflowName: workflow.name, memberIds });
    openCreateDialogWithDefaults({
      name: workflow.name,
      description: workflow.description ?? "",
      members: memberIds,
    });
  }

  useEffect(() => {
    if (!selectedActorId && availableAgents[0]?.id) {
      setSelectedActorId(availableAgents[0].id);
    }
  }, [availableAgents, selectedActorId]);

  const loadTeams = useCallback(async (nextSelectedTeamId?: string) => {
    setLoadingTeams(true);
    setError("");
    try {
      const data = await sdk.team.list({
        page_size: 100,
        include_members_preview: true,
      });
      setTeams(data.teams);
      const nextId = nextSelectedTeamId && data.teams.some((item) => item.team_id === nextSelectedTeamId)
        ? nextSelectedTeamId
        : data.teams.find((item) => item.team_id === selectedTeamId)?.team_id ?? data.teams[0]?.team_id ?? "";
      setSelectedTeamId(nextId);
      if (!nextId) {
        setTeamDetail(null);
      }
    } catch (err) {
      setTeams([]);
      setSelectedTeamId("");
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingTeams(false);
    }
  }, [selectedTeamId]);

  const loadArchivedTeams = useCallback(async () => {
    setLoadingArchived(true);
    try {
      const data = await sdk.team.list({
        archived: true,
        page_size: 100,
      });
      setArchivedTeams(data.teams.filter((team) => team.status === "archived"));
    } catch {
      setArchivedTeams([]);
    } finally {
      setLoadingArchived(false);
    }
  }, []);

  const loadTeamDetail = useCallback(async (teamId: string) => {
    try {
      const sessionId = activeSession?.teamId === teamId ? activeSession.sessionId : undefined;
      const data = await sdk.team.get(teamId, selectedActorId, true, sessionId);
      setTeamDetail(data);
    } catch (err) {
      setTeamDetail(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [activeSession, selectedActorId]);

  useEffect(() => {
    void loadTeams();
  }, [loadTeams]);

  useEffect(() => {
    void loadArchivedTeams();
  }, [loadArchivedTeams]);

  useEffect(() => {
    if (!selectedActorId || !selectedTeamId) {
      setTeamDetail(null);
      return;
    }
    void loadTeamDetail(selectedTeamId);
    const timer = setInterval(() => void loadTeamDetail(selectedTeamId), 3000);
    return () => clearInterval(timer);
  }, [activeSession, loadTeamDetail, selectedActorId, selectedTeamId]);

  function openCreateDialog() {
    setDialogMode("create");
    setDialogDefaults(undefined);
    setEditingTeam(null);
    setDialogOpen(true);
  }

  function openCreateDialogWithDefaults(defaults: TeamFormDefaults) {
    setDialogMode("create");
    setDialogDefaults(defaults);
    setEditingTeam(null);
    setDialogOpen(true);
  }

  function openEditDialog(team: TeamView) {
    setDialogMode("edit");
    setEditingTeam(team);
    setDialogDefaults(undefined);
    setDialogOpen(true);
  }

  async function submitTeam(values: TeamFormValues) {
    if (!selectedActorId) return;
    setSavingTeam(true);
    setError("");
    try {
      if (dialogMode === "create") {
        const customAgents = new Map(values.customAgents.map((agent) => [agent.id, agent]));
        const data = await sdk.team.create({
          actor_agent_id: selectedActorId,
          name: values.name,
          description: values.description,
          purpose: values.purpose,
          icon: values.icon,
          avatar_url: values.avatarUrl,
          visibility: values.visibility,
          initial_members: values.members
            .filter((id) => id !== selectedActorId)
            .map((agent_id, index) => {
              const agent = customAgents.get(agent_id);
              return agent
                ? { agent_id, role: agent.isOwner ? "owner" : "member", agent_store: "custom" as const, agent }
                : { agent_id, role: index === 0 ? "owner" : "member" };
            }),
        });
        await loadTeams(data.team.team_id);
      } else if (selectedTeamId) {
        const data = await sdk.team.update(selectedTeamId, {
          actor_agent_id: selectedActorId,
          name: values.name,
          description: values.description,
          purpose: values.purpose,
          icon: values.icon,
          avatar_url: values.avatarUrl,
          visibility: values.visibility,
        });
        await loadTeams(data.team.team_id);
      }
      setDialogOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingTeam(false);
    }
  }

  async function dissolveTeam(team: TeamView) {
    if (!selectedActorId) return;
    if (!(await confirmDialog({
      message: t("deleteConfirm", { name: team.name }),
      destructive: true,
      action: tc("delete"),
    }))) return;
    setError("");
    try {
      await sdk.team.dissolve(team.team_id, selectedActorId);
      await loadTeams(team.team_id === selectedTeamId ? undefined : selectedTeamId);
      void loadArchivedTeams();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function deleteArchivedTeam(team: TeamView) {
    if (!(await confirmDialog({
      message: t("archived.deleteConfirm", { name: team.name }),
      destructive: true,
      action: tc("delete"),
    }))) return;
    setError("");
    try {
      await sdk.team.deleteArchive(team.team_id);
      await loadArchivedTeams();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function restoreArchivedTeam(team: TeamView) {
    if (!(await confirmDialog({
      message: t("archived.restoreConfirm", { name: team.name }),
      action: t("archived.restore"),
    }))) return;
    setError("");
    try {
      await sdk.team.restoreArchive(team.team_id, selectedActorId);
      await Promise.all([loadTeams(team.team_id), loadArchivedTeams()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function clearAllArchived() {
    if (archivedTeams.length === 0) return;
    if (!(await confirmDialog({
      message: t("archived.clearConfirm"),
      destructive: true,
      action: tc("delete"),
    }))) return;
    setError("");
    try {
      await sdk.team.clearArchives();
      await loadArchivedTeams();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const listPanel = (
    <TeamListPanel
      error={error}
      loadingTeams={loadingTeams}
      loadingArchived={loadingArchived}
      canCreateTeam={canCreateTeam}
      teams={teams}
      archivedTeams={archivedTeams}
      selectedTeamId={selectedTeamId}
      availableAgents={availableAgents}
      onCreateTeam={openCreateDialog}
      onImportFromWorkflow={() => setWorkflowListOpen(true)}
      onSelectTeam={(item) => {
        setSelectedTeamId(item.team_id);
        setLeftDrawerOpen(false);
      }}
      onEditTeam={openEditDialog}
      onDissolveTeam={(item) => void dissolveTeam(item)}
      onRestoreArchived={(item) => void restoreArchivedTeam(item)}
      onDeleteArchived={(item) => void deleteArchivedTeam(item)}
      onClearArchived={() => void clearAllArchived()}
    />
  );

  const chatPanel = (
    <TeamChatPanel
      key={selectedTeamId}
      teamId={selectedTeamId}
      actorAgentId={selectedActorId}
      initialSessionId={activeSession?.teamId === selectedTeamId ? activeSession.sessionId : undefined}
      sidebarOpen={infoSidebarOpen}
      onToggleSidebar={toggleInfoSidebar}
      teamDescription={selectedTeam?.description}
      onSessionIdChange={handleActiveSessionChange}
    />
  );

  const detailPanel = infoSidebarOpen ? (
    <TeamDetailPanel
      selectedTeam={selectedTeam}
      teamDetail={teamDetail}
      selectedActorId={selectedActorId}
      availableAgents={availableAgents}
      activeSessionId={activeSession && activeSession.teamId === selectedTeam?.team_id ? activeSession.sessionId : undefined}
      onEditTeam={openEditDialog}
      onDissolveTeam={(item) => void dissolveTeam(item)}
      onRefreshDetail={loadTeamDetail}
    />
  ) : null;

  return (
    <div className="flex min-h-dvh w-full flex-col">
      <main className="mx-auto flex size-full flex-1 flex-col gap-4 p-2">
        {!selectedActorId ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            {t("empty.setup")}
          </div>
        ) : isMobile ? (
          <div className="relative flex flex-1 flex-col overflow-hidden">
            {/* 边缘切换按钮：左/右，始终可见 */}
            <Button
              aria-label="Toggle left panel"
              className="absolute top-1/2 left-0 z-20 -translate-y-1/2 rounded-full border border-border/40 bg-background shadow-md hover:bg-accent"
              onClick={() => setLeftDrawerOpen(true)}
              size="icon"
              variant="ghost"
              type="button"
            >
              <PanelLeft className="size-4" />
            </Button>
            <Button
              aria-label="Toggle right panel"
              className="absolute top-1/2 right-0 z-20 -translate-y-1/2 rounded-full border border-border/40 bg-background shadow-md hover:bg-accent"
              onClick={() => setRightDrawerOpen(true)}
              size="icon"
              variant="ghost"
              type="button"
            >
              <PanelRight className="size-4" />
            </Button>
            {chatPanel}

            {/* 左 Drawer：团队列表 */}
            <Drawer open={leftDrawerOpen} onOpenChange={setLeftDrawerOpen} direction="left">
              <DrawerContent className="h-full w-4/5 max-w-sm p-2">
                {listPanel}
              </DrawerContent>
            </Drawer>

            {/* 右 Drawer：团队详情 */}
            <Drawer open={rightDrawerOpen} onOpenChange={setRightDrawerOpen} direction="right">
              <DrawerContent className="h-full w-4/5 max-w-sm p-2">
                {detailPanel}
              </DrawerContent>
            </Drawer>
          </div>
        ) : (
          <ResizablePanelGroup
            orientation="horizontal"
            className="flex-1 gap-3"
            defaultLayout={savedLayout}
            onLayoutChange={handleLayoutChange}
          >
            <ResizablePanel id={PANEL_ID_LIST} defaultSize="25%" minSize="18%" maxSize="35%">
              {listPanel}
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel id={PANEL_ID_CHAT} defaultSize="40%" minSize="30%" className="min-w-0">
              {chatPanel}
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel
              id={PANEL_ID_DETAIL}
              defaultSize="35%"
              minSize="22%"
              className="min-w-0"
              collapsible
              collapsedSize="0%"
              panelRef={detailPanelRef}
              onResize={(size) => {
                // 用户拖拽到 0 或展开时同步按钮状态
                setInfoSidebarOpen(size.asPercentage > 0);
              }}
            >
              {detailPanel}
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </main>

      <CreateTeamDialog
        open={dialogOpen}
        mode={dialogMode}
        loading={savingTeam}
        agents={availableAgents}
        defaultValues={dialogMode === "create" ? dialogDefaults : undefined}
        editTarget={
          dialogMode === "edit" && editingTeam
            ? {
                name: editingTeam.name,
                description: editingTeam.description,
                purpose: editingTeam.purpose,
                icon: editingTeam.icon,
                avatarUrl: editingTeam.avatarUrl ?? editingTeam.avatar_url,
                visibility: editingTeam.visibility,
              }
            : null
        }
        onOpenChange={setDialogOpen}
        onSubmit={submitTeam}
      />

      <WorkflowListDialog
        open={workflowListOpen}
        workflows={workflows}
        mode="single"
        onConfirm={(selected) => {
          const workflow = selected[0];
          if (workflow) handleImportFromWorkflow(workflow);
        }}
        onCreate={() => {}}
        onClose={() => setWorkflowListOpen(false)}
        showCreate={false}
      />
    </div>
  );
});
