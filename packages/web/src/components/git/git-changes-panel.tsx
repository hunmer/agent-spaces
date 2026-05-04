"use client";

import { useEffect, useCallback, useState } from "react";
import { FileCode, RotateCcw, RefreshCw, Trash2, ChevronDown, GitBranch } from "lucide-react";
import { useGitStore } from "@/stores/git";
import { useEditorStore } from "@/stores/editor";
import { DiffViewer } from "./diff-viewer";
import { GitNotInitialized } from "./git-not-initialized";

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
  const { status, diffs, selectedFile, loading, notGitRepo, branches, loadStatus, loadDiffs, loadBranches, commit, discard, discardAll, checkout, selectFile } = useGitStore();
  const openFile = useEditorStore((s) => s.openFile);
  const [commitMsg, setCommitMsg] = useState("");
  const [committing, setCommitting] = useState(false);
  const [branchOpen, setBranchOpen] = useState(false);

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
    await commit(workspaceId, commitMsg.trim());
    setCommitMsg("");
    setCommitting(false);
    refresh();
  }, [workspaceId, commitMsg, commit, refresh]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        handleCommit();
      }
    },
    [handleCommit],
  );

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
    <div className="flex h-full">
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
            <input
              type="text"
              value={commitMsg}
              onChange={(e) => setCommitMsg(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Commit message (⌘+Enter)"
              className="w-full text-xs px-2 py-1 border rounded bg-background"
              disabled={committing}
            />
            <button
              onClick={handleCommit}
              disabled={!commitMsg.trim() || committing}
              className="w-full text-xs px-2 py-1 rounded bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {committing ? "Committing..." : "Commit"}
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
    </div>
  );
}
