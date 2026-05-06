"use client";

import dynamic from "next/dynamic";
import "@/lib/monaco-loader";
import { useEffect, useCallback, useState, useRef } from "react";
import { FileCode, FileText, RotateCcw, RefreshCw, Trash2, ChevronDown, GitBranch, EyeOff, Sparkles, Loader2, Upload, Download } from "lucide-react";
import { useGitStore } from "@/stores/git";
import { useEditorStore } from "@/stores/editor";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DiffViewer } from "./diff-viewer";
import { GitNotInitialized } from "./git-not-initialized";
import { GitRemoteDialog } from "./git-remote-dialog";
import { useTheme } from "@/components/theme-provider";
import { toast } from "sonner";

const MonacoEditor = dynamic(
  () => import("@monaco-editor/react").then((mod) => mod.default),
  { ssr: false, loading: () => <div className="flex items-center justify-center h-32 text-muted-foreground text-xs">Loading editor...</div> }
);

interface GitPanelProps {
  workspaceId: string;
}

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

export function GitChangesPanel({ workspaceId }: GitPanelProps) {
  const { status, diffs, selectedFile, loading, notGitRepo, branches, loadStatus, loadDiffs, loadBranches, commit, discard, discardAll, checkout, selectFile, push, pull, getRemotes, addRemote } = useGitStore();
  const openFile = useEditorStore((s) => s.openFile);
  const { resolvedTheme } = useTheme();
  const [commitMsg, setCommitMsg] = useState("");
  const [committing, setCommitting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [branchOpen, setBranchOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [remoteDialogOpen, setRemoteDialogOpen] = useState(false);

  // gitignore dialog
  const [gitignoreOpen, setGitignoreOpen] = useState(false);
  const [gitignoreContent, setGitignoreContent] = useState("");
  const [gitignoreSaving, setGitignoreSaving] = useState(false);

  // context menu
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; path: string } | null>(null);
  const ctxMenuRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => {
    loadStatus(workspaceId);
    loadDiffs(workspaceId);
  }, [workspaceId, loadStatus, loadDiffs]);

  useEffect(() => {
    refresh();
    loadBranches(workspaceId);
  }, [workspaceId, refresh, loadBranches]);

  const handleFileClick = useCallback(
    (path: string) => {
      selectFile(path === selectedFile ? null : path);
    },
    [selectedFile, selectFile],
  );

  const handleOpenFile = useCallback(
    (e: React.MouseEvent, path: string) => {
      e.stopPropagation();
      openFile(workspaceId, path);
    },
    [workspaceId, openFile],
  );

  const handleDiscard = useCallback(
    async (e: React.MouseEvent, path: string) => {
      e.stopPropagation();
      await discard(workspaceId, path);
      refresh();
    },
    [workspaceId, discard, refresh],
  );

  const handleDiscardAll = useCallback(async () => {
    await discardAll(workspaceId);
    refresh();
  }, [workspaceId, discardAll, refresh]);

  const handleCheckout = useCallback(
    async (branch: string) => {
      setBranchOpen(false);
      await checkout(workspaceId, branch);
      refresh();
      loadBranches(workspaceId);
    },
    [workspaceId, checkout, refresh, loadBranches],
  );

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
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to generate' }));
        throw new Error(err.error);
      }
      const data = await res.json();
      if (data.message) setCommitMsg(data.message);
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate commit message');
    } finally {
      setGenerating(false);
    }
  }, [workspaceId, generating, committing]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        handleCommit();
      }
    },
    [handleCommit],
  );

  const handleSyncChanges = useCallback(async () => {
    setSyncing(true);
    try {
      const remotes = await getRemotes(workspaceId);
      if (!remotes.length) {
        setRemoteDialogOpen(true);
        return;
      }
      await push(workspaceId);
      await pull(workspaceId);
      toast.success("Synced successfully");
      refresh();
    } catch (err: any) {
      if (err.message?.includes("No remote")) {
        setRemoteDialogOpen(true);
      } else {
        toast.error("Sync failed", { description: err.message });
      }
    } finally {
      setSyncing(false);
    }
  }, [workspaceId, push, pull, getRemotes, refresh]);

  const handleRemoteSubmit = useCallback(async (name: string, url: string) => {
    await addRemote(workspaceId, name, url);
    toast.success("Remote added, syncing...");
    try {
      await push(workspaceId);
      await pull(workspaceId);
      toast.success("Synced successfully");
      refresh();
    } catch (err: any) {
      toast.error("Sync failed", { description: err.message });
    }
  }, [workspaceId, addRemote, push, pull, refresh]);

  const openGitignore = useCallback(async () => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/files/content?path=.gitignore`);
      const data = await res.json();
      setGitignoreContent(data.content ?? "");
    } catch {
      setGitignoreContent("");
    }
    setGitignoreOpen(true);
  }, [workspaceId]);

  const saveGitignore = useCallback(async () => {
    setGitignoreSaving(true);
    try {
      await fetch(`/api/workspaces/${workspaceId}/files/content`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: ".gitignore", content: gitignoreContent }),
      });
      setGitignoreOpen(false);
      refresh();
    } finally {
      setGitignoreSaving(false);
    }
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
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: ".gitignore", content: next }),
      });
      refresh();
    } catch { /* ignore */ }
  }, [workspaceId, refresh]);

  const handleContextMenu = useCallback((e: React.MouseEvent, path: string) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, path });
  }, []);

  // close context menu on outside click
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [ctxMenu]);

  if (notGitRepo) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center px-2 py-1.5 border-b">
          <span className="text-xs font-medium text-muted-foreground">Changes</span>
        </div>
        <GitNotInitialized workspaceId={workspaceId} onInitialized={refresh} />
      </div>
    );
  }

  const selectedDiff = diffs.find((d) => d.path === selectedFile);
  const hasFiles = (status?.files.length ?? 0) > 0;

  return (
    <div className="flex h-full overflow-hidden rounded-t-xl bg-background">
      {/* File list */}
      <div className="w-64 border-r flex flex-col bg-muted/20">
        <div className="flex items-center gap-1 px-2 py-1.5 border-b">
          {/* Branch selector */}
          <div className="relative flex-1 min-w-0">
            <button
              onClick={() => setBranchOpen(!branchOpen)}
              className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground w-full"
            >
              <GitBranch size={13} className="shrink-0" />
              <span className="truncate">{status?.branch ?? "..."}</span>
              {status && hasFiles && (
                <span className="text-muted-foreground">({status.files.length})</span>
              )}
              <ChevronDown size={12} className="shrink-0" />
            </button>
            {branchOpen && (
              <div className="absolute left-0 top-full z-50 mt-1 w-48 bg-popover border rounded shadow-md py-0.5 max-h-60 overflow-auto">
                {branches.map((b) => (
                  <button
                    key={b.name}
                    onClick={() => handleCheckout(b.name)}
                    className={`w-full text-left px-2 py-1 text-xs hover:bg-accent truncate ${
                      b.current ? "font-semibold text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {b.name}
                  </button>
                ))}
                {branches.length === 0 && (
                  <div className="px-2 py-1 text-xs text-muted-foreground">No branches</div>
                )}
              </div>
            )}
          </div>

          {/* Discard all + Refresh */}
          {hasFiles && (
            <button
              onClick={handleDiscardAll}
              className="p-1 text-muted-foreground hover:text-destructive"
              title="Discard all changes"
            >
              <Trash2 size={13} />
            </button>
          )}
          <button
            onClick={refresh}
            className="p-1 text-muted-foreground hover:text-foreground"
            title="Refresh"
          >
            <RefreshCw size={13} />
          </button>
          <button
            onClick={openGitignore}
            className="p-1 text-muted-foreground hover:text-foreground"
            title="Edit .gitignore"
          >
            <FileText size={13} />
          </button>
        </div>

        {/* Click outside to close branch dropdown */}
        {branchOpen && (
          <div className="fixed inset-0 z-40" onClick={() => setBranchOpen(false)} />
        )}

        {/* File list */}
        <div className="flex-1 overflow-auto">
          {loading && !status && (
            <div className="p-2 text-xs text-muted-foreground">Loading...</div>
          )}
          {status?.files.map((f) => (
            <div
              key={f.path}
              onClick={() => handleFileClick(f.path)}
              onContextMenu={(e) => handleContextMenu(e, f.path)}
              className={`group w-full text-left px-2 py-1 text-xs font-mono flex items-center gap-1.5 hover:bg-accent cursor-pointer ${
                selectedFile === f.path ? "bg-accent" : ""
              }`}
            >
              <span className={`w-4 text-center font-bold shrink-0 ${statusColors[f.status]}`}>
                {statusLabels[f.status]}
              </span>
              <span className="truncate flex-1">{f.path}</span>
              <span className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                <button
                  onClick={(e) => handleOpenFile(e, f.path)}
                  className="p-0.5 rounded hover:bg-accent/80"
                  title="Open file"
                >
                  <FileCode size={13} />
                </button>
                <button
                  onClick={(e) => handleDiscard(e, f.path)}
                  className="p-0.5 rounded hover:bg-accent/80"
                  title="Discard changes"
                >
                  <RotateCcw size={13} />
                </button>
              </span>
            </div>
          ))}
          {status?.clean && (
            <div className="p-2 text-xs text-muted-foreground">No changes</div>
          )}
        </div>

        {/* Commit input */}
        {hasFiles && (
          <div className="border-t p-2 space-y-1.5">
            <div className="relative">
              <textarea
                value={commitMsg}
                onChange={(e) => setCommitMsg(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Commit message (⌘+Enter)"
                rows={3}
                className="w-full resize-none text-xs px-2 pt-1 pr-8 pb-7 border rounded bg-background disabled:opacity-50"
                disabled={committing || generating}
              />
              <button
                type="button"
                onClick={handleGenerateCommit}
                disabled={generating || committing || !hasFiles}
                className="absolute bottom-1.5 right-1.5 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="AI generate commit message"
              >
                {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              </button>
            </div>
            <button
              onClick={handleCommit}
              disabled={!commitMsg.trim() || committing}
              className="w-full text-xs px-2 py-1 rounded bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {committing ? "Committing..." : "Commit"}
            </button>
          </div>
        )}
        {!hasFiles && (status?.ahead ?? 0) > 0 && (
          <div className="border-t p-2">
            <button
              onClick={handleSyncChanges}
              disabled={syncing}
              className="w-full text-xs px-2 py-1 rounded bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            >
              {syncing ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Upload size={13} />
              )}
              {syncing ? "Syncing..." : "Sync Changes"}
            </button>
          </div>
        )}
      </div>

      {/* Diff area */}
      <div className="flex-1">
        {selectedDiff ? (
          <DiffViewer
            oldContent={selectedDiff.oldContent}
            newContent={selectedDiff.newContent}
            path={selectedDiff.path}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
            {hasFiles ? "Select a file to view diff" : "No changes to show"}
          </div>
        )}
      </div>

      {/* .gitignore dialog */}
      <Dialog open={gitignoreOpen} onOpenChange={setGitignoreOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>.gitignore</DialogTitle>
          </DialogHeader>
          <div className="h-80 border rounded overflow-hidden">
            <MonacoEditor
              height="100%"
              language="plaintext"
              value={gitignoreContent}
              onChange={(v) => setGitignoreContent(v ?? "")}
              options={{
                fontSize: 13,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                padding: { top: 8 },
                lineNumbers: "on",
              }}
              theme={resolvedTheme === "dark" ? "vs-dark" : "vs"}
            />
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>取消</DialogClose>
            <Button size="sm" onClick={saveGitignore} disabled={gitignoreSaving}>
              {gitignoreSaving ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Context menu */}
      {ctxMenu && (
        <div
          ref={ctxMenuRef}
          className="fixed z-[100] bg-popover border rounded-lg shadow-md py-1 text-xs min-w-40 ring-1 ring-foreground/10"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
        >
          <button
            className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-accent text-left"
            onClick={() => addToGitignore(ctxMenu.path.split("/").pop()!)}
          >
            <EyeOff size={13} />
            <span>忽略此文件</span>
            <span className="ml-auto text-muted-foreground truncate max-w-24">{ctxMenu.path.split("/").pop()}</span>
          </button>
          <button
            className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-accent text-left"
            onClick={() => {
              const idx = ctxMenu.path.lastIndexOf("/");
              const dir = idx >= 0 ? ctxMenu.path.substring(0, idx + 1) : "";
              if (dir) addToGitignore(dir);
            }}
          >
            <EyeOff size={13} />
            <span>忽略文件路径</span>
            <span className="ml-auto text-muted-foreground truncate max-w-24">
              {(() => { const i = ctxMenu.path.lastIndexOf("/"); return i >= 0 ? ctxMenu.path.substring(0, i + 1) : ctxMenu.path; })()}
            </span>
          </button>
        </div>
      )}

      <GitRemoteDialog open={remoteDialogOpen} onOpenChange={setRemoteDialogOpen} onSubmit={handleRemoteSubmit} />
    </div>
  );
}
