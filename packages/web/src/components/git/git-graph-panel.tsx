"use client";

import { useEffect, useCallback, useMemo } from "react";
import { GitCommit, GitBranch as BranchIcon } from "lucide-react";
import { useGitStore } from "@/stores/git";
import { GitNotInitialized } from "./git-not-initialized";

interface GitGraphPanelProps {
  workspaceId: string;
}

export function GitGraphPanel({ workspaceId }: GitGraphPanelProps) {
  const { log, status, notGitRepo, loadLog, loadStatus } = useGitStore();

  const refresh = useCallback(() => {
    loadLog(workspaceId);
    loadStatus(workspaceId);
  }, [workspaceId, loadLog, loadStatus]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (notGitRepo) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center px-2 py-1.5 border-b">
          <span className="text-xs font-medium text-muted-foreground">Graph</span>
        </div>
        <GitNotInitialized workspaceId={workspaceId} onInitialized={refresh} />
      </div>
    );
  }

  const branch = status?.branch ?? "—";
  const ahead = status?.ahead ?? 0;
  const behind = status?.behind ?? 0;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-2 py-1.5 border-b">
        <div className="flex items-center gap-2 text-xs">
          <BranchIcon size={14} />
          <span className="font-mono font-medium">{branch}</span>
          {ahead > 0 && (
            <span className="text-green-600">↑{ahead}</span>
          )}
          {behind > 0 && (
            <span className="text-red-500">↓{behind}</span>
          )}
        </div>
        <button
          onClick={refresh}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Refresh
        </button>
      </div>
      <div className="flex-1 overflow-auto pl-4">
        {log.map((entry, i) => {
          const isLast = i === log.length - 1;
          return (
            <div key={entry.hash} className="flex items-start gap-2 py-1">
              {/* Graph line */}
              <div className="flex flex-col items-center shrink-0 pt-1">
                <GitCommit size={14} className="text-blue-500 shrink-0" />
                {!isLast && (
                  <div className="w-px flex-1 bg-border min-h-4" />
                )}
              </div>
              {/* Commit info */}
              <div className="flex-1 min-w-0">
                <div className="text-xs truncate">{entry.message.split("\n")[0]}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <code className="text-xs font-mono text-muted-foreground">
                    {entry.hash.slice(0, 7)}
                  </code>
                  <span className="text-xs text-muted-foreground">{entry.author}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatRelativeTime(entry.date)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
        {!log.length && (
          <div className="p-2 text-xs text-muted-foreground">No commits</div>
        )}
      </div>
    </div>
  );
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}
