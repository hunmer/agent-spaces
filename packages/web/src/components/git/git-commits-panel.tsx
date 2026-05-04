"use client";

import { useEffect, useCallback } from "react";
import { useGitStore } from "@/stores/git";
import { GitNotInitialized } from "./git-not-initialized";

interface GitCommitsPanelProps {
  workspaceId: string;
}

export function GitCommitsPanel({ workspaceId }: GitCommitsPanelProps) {
  const { log, loading, notGitRepo, loadLog } = useGitStore();

  const refresh = useCallback(() => {
    loadLog(workspaceId);
  }, [workspaceId, loadLog]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (notGitRepo) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center px-2 py-1.5 border-b">
          <span className="text-xs font-medium text-muted-foreground">Commits</span>
        </div>
        <GitNotInitialized workspaceId={workspaceId} onInitialized={refresh} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-2 py-1.5 border-b">
        <span className="text-xs font-medium text-muted-foreground">
          Commits{log.length > 0 && ` (${log.length})`}
        </span>
        <button
          onClick={refresh}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Refresh
        </button>
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
    </div>
  );
}
