"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { WorkflowTemplate } from "@agent-spaces/shared";
import { useTranslations } from "next-intl";
import { EllipsisVertical, Eraser, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
import { TeamMemberList } from "@/components/teams/team-member-list";
import { TeamChatPanel } from "@/components/teams/team-chat-panel";
import { WorkflowListDialog } from "@/components/workflow/workflow-list-dialog";
import { TeamCard } from "@/components/teams/team-card";

const PANEL_ID_LIST = "team-list";
const PANEL_ID_CHAT = "team-chat";
const PANEL_ID_DETAIL = "team-detail";

// 三栏布局持久化（百分比 Layout，见 docs/ui/react-resizable-panels-size-units.md）
const LAYOUT_KEY = "team-management:layout";
const DEFAULT_LAYOUT: Record<string, number> = {
  [PANEL_ID_LIST]: 25,
  [PANEL_ID_CHAT]: 40,
  [PANEL_ID_DETAIL]: 35,
};

function loadSavedLayout(): Record<string, number> {
  if (typeof window === "undefined") return DEFAULT_LAYOUT;
  try {
    const raw = window.localStorage.getItem(LAYOUT_KEY);
    const parsed = raw ? JSON.parse(raw) as Record<string, number> : null;
    if (!parsed) return DEFAULT_LAYOUT;
    // 合并默认值，避免新增 panel id 时缺字段
    return { ...DEFAULT_LAYOUT, ...parsed };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

function extractAgentRunIds(workflow: WorkflowTemplate): string[] {
  const ids: string[] = [];
  for (const node of workflow.nodes ?? []) {
    if (node.type !== "agent" && node.type !== "agent_run") continue;
    const data = node.data ?? {};
    // 兼容两种数据结构：
    // 1. 内联 agent 定义：node.data.agent.id
    // 2. 引用模式：node.data.agentConfigId
    const agentObj = data.agent as { id?: unknown } | undefined;
    const fromAgent = agentObj && typeof agentObj.id === "string" ? agentObj.id.trim() : "";
    const fromConfigId = typeof data.agentConfigId === "string" ? data.agentConfigId.trim() : "";
    const id = fromAgent || fromConfigId;
    if (id) ids.push(id);
  }
  const result = Array.from(new Set(ids));
  // eslint-disable-next-line no-console
  console.log("[extractAgentRunIds]", { workflowName: workflow.name, nodeCount: (workflow.nodes ?? []).length, extractedIds: result });
  return result;
}

function formatTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

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
  const ensureAgents = useAgentStore((store) => store.ensure);
  const agents = useAgentStore((store) => store.agents);
  const [selectedActorId, setSelectedActorId] = useState("");
  const [teams, setTeams] = useState<TeamView[]>([]);
  const [archivedTeams, setArchivedTeams] = useState<TeamView[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState("");
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

  const { workflows, loadWorkflows } = useWorkflowStore();

  const availableAgents = useMemo(
    () => agents.filter((agent) => agent.enabled !== false),
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
        actor_agent_id: selectedActorId,
        scope: "visible",
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
  }, [selectedActorId, selectedTeamId]);

  const loadArchivedTeams = useCallback(async () => {
    if (!selectedActorId) {
      setArchivedTeams([]);
      return;
    }
    setLoadingArchived(true);
    try {
      const data = await sdk.team.list({
        actor_agent_id: selectedActorId,
        archived: true,
        page_size: 100,
      });
      setArchivedTeams(data.teams.filter((team) => team.status === "archived"));
    } catch {
      setArchivedTeams([]);
    } finally {
      setLoadingArchived(false);
    }
  }, [selectedActorId]);

  const loadTeamDetail = useCallback(async (teamId: string) => {
    try {
      const data = await sdk.team.get(teamId, selectedActorId, true);
      setTeamDetail(data);
    } catch (err) {
      setTeamDetail(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [selectedActorId]);

  useEffect(() => {
    if (!selectedActorId) return;
    void loadTeams();
    void loadArchivedTeams();
  }, [loadTeams, loadArchivedTeams, selectedActorId]);

  useEffect(() => {
    if (!selectedActorId || !selectedTeamId) {
      setTeamDetail(null);
      return;
    }
    void loadTeamDetail(selectedTeamId);
  }, [loadTeamDetail, selectedActorId, selectedTeamId]);

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
            .map((agent_id) => ({ agent_id, role: "member" })),
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
    if (!confirm(t("deleteConfirm", { name: team.name }))) return;
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
    if (!confirm(t("archived.deleteConfirm", { name: team.name }))) return;
    setError("");
    try {
      await sdk.team.deleteArchive(team.team_id);
      await loadArchivedTeams();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function restoreArchivedTeam(team: TeamView) {
    if (!confirm(t("archived.restoreConfirm", { name: team.name }))) return;
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
    if (!confirm(t("archived.clearConfirm"))) return;
    setError("");
    try {
      await sdk.team.clearArchives();
      await loadArchivedTeams();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="flex min-h-dvh w-full flex-col">
      <main className="mx-auto flex size-full flex-1 flex-col gap-4 px-4 py-6 sm:px-6">
        {!selectedActorId ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            {t("empty.setup")}
          </div>
        ) : (
          <ResizablePanelGroup
            orientation="horizontal"
            className="flex-1 gap-3"
            defaultLayout={savedLayout}
            onLayoutChange={handleLayoutChange}
          >
            <ResizablePanel id={PANEL_ID_LIST} defaultSize="25%" minSize="18%" maxSize="35%">
            <section className="flex h-full flex-col rounded-2xl border border-border bg-card p-4">
              {error ? (
                <div className="mb-2 rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              ) : null}
              <div className=" flex items-center justify-between">
                <h2 className="font-medium">{t("list.title")}</h2>
                <div className="flex items-center gap-1">
                  {loadingTeams || loadingArchived ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
                  <Button variant="ghost" size="icon" onClick={openCreateDialog} disabled={!canCreateTeam} title={t("newTeam")}>
                    <Plus className="size-4" />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button variant="ghost" size="icon" disabled={!canCreateTeam}>
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
              </div>
              <Tabs defaultValue="active" className="min-h-0 flex-1 flex-col gap-2">
                <TabsList className="self-start">
                  <TabsTrigger value="active">{t("tabs.active")}</TabsTrigger>
                  <TabsTrigger value="archived">{t("tabs.archived")}</TabsTrigger>
                </TabsList>
                <TabsContent value="active" className="min-h-0 flex-1 overflow-auto">
                  {teams.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                      {t("empty.teams")}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {teams.map((team) => (
                        <TeamCard
                          key={team.team_id}
                          team={team}
                          mode="active"
                          selected={team.team_id === selectedTeamId}
                          onSelect={(item) => setSelectedTeamId(item.team_id)}
                          onEdit={(item) => openEditDialog(item)}
                          onDelete={(item) => void dissolveTeam(item)}
                          agents={availableAgents}
                        />
                      ))}
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="archived" className="min-h-0 flex-1 overflow-auto">
                  <div className="mb-2 flex items-center justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void clearAllArchived()}
                      disabled={archivedTeams.length === 0}
                    >
                      <Eraser className="size-4" />
                      {t("archived.clearAll")}
                    </Button>
                  </div>
                  {archivedTeams.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                      {t("empty.archived")}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {archivedTeams.map((team) => (
                        <TeamCard
                          key={team.team_id}
                          team={team}
                          mode="archived"
                          onRestore={(item) => void restoreArchivedTeam(item)}
                          onDelete={(item) => void deleteArchivedTeam(item)}
                          agents={availableAgents}
                          archivedAtLabel={team.dissolved_at ? `${t("list.archivedAt")} ${formatTime(team.dissolved_at)}` : ""}
                        />
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </section>
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel id={PANEL_ID_CHAT} defaultSize="40%" minSize="30%" className="min-w-0">
            <TeamChatPanel
              teamId={selectedTeamId}
              actorAgentId={selectedActorId}
              sidebarOpen={infoSidebarOpen}
              onToggleSidebar={toggleInfoSidebar}
              teamDescription={selectedTeam?.description}
            />
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel
              id={PANEL_ID_DETAIL}
              defaultSize="35%"
              minSize="22%"
              collapsible
              collapsedSize="0%"
              panelRef={detailPanelRef}
              onResize={(size) => {
                // 用户拖拽到 0 或展开时同步按钮状态
                setInfoSidebarOpen(size.asPercentage > 0);
              }}
            >
            {infoSidebarOpen ? (
            <section className="rounded-2xl border border-border bg-card p-4 h-full">
              {selectedTeam && teamDetail ? (
                <div className="flex h-full flex-col gap-4">
                  <div className="flex items-start justify-between gap-3 rounded-xl border border-border bg-background p-3">
                    <div>
                      <h2 className="text-xl font-semibold">{teamDetail.team.name}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">{teamDetail.team.description || t("detail.noDescription")}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => openEditDialog(selectedTeam)}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void dissolveTeam(selectedTeam)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-background p-3">
                    <div className="text-sm font-medium">{t("detail.purpose")}</div>
                    <p className="mt-1 text-sm text-muted-foreground">{teamDetail.team.purpose || t("detail.noPurpose")}</p>
                  </div>

                  <div className="rounded-xl border border-border p-3">
                    <TeamMemberList
                      teamId={selectedTeam.team_id}
                      actorAgentId={selectedActorId}
                      members={teamDetail.members_preview ?? []}
                      agents={availableAgents}
                      myRole={teamDetail.team.my_role}
                      onChange={() => void loadTeamDetail(selectedTeam.team_id)}
                    />
                  </div>

                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                  {t("empty.teamDetail")}
                </div>
              )}
            </section>
            ) : null}
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
        onSelect={handleImportFromWorkflow}
        onCreate={() => {}}
        onClose={() => setWorkflowListOpen(false)}
        showCreate={false}
      />
    </div>
  );
});
