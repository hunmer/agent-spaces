"use client";

import { useEffect, useCallback, useState, useMemo, useRef } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ResizablePanelGroup, ResizableHandle } from "@/components/ui/resizable";
import type { Layout } from 'react-resizable-panels';
import type { GitLogEntry, GitOperationEntry } from "@agent-spaces/shared";

import { useGitStore } from "@/stores/git";
import { useEditorStore } from "@/stores/editor";
import { GitNotInitialized } from "./git-not-initialized";
import { GitRemoteDialog } from "./git-remote-dialog";
import { GitSettingsForm } from "@/components/git/git-settings-form";
import { useIsMobile } from "@/hooks/use-mobile";
import { errMsg } from "./git-commit-utils";
import { useGitSync } from "./use-git-sync";
import { GitPromptDialog } from "./git-prompt-dialog";
import { GitDiscardDialog, type DiscardConfirm } from "./git-discard-dialog";
import { GitGitignoreDialog } from "./git-gitignore-dialog";
import { GitFileContextMenu } from "./git-file-context-menu";
import { GitCommitDetailDialog } from "./git-commit-detail-dialog";

import { sdk } from '@/lib/sdk';

import { loadGitLayout, isValidGitLayout } from "./git-panel-layout";
import { GitChangesPanel } from "./git-changes-panel";
import { GitCommitsSection } from "./git-commits-section";
import { GitOpLogDialog } from "./git-op-log-dialog";
import { GitCommitDialog } from "./git-commit-dialog";

interface Props {
  workspaceId: string;
}

export function GitCommitsPanel({ workspaceId }: Props) {
  const t = useTranslations('git.commits');
  const tChanges = useTranslations('git.changes');
  const isMobile = useIsMobile();
  const containerRef = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  const vertical = isMobile || narrow;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setNarrow(el.clientWidth < 480));
    ro.observe(el);
    setNarrow(el.clientWidth < 480);
    return () => ro.disconnect();
  }, []);

  const gitLayout = useMemo<Layout | undefined>(() => {
    return loadGitLayout(vertical);
  }, [vertical]);
  const onGitLayoutChange = useCallback((layout: Layout) => {
    if (!isValidGitLayout(layout, vertical)) return;
    try { localStorage.setItem('agent-spaces:git-layout', JSON.stringify(layout)); } catch {}
  }, [vertical]);

  const {
    log, loading, notGitRepo, status, branches, diffs, selectedFile,
    loadStatus, loadDiffs, loadLog, loadBranches,
    commit, discard, discardAll, stage, unstage, resolveFile, checkout, selectFile,
    commitMsg, setCommitMsg, fetchRemote,
  } = useGitStore();
  const openFile = useEditorStore((s) => s.openFile);
  const openCommitDiff = useEditorStore((s) => s.openCommitDiff);

  const [committing, setCommitting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [promptDialog, setPromptDialog] = useState<{
    open: boolean; title: string; label: string; placeholder: string;
    onSubmit: (value: string) => void;
  }>({ open: false, title: '', label: '', placeholder: '', onSubmit: () => {} });
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; path: string } | null>(null);
  const [gitignoreOpen, setGitignoreOpen] = useState(false);
  const [gitignoreContent, setGitignoreContent] = useState("");
  const [gitSettingsOpen, setGitSettingsOpen] = useState(false);
  const [gitignoreSaving, setGitignoreSaving] = useState(false);
  const [discardConfirm, setDiscardConfirm] = useState<DiscardConfirm>(null);
  const [detailEntry, setDetailEntry] = useState<GitLogEntry | null>(null);
  const [opLogOpen, setOpLogOpen] = useState(false);
  const [opLog, setOpLog] = useState<GitOperationEntry[]>([]);
  const [opLogLoading, setOpLogLoading] = useState(false);
  const [commitDialogOpen, setCommitDialogOpen] = useState(false);

  const openOpLog = useCallback(async () => {
    setOpLogOpen(true);
    setOpLogLoading(true);
    try {
      const data = await sdk.git.operations(workspaceId);
      setOpLog(data);
    } catch {
      setOpLog([]);
    } finally {
      setOpLogLoading(false);
    }
  }, [workspaceId]);

  const ahead = status?.ahead ?? 0;
  const behind = status?.behind ?? 0;
  const hasFiles = (status?.files.length ?? 0) > 0;
  const selectedDiff = diffs.find((d) => d.path === selectedFile);

  const refresh = useCallback(async () => {
    await fetchRemote(workspaceId).catch(() => {});
    await Promise.all([
      loadStatus(workspaceId),
      loadDiffs(workspaceId),
      loadLog(workspaceId),
    ]);
  }, [workspaceId, fetchRemote, loadStatus, loadDiffs, loadLog]);

  const handleRefreshClick = useCallback(async () => {
    await refresh();
    const nextStatus = useGitStore.getState().status;
    if ((nextStatus?.files.length ?? 0) === 0) {
      toast.info(tChanges('noChanges'));
    }
  }, [refresh, tChanges]);

  const refreshAll = useCallback(() => { refresh(); loadBranches(workspaceId); }, [workspaceId, refresh, loadBranches]);

  const { syncing, remoteDialogOpen, setRemoteDialogOpen, handleSync, handleRemoteSubmit, handleSyncChanges } = useGitSync(workspaceId, refresh);

  useEffect(() => { refresh(); loadBranches(workspaceId); }, [workspaceId, refresh, loadBranches]);

  useEffect(() => {
    const id = setInterval(() => { loadStatus(workspaceId); loadDiffs(workspaceId); }, 5000);
    return () => clearInterval(id);
  }, [workspaceId, loadStatus, loadDiffs]);

  // ---- branch ----
  const handleBranchCheckout = useCallback(async (branch: string) => {
    await checkout(workspaceId, branch);
    refresh();
    loadBranches(workspaceId);
  }, [workspaceId, checkout, refresh, loadBranches]);

  // ---- commit ----
  const handleCommit = useCallback(async () => {
    if (!commitMsg.trim()) return;
    setCommitting(true);
    selectFile(null);
    await commit(workspaceId, commitMsg.trim());
    setCommitMsg("");
    setCommitting(false);
    refresh();
  }, [workspaceId, commitMsg, commit, refresh, selectFile, setCommitMsg]);

  const handleGenerateCommit = useCallback(async () => {
    if (generating || committing) return;
    setGenerating(true);
    try {
      const data = await sdk.git.generateCommitMessage(workspaceId);
      if (data.message) setCommitMsg(data.message);
    } catch (err: unknown) { toast.error(errMsg(err) || tChanges('failedCommitMessage')); }
    finally { setGenerating(false); }
  }, [workspaceId, generating, committing, setCommitMsg, tChanges]);

  const handleAutoCommit = useCallback(async () => {
    if (generating || committing) return;
    setGenerating(true);
    try {
      const data = await sdk.git.generateCommitMessage(workspaceId);
      if (!data.message) throw new Error('No message generated');
      setCommitting(true);
      selectFile(null);
      await commit(workspaceId, data.message);
      setCommitMsg("");
      toast.success(tChanges('committedSuccessfully'));
      refresh();
    } catch (err: unknown) { toast.error(errMsg(err) || tChanges('failedCommitMessage')); }
    finally { setGenerating(false); setCommitting(false); }
  }, [workspaceId, generating, committing, commit, refresh, selectFile, setCommitMsg, tChanges]);

  // ---- changes file actions ----
  const handleOpenFile = useCallback((e: React.MouseEvent, path: string) => {
    e.stopPropagation(); openFile(workspaceId, path);
  }, [workspaceId, openFile]);

  const handleDiscard = useCallback((e: React.MouseEvent, path: string) => {
    e.stopPropagation(); setDiscardConfirm({ type: 'single', path });
  }, []);

  const handleStageToggle = useCallback(async (e: React.MouseEvent, path: string, staged?: boolean) => {
    e.stopPropagation();
    if (staged) {
      await unstage(workspaceId, path);
    } else {
      await stage(workspaceId, path);
    }
    refresh();
  }, [workspaceId, refresh, stage, unstage]);

  const handleResolveConflict = useCallback(async (path: string, content: string) => {
    await resolveFile(workspaceId, path, content, true);
    selectFile(null);
    refresh();
    toast.success("冲突已解决并暂存");
  }, [workspaceId, refresh, resolveFile, selectFile]);

  const handleDiscardAll = useCallback(() => {
    setDiscardConfirm({ type: 'all' });
  }, []);

  const confirmDiscard = useCallback(async () => {
    if (!discardConfirm) return;
    if (discardConfirm.type === 'single') {
      await discard(workspaceId, discardConfirm.path);
    } else {
      await discardAll(workspaceId);
    }
    setDiscardConfirm(null);
    refresh();
  }, [workspaceId, discardConfirm, discard, discardAll, refresh]);

  // ---- gitignore ----
  const _openGitignore = useCallback(async () => {
    try {
      const data = await sdk.editor.content(workspaceId, ".gitignore");
      setGitignoreContent(data.content ?? "");
    } catch { setGitignoreContent(""); }
    setGitignoreOpen(true);
  }, [workspaceId]);

  const saveGitignore = useCallback(async () => {
    setGitignoreSaving(true);
    try {
      await sdk.editor.save(workspaceId, ".gitignore", gitignoreContent);
      setGitignoreOpen(false); refresh();
    } finally { setGitignoreSaving(false); }
  }, [workspaceId, gitignoreContent, refresh]);

  const addToGitignore = useCallback(async (pattern: string) => {
    setCtxMenu(null);
    try {
      const data = await sdk.editor.content(workspaceId, ".gitignore");
      const existing: string = data.content ?? "";
      const lines = existing.split("\n").filter(Boolean);
      if (lines.includes(pattern)) return;
      const next = existing && !existing.endsWith("\n") ? existing + "\n" + pattern + "\n" : existing + pattern + "\n";
      await sdk.editor.save(workspaceId, ".gitignore", next);
      refresh();
    } catch { /* ignore */ }
  }, [workspaceId, refresh]);

  // ---- prompt dialog ----
  const openPromptDialog = (title: string, label: string, placeholder: string, onSubmit: (v: string) => void) => {
    setPromptDialog({ open: true, title, label, placeholder, onSubmit });
  };

  // ---- render ----
  if (notGitRepo) {
    return (
      <div className="flex flex-col h-full overflow-hidden rounded-t-xl bg-background">
        <div className="flex items-center px-2 py-1.5 border-b">
          <span className="text-xs font-medium text-muted-foreground">{t('title')}</span>
        </div>
        <GitNotInitialized workspaceId={workspaceId} onInitialized={refresh} />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-full">
    <ResizablePanelGroup orientation={vertical ? "vertical" : "horizontal"} defaultLayout={gitLayout} onLayoutChange={onGitLayoutChange} className="h-full overflow-hidden rounded-t-xl bg-background">
      <GitChangesPanel
        workspaceId={workspaceId}
        branch={status?.branch}
        branches={branches}
        files={status?.files ?? []}
        hasFiles={hasFiles}
        ahead={ahead}
        selectedFile={selectedFile}
        syncing={syncing}
        clean={!!status?.clean}
        onOpenFile={handleOpenFile}
        onDiscard={handleDiscard}
        onStageToggle={handleStageToggle}
        onDiscardAll={handleDiscardAll}
        onBranchCheckout={handleBranchCheckout}
        onCommitDialogOpen={() => setCommitDialogOpen(true)}
        onAutoCommit={handleAutoCommit}
        onSyncChanges={handleSyncChanges}
        onViewDiff={() => {
          if (diffs.length > 0) openCommitDiff(workspaceId, 'unstaged', tChanges('unstagedChanges'), diffs);
        }}
        onRefreshClick={handleRefreshClick}
        onContextMenu={(e, path) => setCtxMenu({ x: e.clientX, y: e.clientY, path })}
        isVertical={vertical}
      />

      <ResizableHandle withHandle />

      <GitCommitsSection
        workspaceId={workspaceId}
        log={log}
        loading={loading}
        ahead={ahead}
        behind={behind}
        syncing={syncing}
        currentHeadHash={status?.headHash}
        currentBranch={status?.branch}
        selectedDiff={selectedDiff}
        onPush={() => handleSync("push")}
        onPull={() => handleSync("pull")}
        onRefreshClick={handleRefreshClick}
        onSettingsOpen={() => setGitSettingsOpen(true)}
        onOpLogOpen={openOpLog}
        onSelectEntry={setDetailEntry}
        onRefreshAll={refreshAll}
        onOpenPrompt={openPromptDialog}
        onResolveConflict={handleResolveConflict}
        isVertical={vertical}
      />

      {ctxMenu && (
        <GitFileContextMenu x={ctxMenu.x} y={ctxMenu.y} path={ctxMenu.path} onAddToGitignore={addToGitignore} onOpenFile={(p) => openFile(workspaceId, p)} onDiscard={(p) => setDiscardConfirm({ type: 'single', path: p })} onClose={() => setCtxMenu(null)} />
      )}

      {/* Dialogs */}
      <GitRemoteDialog open={remoteDialogOpen} onOpenChange={setRemoteDialogOpen} onSubmit={handleRemoteSubmit} />

      <GitPromptDialog
        open={promptDialog.open}
        onOpenChange={(open) => setPromptDialog((p) => ({ ...p, open }))}
        title={promptDialog.title}
        label={promptDialog.label}
        placeholder={promptDialog.placeholder}
        onSubmit={(v) => { promptDialog.onSubmit(v); setPromptDialog((p) => ({ ...p, open: false })); }}
      />

      <GitGitignoreDialog
        open={gitignoreOpen}
        onOpenChange={setGitignoreOpen}
        content={gitignoreContent}
        onContentChange={setGitignoreContent}
        saving={gitignoreSaving}
        onSave={saveGitignore}
      />

      <Dialog open={gitSettingsOpen} onOpenChange={setGitSettingsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('settingsTitle')}</DialogTitle>
          </DialogHeader>
          <GitSettingsForm scope="local" workspaceId={workspaceId} />
        </DialogContent>
      </Dialog>

      <GitCommitDialog
        open={commitDialogOpen}
        onOpenChange={setCommitDialogOpen}
        commitMsg={commitMsg}
        onCommitMsgChange={setCommitMsg}
        committing={committing}
        generating={generating}
        onCommit={handleCommit}
        onGenerate={handleGenerateCommit}
      />

      <GitDiscardDialog
        confirm={discardConfirm}
        open={!!discardConfirm}
        onOpenChange={(open) => !open && setDiscardConfirm(null)}
        onConfirm={confirmDiscard}
      />

      <GitCommitDetailDialog
        workspaceId={workspaceId}
        entry={detailEntry}
        onClose={() => setDetailEntry(null)}
      />

      <GitOpLogDialog
        open={opLogOpen}
        onOpenChange={setOpLogOpen}
        entries={opLog}
        loading={opLogLoading}
      />
    </ResizablePanelGroup>
    </div>
  );
}