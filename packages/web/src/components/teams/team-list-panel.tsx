"use client";

import type { AgentConfig } from "@agent-spaces/shared";
import type { TeamView } from "@agent-spaces/sdk";
import { useTranslations } from "next-intl";
import { EllipsisVertical, Eraser, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TeamCard } from "@/components/teams/team-card";
import { formatTime } from "@/components/teams/team-management-utils";

interface TeamListPanelProps {
  error: string;
  loadingTeams: boolean;
  loadingArchived: boolean;
  canCreateTeam: boolean;
  teams: TeamView[];
  archivedTeams: TeamView[];
  selectedTeamId: string;
  availableAgents: AgentConfig[];
  onCreateTeam: () => void;
  onImportFromWorkflow: () => void;
  onSelectTeam: (team: TeamView) => void;
  onEditTeam: (team: TeamView) => void;
  onDissolveTeam: (team: TeamView) => void;
  onRestoreArchived: (team: TeamView) => void;
  onDeleteArchived: (team: TeamView) => void;
  onClearArchived: () => void;
}

export function TeamListPanel({
  error,
  loadingTeams,
  loadingArchived,
  canCreateTeam,
  teams,
  archivedTeams,
  selectedTeamId,
  availableAgents,
  onCreateTeam,
  onImportFromWorkflow,
  onSelectTeam,
  onEditTeam,
  onDissolveTeam,
  onRestoreArchived,
  onDeleteArchived,
  onClearArchived,
}: TeamListPanelProps) {
  const t = useTranslations("teams");

  return (
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
          <Button variant="ghost" size="icon" onClick={onCreateTeam} disabled={!canCreateTeam} title={t("newTeam")}>
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
              <DropdownMenuItem onClick={onImportFromWorkflow}>
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
                  onSelect={onSelectTeam}
                  onEdit={onEditTeam}
                  onDelete={onDissolveTeam}
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
              onClick={onClearArchived}
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
                  onRestore={onRestoreArchived}
                  onDelete={onDeleteArchived}
                  agents={availableAgents}
                  archivedAtLabel={team.dissolved_at ? `${t("list.archivedAt")} ${formatTime(team.dissolved_at)}` : ""}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </section>
  );
}
