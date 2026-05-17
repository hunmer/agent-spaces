"use client";

import dynamic from "next/dynamic";
import "@/lib/monaco-loader";
import { useEffect, useCallback, useState, useRef } from "react";
import {
  Upload, Download, Loader2, GitCommitHorizontal, RefreshCw,
  FileCode, RotateCcw, Trash2, ChevronDown, GitBranch,
  EyeOff, Sparkles, Settings2,
} from "lucide-react";
import { useGitStore } from "@/stores/git";
import { useEditorStore } from "@/stores/editor";
import { useChannelStore } from "@/stores/channel";
import { useAgentStore } from "@/stores/agent";
import { GitNotInitialized } from "./git-not-initialized";
import { GitRemoteDialog } from "./git-remote-dialog";
import { DiffViewer } from "./diff-viewer";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { GitSettingsForm } from "@/components/git/git-settings-form";
import { useTheme } from "@/components/theme-provider";
import { useIsMobile } from "@/hooks/use-mobile";
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";

const MonacoEditor = dynamic(
  () => import("@monaco-editor/react").then((mod) => mod.default),
  { ssr: false, loading: () => <div className="flex items-center justify-center h-32 text-muted-foreground text-xs">Loading editor...</div> }
);

const statusColors: Record<string, string> = {
  modified: "text-yellow-600",
  added: "text-green-600",
  deleted: "text-red-600",
  renamed: "text-blue-600",
  untracked: "text-gray-500",
};

const statusLabels: Record<string, string> = {
  modified: "M",
  added: "A",
  deleted: "D",
  renamed: "R",
  untracked: "U",
};

interface Props {
  workspaceId: string;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function GitCommitsPanel({ workspaceId }: Props) {
  const tc = useTranslations('common');
  const t = useTranslations('git.commits');
  const tChanges = useTranslations('git.changes');
  const { resolvedTheme } = useTheme();
  const isMobile = useIsMobile();

  const {
    log, loading, notGitRepo, status, branches, diffs, selectedFile,
    loadLog, loadStatus, loadDiffs, loadBranches,
    push, pull, getRemotes, addRemote,
    commit, discard, discardAll, checkout, selectFile,
    checkoutDetached, cherryPick, createBranch, deleteBranch,
    createTag, getCommitDiff, getRemoteUrl, getMergeBase,
  } = useGitStore();
  const openFile = useEditorStore((s) => s.openFile);
  const openCommitDiff = useEditorStore((s) => s.openCommitDiff);
  const { activeChannelId, sendMessage } = useChannelStore();
  const agents = useAgentStore((s) => s.agents);

  const [syncing, setSyncing] = useState<"push" | "pull" | null>(null);
  const [remoteDialogOpen, setRemoteDialogOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<"push" | "pull" | null>(null);
  const [branchOpen, setBranchOpen] = useState(false);
  const [commitMsg, setCommitMsg] = useState("");
  const [committing, setCommitting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [promptDialog, setPromptDialog] = useState<{
    open: boolean; title: string; label: string; placeholder: string;
    onSubmit: (value: string) => void;
  }>({ open: false, title: '', label: '', placeholder: '', onSubmit: () => {} });
  const [promptValue, setPromptValue] = useState('');
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; path: string } | null>(null);
  const ctxMenuRef = useRef<HTMLDivElement>(null);
  const [gitignoreOpen, setGitignoreOpen] = useState(false);
  const [gitignoreContent, setGitignoreContent] = useState("");
  const [gitSettingsOpen, setGitSettingsOpen] = useState(false);
  const [gitignoreSaving, setGitignoreSaving] = useState(false);
  const [discardConfirm, setDiscardConfirm] = useState<{ type: 'single'; path: string } | { type: 'all' } | null>(null);

  const ahead = status?.ahead ?? 0;
  const behind = status?.behind ?? 0;
  const remoteHeadIndex = ahead > 0 ? ahead : -1;
  const hasFiles = (status?.files.length ?? 0) > 0;
  const selectedDiff = diffs.find((d) => d.path === selectedFile);

  const refresh = useCallback(() => {
    loadStatus(workspaceId);
    loadDiffs(workspaceId);
    loadLog(workspaceId);
  }, [workspaceId, loadStatus, loadDiffs, loadLog]);

  useEffect(() => { refresh(); loadBranches(workspaceId); }, [workspaceId, refresh, loadBranches]);

  useEffect(() => {
    const id = setInterval(() => { loadStatus(workspaceId); loadDiffs(workspaceId); }, 5000);
    return () => clearInterval(id);
  }, [workspaceId, loadStatus, loadDiffs]);

  // close context menu on outside click
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [ctxMenu]);

  // ---- sync ----
  const handleSync = async (action: "push" | "pull") => {
    setSyncing(action);
    try {
      const remotes = await getRemotes(workspaceId);
      if (!remotes.length) { setPendingAction(action); setRemoteDialogOpen(true); return; }
      await doSync(action);
    } catch (err: unknown) {
      if (errMsg(err)?.includes("No remote")) { setPendingAction(action); setRemoteDialogOpen(true); }
      else toast.error(action === "push" ? t('pushFailed') : t('pullFailed'), { description: errMsg(err) });
    } finally { setSyncing(null); }
  };

  const doSync = async (action: "push" | "pull") => {
    if (action === "push") { await push(workspaceId); toast.success(t('pushedSuccessfully')); }
    else { await pull(workspaceId); toast.success(t('pulledSuccessfully')); }
    refresh();
  };

  const handleRemoteSubmit = async (name: string, url: string) => {
    await addRemote(workspaceId, name, url);
    toast.success(t('remoteAdded'));
    if (pendingAction) { await doSync(pendingAction); setPendingAction(null); }
  };

  const handleSyncChanges = useCallback(async () => {
    setSyncing("push");
    try {
      const remotes = await getRemotes(workspaceId);
      if (!remotes.length) { setRemoteDialogOpen(true); return; }
      await push(workspaceId); await pull(workspaceId);
      toast.success(tChanges('syncedSuccessfully'));
      refresh();
    } catch (err: unknown) {
      if (errMsg(err)?.includes("No remote")) setRemoteDialogOpen(true);
      else toast.error(tChanges('syncFailed'), { description: errMsg(err) });
    } finally { setSyncing(null); }
  }, [workspaceId, push, pull, getRemotes, refresh]);

  // ---- branch ----
  const handleBranchCheckout = useCallback(async (branch: string) => {
    setBranchOpen(false);
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
  }, [workspaceId, commitMsg, commit, refresh, selectFile]);

  const handleGenerateCommit = useCallback(async () => {
    if (generating || committing) return;
    setGenerating(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/git/generate-commit-message`, { method: 'POST' });
      if (!res.ok) { const e = await res.json().catch(() => ({ error: 'Failed' })); throw new Error(e.error); }
      const data = await res.json();
      if (data.message) setCommitMsg(data.message);
    } catch (err: unknown) { toast.error(errMsg(err) || tChanges('failedCommitMessage')); }
    finally { setGenerating(false); }
  }, [workspaceId, generating, committing]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleCommit();
  }, [handleCommit]);

  // ---- changes file actions ----
  const handleFileClick = useCallback((path: string) => {
    selectFile(path === selectedFile ? null : path);
  }, [selectedFile, selectFile]);

  const handleOpenFile = useCallback((e: React.MouseEvent, path: string) => {
    e.stopPropagation(); openFile(workspaceId, path);
  }, [workspaceId, openFile]);

  const handleDiscard = useCallback((e: React.MouseEvent, path: string) => {
    e.stopPropagation(); setDiscardConfirm({ type: 'single', path });
  }, []);

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
  const openGitignore = useCallback(async () => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/files/content?path=.gitignore`);
      const data = await res.json(); setGitignoreContent(data.content ?? "");
    } catch { setGitignoreContent(""); }
    setGitignoreOpen(true);
  }, [workspaceId]);

  const saveGitignore = useCallback(async () => {
    setGitignoreSaving(true);
    try {
      await fetch(`/api/workspaces/${workspaceId}/files/content`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: ".gitignore", content: gitignoreContent }),
      });
      setGitignoreOpen(false); refresh();
    } finally { setGitignoreSaving(false); }
  }, [workspaceId, gitignoreContent, refresh]);

  const addToGitignore = useCallback(async (pattern: string) => {
    setCtxMenu(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/files/content?path=.gitignore`);
      const data = await res.json();
      const existing: string = data.content ?? "";
      const lines = existing.split("\n").filter(Boolean);
      if (lines.includes(pattern)) return;
      const next = existing && !existing.endsWith("\n") ? existing + "\n" + pattern + "\n" : existing + pattern + "\n";
      await fetch(`/api/workspaces/${workspaceId}/files/content`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: ".gitignore", content: next }),
      });
      refresh();
    } catch { /* ignore */ }
  }, [workspaceId, refresh]);

  // ---- commit context menu ----
  const openPromptDialog = (title: string, label: string, placeholder: string, onSubmit: (v: string) => void) => {
    setPromptValue(''); setPromptDialog({ open: true, title, label, placeholder, onSubmit });
  };

  const refreshAll = () => { refresh(); loadBranches(workspaceId); };

  const handleOpenChanges = async (entry: { hash: string; message: string }) => {
    try {
      const diffs = await getCommitDiff(workspaceId, entry.hash);
      if (diffs.length > 0) { openCommitDiff(workspaceId, entry.hash, entry.message, diffs); }
    } catch (err: unknown) { toast.error(t('contextMenu.failed'), { description: errMsg(err) }); }
  };

  const handleOpenOnGitHub = async (entry: { hash: string }) => {
    try {
      const remoteUrl = await getRemoteUrl(workspaceId);
      if (!remoteUrl) { toast.error(t('contextMenu.failed'), { description: 'No remote URL' }); return; }
      window.open(remoteUrl.replace(/\.git$/, '') + '/commit/' + entry.hash, '_blank');
    } catch (err: unknown) { toast.error(t('contextMenu.failed'), { description: errMsg(err) }); }
  };

  const handleCheckoutCommit = async (entry: { hash: string }) => {
    try { await checkout(workspaceId, entry.hash); toast.success(t('contextMenu.checkedOut')); refreshAll(); }
    catch (err: unknown) { toast.error(t('contextMenu.failed'), { description: errMsg(err) }); }
  };

  const handleCheckoutDetached = async (entry: { hash: string }) => {
    try { await checkoutDetached(workspaceId, entry.hash); toast.success(t('contextMenu.checkedOut')); refreshAll(); }
    catch (err: unknown) { toast.error(t('contextMenu.failed'), { description: errMsg(err) }); }
  };

  const handleCreateBranch = (entry: { hash: string }) => {
    openPromptDialog(t('contextMenu.createBranch'), t('contextMenu.branchName'), 'feature/...', async (name) => {
      try { await createBranch(workspaceId, name, entry.hash); toast.success(t('contextMenu.branchCreated')); refreshAll(); }
      catch (err: unknown) { toast.error(t('contextMenu.failed'), { description: errMsg(err) }); }
    });
  };

  const handleDeleteBranch = () => {
    const branchList = branches.filter(b => !b.current);
    if (!branchList.length) { toast.error(t('contextMenu.failed'), { description: 'No other branches' }); return; }
    openPromptDialog(t('contextMenu.deleteBranch'), t('contextMenu.branchToDelete'), branchList.map(b => b.name).join(', '), async (name) => {
      try { await deleteBranch(workspaceId, name); toast.success(t('contextMenu.branchDeleted')); refreshAll(); }
      catch (err: unknown) { toast.error(t('contextMenu.failed'), { description: errMsg(err) }); }
    });
  };

  const handleCreateTag = (entry: { hash: string }) => {
    openPromptDialog(t('contextMenu.createTag'), t('contextMenu.tagName'), 'v1.0.0', async (name) => {
      try { await createTag(workspaceId, name, entry.hash); toast.success(t('contextMenu.tagCreated')); }
      catch (err: unknown) { toast.error(t('contextMenu.failed'), { description: errMsg(err) }); }
    });
  };

  const handleCherryPick = async (entry: { hash: string }) => {
    try { await cherryPick(workspaceId, entry.hash); toast.success(t('contextMenu.cherryPicked')); refreshAll(); }
    catch (err: unknown) { toast.error(t('contextMenu.failed'), { description: errMsg(err) }); }
  };

  const handleCompareWithRemote = async (entry: { hash: string }) => {
    try {
      const diffs = await getCommitDiff(workspaceId, entry.hash);
      useGitStore.setState({ diffs });
      toast.info(t('contextMenu.comparingWith', { hash: entry.hash.slice(0, 7) }));
    } catch (err: unknown) { toast.error(t('contextMenu.failed'), { description: errMsg(err) }); }
  };

  const handleCompareWithMergeBase = async (entry: { hash: string }) => {
    try {
      const base = await getMergeBase(workspaceId);
      if (!base) { toast.error(t('contextMenu.failed'), { description: 'No merge base' }); return; }
      const diffs = await getCommitDiff(workspaceId, entry.hash);
      useGitStore.setState({ diffs });
      toast.info(t('contextMenu.comparingWith', { hash: base.slice(0, 7) }));
    } catch (err: unknown) { toast.error(t('contextMenu.failed'), { description: errMsg(err) }); }
  };

  const handleExplainChanges = async (entry: { hash: string; message: string }) => {
    if (!activeChannelId) { toast.error(t('contextMenu.failed'), { description: 'No active channel' }); return; }
    const agent = agents.find(a => a.enabled && a.role !== 'bot' && a.role !== 'scheduler');
    const diffSummary = await getCommitDiff(workspaceId, entry.hash).then(diffs =>
      diffs.map(d => d.path).join('\n')
    ).catch(() => '');
    const text = agent
      ? `@${agent.name} Explain the changes in commit \`${entry.hash.slice(0, 7)}\`: ${entry.message.split('\n')[0]}\n\nChanged files:\n${diffSummary}`
      : `Explain the changes in commit \`${entry.hash.slice(0, 7)}\`: ${entry.message.split('\n')[0]}\n\nChanged files:\n${diffSummary}`;
    sendMessage(workspaceId, activeChannelId, text, agent ? [agent.id] : []);
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

  const commitContextMenu = (entry: { hash: string; message: string; author: string; date: string }) => (
    <ContextMenuContent className="min-w-48">
      <ContextMenuItem onClick={() => handleOpenChanges(entry)}>{t('contextMenu.openChanges')}</ContextMenuItem>
      <ContextMenuItem onClick={() => handleOpenOnGitHub(entry)}>{t('contextMenu.openOnGitHub')}</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={() => handleCheckoutCommit(entry)}>{t('contextMenu.checkout')}</ContextMenuItem>
      <ContextMenuItem onClick={() => handleCheckoutDetached(entry)}>{t('contextMenu.checkoutDetached')}</ContextMenuItem>
      <ContextMenuItem onClick={() => handleCreateBranch(entry)}>{t('contextMenu.createBranch')}</ContextMenuItem>
      <ContextMenuItem onClick={handleDeleteBranch}>{t('contextMenu.deleteBranch')}</ContextMenuItem>
      <ContextMenuItem onClick={() => handleCreateTag(entry)}>{t('contextMenu.createTag')}</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={() => handleCherryPick(entry)}>{t('contextMenu.cherryPick')}</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuSub>
        <ContextMenuSubTrigger>{t('contextMenu.compareWith')}</ContextMenuSubTrigger>
        <ContextMenuSubContent>
          <ContextMenuItem onClick={() => handleCompareWithRemote(entry)}>{t('contextMenu.compareWithRemote')}</ContextMenuItem>
          <ContextMenuItem onClick={() => handleCompareWithMergeBase(entry)}>{t('contextMenu.compareWithMergeBase')}</ContextMenuItem>
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={() => { navigator.clipboard.writeText(entry.hash); toast.success(t('contextMenu.commitIdCopied')); }}>
        {t('contextMenu.copyCommitId')}
      </ContextMenuItem>
      <ContextMenuItem onClick={() => { navigator.clipboard.writeText(entry.message); toast.success(t('contextMenu.commitMessageCopied')); }}>
        {t('contextMenu.copyCommitMessage')}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={() => handleExplainChanges(entry)}>{t('contextMenu.explainChanges')}</ContextMenuItem>
    </ContextMenuContent>
  );

  return (
    <div className={`flex h-full overflow-hidden rounded-t-xl bg-background ${isMobile ? 'flex-col' : ''}`}>
      {/* Left: Changes panel */}
      <div className={`flex flex-col bg-muted/20 ${isMobile ? 'w-full border-b max-h-[40%]' : 'w-64 border-r'}`}>
        {/* Header with branch selector */}
        <div className="flex items-center gap-1 px-2 py-1.5 border-b">
          <div className="relative flex-1 min-w-0">
            <button onClick={() => setBranchOpen(!branchOpen)} className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground w-full">
              <GitBranch size={13} className="shrink-0" />
              <span className="truncate">{status?.branch ?? "..."}</span>
              {status && hasFiles && <span className="text-muted-foreground">({status.files.length})</span>}
              <ChevronDown size={12} className="shrink-0" />
            </button>
            {branchOpen && (
              <>
                <div className="absolute left-0 top-full z-50 mt-1 w-48 bg-popover border rounded shadow-md py-0.5 max-h-60 overflow-auto">
                  {branches.map((b) => (
                    <button key={b.name} onClick={() => handleBranchCheckout(b.name)}
                      className={`w-full text-left px-2 py-1 text-xs hover:bg-accent truncate ${b.current ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                      {b.name}
                    </button>
                  ))}
                  {branches.length === 0 && <div className="px-2 py-1 text-xs text-muted-foreground">{tChanges('noBranches')}</div>}
                </div>
                <div className="fixed inset-0 z-40" onClick={() => setBranchOpen(false)} />
              </>
            )}
          </div>
          {hasFiles && (
            <button onClick={handleDiscardAll} className="p-1 text-muted-foreground hover:text-destructive" title={tChanges('discardAll')}>
              <Trash2 size={13} />
            </button>
          )}
          <button onClick={refresh} className="p-1 text-muted-foreground hover:text-foreground" title={tc('refresh')}>
            <RefreshCw size={13} />
          </button>
        </div>

        {/* File list */}
        <div className="flex-1 overflow-auto">
          {status?.files.map((f) => (
            <div key={f.path} onClick={() => handleFileClick(f.path)} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ x: e.clientX, y: e.clientY, path: f.path }); }}
              className={`group w-full text-left px-2 py-1 text-xs font-mono flex items-center gap-1.5 hover:bg-accent cursor-pointer ${selectedFile === f.path ? "bg-accent" : ""}`}>
              <span className={`w-4 text-center font-bold shrink-0 ${statusColors[f.status]}`}>{statusLabels[f.status]}</span>
              <span className="truncate flex-1">{f.path}</span>
              <span className="hidden group-hover:flex md:flex items-center gap-0.5 shrink-0">
                <button onClick={(e) => handleOpenFile(e, f.path)} className="p-0.5 rounded hover:bg-accent/80" title={tc('open')}><FileCode size={13} /></button>
                <button onClick={(e) => handleDiscard(e, f.path)} className="p-0.5 rounded hover:bg-accent/80" title={tChanges('discardAll')}><RotateCcw size={13} /></button>
              </span>
            </div>
          ))}
          {status?.clean && <div className="p-2 text-xs text-muted-foreground">{tChanges('noChanges')}</div>}
        </div>

        {/* Commit input */}
        {hasFiles ? (
          <div className="border-t p-2 space-y-1.5">
            <div className="relative">
              <textarea value={commitMsg} onChange={(e) => setCommitMsg(e.target.value)} onKeyDown={handleKeyDown}
                placeholder={tChanges('commitMessagePlaceholder')} rows={3}
                className="w-full resize-none text-xs px-2 pt-1 pr-8 pb-7 border rounded bg-background disabled:opacity-50"
                disabled={committing || generating} />
              <button type="button" onClick={handleGenerateCommit} disabled={generating || committing || !hasFiles}
                className="absolute bottom-1.5 right-1.5 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="AI generate commit message">
                {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              </button>
            </div>
            <button onClick={handleCommit} disabled={!commitMsg.trim() || committing}
              className="w-full text-xs px-2 py-1 rounded bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed">
              {committing ? tChanges('committing') : tChanges('commit')}
            </button>
          </div>
        ) : ahead > 0 ? (
          <div className="border-t p-2">
            <button onClick={handleSyncChanges} disabled={syncing !== null}
              className="w-full text-xs px-2 py-1 rounded bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5">
              {syncing ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
              {syncing ? tChanges('syncing') : tChanges('syncChanges')}
            </button>
          </div>
        ) : null}
      </div>

      {/* Right: Commits + Diff */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Commits header */}
        <div className="flex items-center justify-between px-2 py-1.5 border-b shrink-0">
          <span className="text-xs font-medium text-muted-foreground">
            {log.length > 0 ? t('titleWithCount', { count: log.length }) : t('title')}
          </span>
          <div className="flex items-center gap-1">
            <button onClick={() => handleSync("push")} disabled={syncing !== null}
              className="relative p-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
              title={ahead > 0 ? t('pushNCommits', { count: ahead }) : "Push"}>
              {syncing === "push" ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
              {ahead > 0 && (
                <span className="absolute -top-1 -right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-foreground px-1 text-[9px] font-medium leading-none text-background">{ahead}</span>
              )}
            </button>
            <button onClick={() => handleSync("pull")} disabled={syncing !== null}
              className="relative p-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
              title={behind > 0 ? t('pullNCommits', { count: behind }) : "Pull"}>
              {syncing === "pull" ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              {behind > 0 && (
                <span className="absolute -top-1 -right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-foreground px-1 text-[9px] font-medium leading-none text-background">{behind}</span>
              )}
            </button>
            <button onClick={refresh} className="text-muted-foreground hover:text-foreground"><RefreshCw size={13} /></button>
            <button onClick={() => setGitSettingsOpen(true)} className="text-muted-foreground hover:text-foreground" title={t('settingsTitle')}><Settings2 size={13} /></button>
          </div>
        </div>

        {/* Commit list or Diff */}
        {selectedDiff ? (
          <div className="flex-1 min-h-0">
            <DiffViewer oldContent={selectedDiff.oldContent} newContent={selectedDiff.newContent} path={selectedDiff.path} />
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading && !log.length && (
              <div className="p-2 space-y-1">
                <SkeletonGroup count={6}>
                  {(i) => (
                    <div key={i} className="px-2 py-1.5 border-b space-y-1.5">
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-3 w-10 rounded" />
                        <Skeleton className="h-3 flex-1" />
                      </div>
                      <div className="flex items-center gap-2 pl-7">
                        <Skeleton className="h-3 w-20" />
                        <Skeleton className="h-3 w-16" />
                      </div>
                    </div>
                  )}
                </SkeletonGroup>
              </div>
            )}
            {log.map((entry, i) => {
              const isRemoteHead = i === remoteHeadIndex;
              return (
                <ContextMenu key={entry.hash}>
                  <ContextMenuTrigger>
                    <div className={`px-2 py-1.5 border-b hover:bg-accent cursor-default ${isRemoteHead ? 'border-l-2 border-l-blue-500' : ''}`}>
                      <div className="flex items-center gap-2">
                        {isRemoteHead && <span title={t('remoteTrackingBranch')}><GitCommitHorizontal size={13} className="shrink-0 text-blue-500" /></span>}
                        <code className="text-xs font-mono text-blue-600 shrink-0">{entry.hash.slice(0, 7)}</code>
                        <span className="text-xs truncate">{entry.message.split("\n")[0]}</span>
                      </div>
                      <div className={`flex items-center gap-2 mt-0.5 ${isRemoteHead ? 'pl-[21px]' : ''}`}>
                        <span className="text-xs text-muted-foreground">{entry.author}</span>
                        <span className="text-xs text-muted-foreground">{new Date(entry.date).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </ContextMenuTrigger>
                  {commitContextMenu(entry)}
                </ContextMenu>
              );
            })}
            {!loading && !log.length && <div className="p-2 text-xs text-muted-foreground">{t('noCommits')}</div>}
          </div>
        )}
      </div>

      {/* File context menu */}
      {ctxMenu && (
        <div ref={ctxMenuRef}
          className="fixed z-[100] bg-popover border rounded-lg shadow-md py-1 text-xs min-w-40 ring-1 ring-foreground/10"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}>
          <button className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-accent text-left"
            onClick={() => addToGitignore(ctxMenu.path.split("/").pop()!)}>
            <EyeOff size={13} />
            <span>{tChanges('ignoreThisFile')}</span>
            <span className="ml-auto text-muted-foreground truncate max-w-24">{ctxMenu.path.split("/").pop()}</span>
          </button>
          <button className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-accent text-left"
            onClick={() => {
              const idx = ctxMenu.path.lastIndexOf("/");
              const dir = idx >= 0 ? ctxMenu.path.substring(0, idx + 1) : "";
              if (dir) addToGitignore(dir);
            }}>
            <EyeOff size={13} />
            <span>{tChanges('ignoreFilePath', { path: (() => { const i = ctxMenu.path.lastIndexOf("/"); return i >= 0 ? ctxMenu.path.substring(0, i + 1) : ctxMenu.path; })() })}</span>
          </button>
        </div>
      )}

      {/* Dialogs */}
      <GitRemoteDialog open={remoteDialogOpen} onOpenChange={setRemoteDialogOpen} onSubmit={handleRemoteSubmit} />

      <Dialog open={promptDialog.open} onOpenChange={(open) => setPromptDialog((p) => ({ ...p, open }))}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{promptDialog.title}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">{promptDialog.label}</label>
            <Input value={promptValue} onChange={(e) => setPromptValue(e.target.value)} placeholder={promptDialog.placeholder} autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter' && promptValue.trim()) { promptDialog.onSubmit(promptValue.trim()); setPromptDialog((p) => ({ ...p, open: false })); } }} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPromptDialog((p) => ({ ...p, open: false }))}>{tc('cancel')}</Button>
            <Button disabled={!promptValue.trim()} onClick={() => { promptDialog.onSubmit(promptValue.trim()); setPromptDialog((p) => ({ ...p, open: false })); }}>{tc('confirm')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={gitignoreOpen} onOpenChange={setGitignoreOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>.gitignore</DialogTitle></DialogHeader>
          <div className="h-80 border rounded overflow-hidden">
            <MonacoEditor height="100%" language="plaintext" value={gitignoreContent} onChange={(v) => setGitignoreContent(v ?? "")}
              options={{ fontSize: 13, minimap: { enabled: false }, scrollBeyondLastLine: false, padding: { top: 8 }, lineNumbers: "on" }}
              theme={resolvedTheme === "dark" ? "vs-dark" : "vs"} />
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>{tc('cancel')}</DialogClose>
            <Button size="sm" onClick={saveGitignore} disabled={gitignoreSaving}>{gitignoreSaving ? tc('saving') : tc('save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={gitSettingsOpen} onOpenChange={setGitSettingsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('settingsTitle')}</DialogTitle>
          </DialogHeader>
          <GitSettingsForm scope="local" workspaceId={workspaceId} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!discardConfirm} onOpenChange={(open) => !open && setDiscardConfirm(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{discardConfirm?.type === 'all' ? tChanges('discardAll') : tChanges('discard')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {discardConfirm?.type === 'all'
              ? tChanges('confirmDiscardAll')
              : tChanges('confirmDiscardFile', { file: discardConfirm?.type === 'single' ? discardConfirm.path : '' })}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiscardConfirm(null)}>{tc('cancel')}</Button>
            <Button variant="destructive" onClick={confirmDiscard}>{tChanges('discard')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
