"use client";

import { useEffect, useCallback, useState, useMemo } from "react";
import { Upload, Download, Loader2, GitCommitHorizontal } from "lucide-react";
import { useGitStore } from "@/stores/git";
import { GitNotInitialized } from "./git-not-initialized";
import { GitRemoteDialog } from "./git-remote-dialog";
import { toast } from "sonner";

interface GitCommitsPanelProps {
  workspaceId: string;
}

function SyncBadge({ count, kind }: { count: number; kind: "push" | "pull" }) {
  if (count <= 0) return null;
  return (
    <span className="absolute -top-1 -right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-foreground px-1 text-[9px] font-medium leading-none text-background">
      {count}
    </span>
  );
}

export function GitCommitsPanel({ workspaceId }: GitCommitsPanelProps) {
  const { log, loading, notGitRepo, status, loadLog, loadStatus, push, pull, getRemotes, addRemote } = useGitStore();
  const [syncing, setSyncing] = useState<"push" | "pull" | null>(null);
  const [remoteDialogOpen, setRemoteDialogOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<"push" | "pull" | null>(null);

  const ahead = status?.ahead ?? 0;
  const behind = status?.behind ?? 0;
  // remote HEAD is `ahead` commits behind local HEAD in the log array
  const remoteHeadIndex = ahead > 0 ? ahead : -1;

  const refresh = useCallback(() => {
    loadLog(workspaceId);
    loadStatus(workspaceId);
  }, [workspaceId, loadLog, loadStatus]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleSync = async (action: "push" | "pull") => {
    setSyncing(action);
    try {
      const remotes = await getRemotes(workspaceId);
      if (!remotes.length) {
        setPendingAction(action);
        setRemoteDialogOpen(true);
        return;
      }
      await doSync(action);
    } catch (err: any) {
      if (err.message?.includes("No remote")) {
        setPendingAction(action);
        setRemoteDialogOpen(true);
      } else {
        toast.error(action === "push" ? "Push failed" : "Pull failed", { description: err.message });
      }
    } finally {
      setSyncing(null);
    }
  };

  const doSync = async (action: "push" | "pull") => {
    if (action === "push") {
      await push(workspaceId);
      toast.success("Pushed successfully");
    } else {
      await pull(workspaceId);
      toast.success("Pulled successfully");
    }
    refresh();
  };

  const handleRemoteSubmit = async (name: string, url: string) => {
    await addRemote(workspaceId, name, url);
    toast.success("Remote added");
    if (pendingAction) {
      await doSync(pendingAction);
      setPendingAction(null);
    }
  };

  if (notGitRepo) {
    return (
      <div className="flex flex-col h-full overflow-hidden rounded-t-xl bg-background">
        <div className="flex items-center px-2 py-1.5 border-b">
          <span className="text-xs font-medium text-muted-foreground">Commits</span>
        </div>
        <GitNotInitialized workspaceId={workspaceId} onInitialized={refresh} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden rounded-t-xl bg-background">
      <div className="flex items-center justify-between px-2 py-1.5 border-b">
        <span className="text-xs font-medium text-muted-foreground">
          Commits{log.length > 0 && ` (${log.length})`}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => handleSync("push")}
            disabled={syncing !== null}
            className="relative p-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
            title={ahead > 0 ? `Push ${ahead} commit${ahead > 1 ? 's' : ''}` : "Push"}
          >
            {syncing === "push" ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            <SyncBadge count={ahead} kind="push" />
          </button>
          <button
            onClick={() => handleSync("pull")}
            disabled={syncing !== null}
            className="relative p-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
            title={behind > 0 ? `Pull ${behind} commit${behind > 1 ? 's' : ''}` : "Pull"}
          >
            {syncing === "pull" ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            <SyncBadge count={behind} kind="pull" />
          </button>
          <button
            onClick={refresh}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Refresh
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {loading && !log.length && (
          <div className="p-2 text-xs text-muted-foreground">Loading...</div>
        )}
        {log.map((entry, i) => {
          const isRemoteHead = i === remoteHeadIndex;
          return (
            <div
              key={entry.hash}
              className={`px-2 py-1.5 border-b hover:bg-accent cursor-default ${isRemoteHead ? 'border-l-2 border-l-blue-500' : ''}`}
            >
              <div className="flex items-center gap-2">
                {isRemoteHead && (
                  <span title="Remote tracking branch"><GitCommitHorizontal size={13} className="shrink-0 text-blue-500" /></span>
                )}
                <code className="text-xs font-mono text-blue-600 shrink-0">
                  {entry.hash.slice(0, 7)}
                </code>
                <span className="text-xs truncate">{entry.message.split("\n")[0]}</span>
              </div>
              <div className={`flex items-center gap-2 mt-0.5 ${isRemoteHead ? 'pl-[21px]' : ''}`}>
                <span className="text-xs text-muted-foreground">{entry.author}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(entry.date).toLocaleDateString()}
                </span>
              </div>
            </div>
          );
        })}
        {!loading && !log.length && (
          <div className="p-2 text-xs text-muted-foreground">No commits</div>
        )}
      </div>
      <GitRemoteDialog open={remoteDialogOpen} onOpenChange={setRemoteDialogOpen} onSubmit={handleRemoteSubmit} />
    </div>
  );
}
