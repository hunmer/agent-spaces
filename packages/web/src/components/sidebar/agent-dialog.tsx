"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { type AgentRole } from "@agent-spaces/shared";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Bot, Download, FileText, Store } from "lucide-react";
import { StoreTabPanel } from "@/components/common/store-tab-panel";
import {
  ROLE_COLORS,
  newAgentDraft,
  newEmptyAgent,
} from "./agent-shared";
import { AgentList } from "./agent-list";
import { AgentCard } from "./agent-card";
import { AgentEditor } from "./agent-editor";
import { useAgentDialogData, type StoreAgentItem, type TabType } from "./agent-dialog-data";
import { AgentDialogHeader } from "./agent-dialog-header";
import { ExternalImportDialog } from "./external-import-dialog";

export function AgentDialog({
  open,
  onOpenChange,
  roleFilter,
  initialAgentId,
  standalone,
  presetBasePath = "/api/agents/presets",
  singleAgent = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roleFilter?: AgentRole | AgentRole[];
  initialAgentId?: string;
  standalone?: boolean;
  presetBasePath?: string;
  singleAgent?: boolean;
}) {
  const t = useTranslations("agent");
  const tc = useTranslations("common");

  const data = useAgentDialogData({
    open,
    initialAgentId,
    presetBasePath,
    singleAgent,
    roleFilter,
    onOpenChange,
  });
  const [externalImportOpen, setExternalImportOpen] = useState(false);

  const handleAutoGenerate = () => {
    const draft = data.addRoleOptions[0]
      ? newAgentDraft(data.addRoleOptions[0])
      : newEmptyAgent();
    data.setSelectedAgent(draft);
    data.setAutoGenerate(true);
  };

  // Role filter sidebar
  const roleSidebar = (
    <ScrollArea className="hidden md:block w-44 shrink-0">
      <div className="flex flex-col gap-1 pr-2">
        <Button
          variant={!data.roleFilterLocal ? "secondary" : "ghost"}
          size="sm"
          className="w-full justify-start"
          onClick={() => data.setRoleFilterLocal("")}
        >
          <FileText className="size-3.5 mr-1.5" />
          {t("dialog.filterAll")}
        </Button>
        {data.uniqueRoles.map((role) => (
          <Button
            key={role}
            variant={data.roleFilterLocal === role ? "secondary" : "ghost"}
            size="sm"
            className="w-full justify-start"
            onClick={() => data.setRoleFilterLocal(data.roleFilterLocal === role ? "" : role)}
          >
            <span className={`size-2 rounded-full mr-1.5 ${ROLE_COLORS[role]?.split(" ")[0]}`} />
            <span className="truncate capitalize">{t(`role.${role}.name`)}</span>
          </Button>
        ))}
        {data.hasSystemAgents && (
          <Button
            variant={data.roleFilterLocal === "system" ? "secondary" : "ghost"}
            size="sm"
            className="w-full justify-start"
            onClick={() => data.setRoleFilterLocal(data.roleFilterLocal === "system" ? "" : "system")}
          >
            <Bot className="size-3.5 mr-1.5" />
            <span className="truncate">System</span>
          </Button>
        )}
      </div>
    </ScrollArea>
  );

  const tabs = (
    <div className="flex items-center gap-1 border-b border-border px-1">
      {([["local", FileText, t("dialog.tabLocal")], ["store", Store, t("dialog.tabStore")]] as [TabType, typeof FileText, string][]).map(([key, Icon, label]) => (
        <button
          key={key}
          onClick={() => data.setActiveTab(key)}
          className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
            data.activeTab === key
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Icon className="size-3.5" />
          {label}
        </button>
      ))}
    </div>
  );

  const storeView = (
    <StoreTabPanel<StoreAgentItem>
      items={data.storeAgents}
      loading={data.storeLoading}
      getGroup={(a) => a.group}
      getId={(a) => a.id}
      allFilterText={t("dialog.filterAll")}
      searchPlaceholder={t("dialog.searchStore")}
      emptyText={t("dialog.storeEmpty")}
      loadingText={tc("loading")}
      gridClassName="grid-cols-2 lg:grid-cols-3"
      renderItem={(agent) => {
        const isImported = data.localAgentNames.has(agent.name);
        const isImporting = data.importingIds.has(agent.id);
        return (
          <AgentCard
            agentId={agent.id}
            icon={agent.emoji || "🤖"}
            name={agent.name}
            description={agent.description}
            meta={
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                {agent.group}
              </span>
            }
            actions={
              <Button
                variant={isImported ? "ghost" : "outline"}
                size="sm"
                className="shrink-0"
                disabled={isImported || isImporting}
                onClick={() => data.importFromStore(agent)}
              >
                {isImported ? (
                  t("dialog.imported")
                ) : isImporting ? (
                  t("dialog.importing")
                ) : (
                  <>
                    <Download className="size-3.5 mr-1" />
                    {t("dialog.importTo")}
                  </>
                )}
              </Button>
            }
          />
        );
      }}
    />
  );

  const content = (
    <>
      <AgentDialogHeader
        standalone={!!standalone}
        selectedAgent={data.selectedAgent}
        singleAgent={singleAgent}
        saving={data.saving}
        syncingTemplates={data.syncingTemplates}
        editorRef={data.editorRef}
        roleFilterSet={data.roleFilterSet}
        addRoleOptions={data.addRoleOptions}
        onBack={data.handleBack}
        onOpenChange={onOpenChange}
        onSyncTemplates={data.handleSyncTemplates}
        onAutoGenerate={handleAutoGenerate}
        handleAddAgent={data.handleAddAgent}
        importOpen={data.importOpen}
        setImportOpen={data.setImportOpen}
        openJsonImport={() => data.jsonInputRef.current?.click()}
        openTextImport={() => { data.setImportError(""); data.setTextDialogOpen(true); }}
        openExternalImport={() => setExternalImportOpen(true)}
      />

      {/* Hidden json file input for agent import */}
      <input
        ref={data.jsonInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={data.handleImportAgentFile}
      />

      {data.error && !data.selectedAgent && (
        <div className="mx-5 mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {data.error}
        </div>
      )}
      {data.loading ? (
        <div className="flex-1 flex flex-col p-2 space-y-1">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg px-3 py-2.5">
              <div className="size-8 rounded-full bg-muted animate-pulse" />
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-20 rounded bg-muted animate-pulse" />
                  <div className="h-4 w-10 rounded-full bg-muted animate-pulse" />
                </div>
                <div className="h-3 w-32 rounded bg-muted animate-pulse" />
              </div>
              <div className="h-3 w-12 rounded bg-muted animate-pulse" />
            </div>
          ))}
        </div>
      ) : !data.selectedAgent ? (
        <div className="flex flex-1 min-h-0 flex-col">
          {tabs}
          {data.activeTab === "local" ? (
            <div className="flex flex-1 min-h-0 gap-4 pt-2">
              {(data.uniqueRoles.length > 1 || data.hasSystemAgents) && roleSidebar}
              <div className="flex-1 min-w-0 flex flex-col min-h-0">
                <div className="relative mb-3">
                  <Bot className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={data.localSearch}
                    onChange={(e) => data.setLocalSearch(e.target.value)}
                    placeholder={t("dialog.searchLocal")}
                    className="pl-8"
                  />
                </div>
                <div className="flex-1 overflow-y-auto">
                  <AgentList
                    agents={data.filteredAgents}
                    onSelect={data.handleSelectAgent}
                    onDelete={data.handleDeleteAgent}
                    onToggleEnabled={data.handleToggleEnabled}
                  />
                </div>
              </div>
            </div>
          ) : (
            storeView
          )}
        </div>
      ) : (
        <AgentEditor
          ref={data.editorRef}
          agent={data.selectedAgent}
          roleOptions={data.addRoleOptions}
          onSaved={data.handleEditorSaved}
          onBack={singleAgent ? () => onOpenChange(false) : data.handleBack}
          showFooter={true}
          autoOpenGenerate={data.autoGenerate}
          presetBasePath={presetBasePath}
        />
      )}
    </>
  );

  if (standalone) {
    return <div className="h-full flex flex-col">{content}</div>;
  }

  return (
    <>
    <Dialog open={open} onOpenChange={(o) => { if (!o && !singleAgent) data.handleBack(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-[80vw] max-h-[85vh] flex flex-col p-0 gap-0">
        {content}
      </DialogContent>
    </Dialog>

    {/* Import agents from JSON text */}
    <Dialog open={data.textDialogOpen} onOpenChange={data.setTextDialogOpen}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{t("dialog.importTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Textarea
            value={data.importText}
            onChange={(e) => { data.setImportText(e.target.value); data.setImportError(""); }}
            placeholder={t("dialog.importPlaceholder")}
            className="font-mono text-xs min-h-[200px] resize-none"
          />
          {data.importError && (
            <p className="text-xs text-destructive">{data.importError}</p>
          )}
          <Button
            size="sm"
            onClick={() => data.runAgentImport(data.importText)}
            disabled={!data.importText.trim()}
            className="w-full"
          >
            {t("dialog.importConfirm")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    <ExternalImportDialog
      open={externalImportOpen}
      onOpenChange={setExternalImportOpen}
      kinds={["agents"]}
      defaultKind="agents"
      onImported={data.refreshAgents}
    />
    </>
  );
}
