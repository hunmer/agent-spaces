"use client";

import { useEffect, useCallback, useState } from "react";
import { Upload, Download, Loader2 } from "lucide-react";
import { useGitStore } from "@/stores/git";
import { GitNotInitialized } from "./git-not-initialized";
import { GitRemoteDialog } from "./git-remote-dialog";
import { toast } from "sonner";

interface GitCommitsPanelProps {
  workspaceId: string;
}

export function GitCommitsPanel({ workspaceId }: GitCommitsPanelProps) {
  const { log, loading, notGitRepo, status, loadLog, loadStatus, push, pull, getRemotes, addRemote } = useGitStore();
  const [syncing, setSyncing] = useState<"push" | "pull" | null>(null);
  const [remoteDialogOpen, setRemoteDialogOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<"push" | "pull" | null>(null);

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
          {(status?.ahead ?? 0) > 0 && (
            <span className="text-xs text-muted-foreground">↑{status!.ahead}</span>
          )}
          {(status?.behind ?? 0) > 0 && (
            <span className="text-xs text-muted-foreground">↓{status!.behind}</span>
          )}
          <button
            onClick={() => handleSync("push")}
            disabled={syncing !== null}
            className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
            title="Push"
          >
            {syncing === "push" ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
          </button>
          <button
            onClick={() => handleSync("pull")}
            disabled={syncing !== null}
            className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
            title="Pull"
          >
            {syncing === "pull" ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
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
        {log.map((entry) => (
          <div
            key={entry.hash}
            className="px-2 py-1.5 border-b hover:bg-accent cursor-default"
          >
            <div className="flex items-center gap-2">
              <code className="text-xs font-mono text-blue-600 shrink-0">
                {entry.hash.slice(0, 7)}
              </code>
              <span className="text-xs truncate">{entry.message.split("\n")[0]}</span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-muted-foreground">{entry.author}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(entry.date).toLocaleDateString()}
              </span>
            </div>
          </div>
        ))}
        {!loading && !log.length && (
          <div className="p-2 text-xs text-muted-foreground">No commits</div>
        )}
      </div>
      <GitRemoteDialog open={remoteDialogOpen} onOpenChange={setRemoteDialogOpen} onSubmit={handleRemoteSubmit} />
    </div>
  );
}
