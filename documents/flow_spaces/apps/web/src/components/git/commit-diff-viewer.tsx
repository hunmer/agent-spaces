"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, FileCode } from "lucide-react";
import { DiffViewer } from "./diff-viewer";
import type { GitDiffResult } from "@agent-spaces/shared";

interface CommitDiffViewerProps {
  diffs: GitDiffResult[];
  message: string;
}

export function CommitDiffViewer({ diffs, message }: CommitDiffViewerProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = (path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  if (diffs.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No changes
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="text-xs text-muted-foreground px-3 py-1.5 border-b bg-muted/30">
        {message.split("\n")[0]} &middot; {diffs.length} file{diffs.length > 1 ? "s" : ""}
      </div>
      {diffs.map((diff) => {
        const isCollapsed = collapsed.has(diff.path);
        return (
          <div key={diff.path} className="border-b last:border-b-0">
            <button
              className="flex items-center gap-1.5 w-full px-2 py-1 text-xs font-mono hover:bg-accent/50 text-left cursor-pointer"
              onClick={() => toggle(diff.path)}
            >
              {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
              <FileCode size={13} className="text-muted-foreground shrink-0" />
              <span className="truncate">{diff.path}</span>
            </button>
            {!isCollapsed && (
              <div className="h-64">
                <DiffViewer oldContent={diff.oldContent} newContent={diff.newContent} path={diff.path} isBinary={diff.isBinary} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
