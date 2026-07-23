"use client";

import { useState, useCallback, useRef } from "react";
import {
  Upload, Loader2, RefreshCw, Trash2, ChevronDown, GitBranch,
  FileDiff, RotateCcw, Plus, Minus, AlertTriangle, Sparkles,
} from "lucide-react";
import { ResizablePanel } from "@/components/ui/resizable";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { DiffViewer } from "@/components/viewers/diff-viewer";
import { useTranslations } from "next-intl";

import { Empty, EmptyDescription, EmptyMedia } from "@/components/ui/empty";
import { FileIconImg } from "@/components/editor/file-icon";
import { getMediaType } from "@/stores/editor";
import { statusColors, statusLabels } from "./git-commit-utils";
import { sdk } from '@/lib/sdk';
import type { GitFileStatus, GitDiffResult } from "@agent-spaces/shared";

interface Props {
  workspaceId: string;
  branch: string | undefined;
  branches: { name: string; current: boolean }[];
  files: GitFileStatus[];
  hasFiles: boolean;
  ahead: number;
  selectedFile: string | null;
  syncing: string | null;
  clean: boolean;
  onOpenFile: (e: React.MouseEvent, path: string) => void;
  onDiscard: (e: React.MouseEvent, path: string) => void;
  onStageToggle: (e: React.MouseEvent, path: string, staged?: boolean) => void;
  onDiscardAll: () => void;
  onBranchCheckout: (branch: string) => void;
  onCommitDialogOpen: () => void;
  onAutoCommit: () => Promise<void>;
  onSyncChanges: () => void;
  onViewDiff: () => void;
  onRefreshClick: () => void;
  onContextMenu: (e: React.MouseEvent, path: string) => void;
  isVertical: boolean;
}

function FileDiffHoverCard({
  workspaceId, path, selectedFile, children, onContextMenu, onOpenFile,
}: {
  workspaceId: string;
  path: string;
  selectedFile: string | null;
  children: React.ReactNode;
  onContextMenu: (e: React.MouseEvent, path: string) => void;
  onOpenFile?: (e: React.MouseEvent, path: string) => void;
}) {
  const [diff, setDiff] = useState<GitDiffResult | null>(null);
  const [loading, setLoading] = useState(false);
  const fetched = useRef(false);

  const isImage = getMediaType(path) === 'image';

  const handleOpenChange = useCallback((isOpen: boolean) => {
    // 图片直接用文件原始 URL 预览，无需请求 diff
    if (isImage) return;
    if (isOpen && !fetched.current) {
      fetched.current = true;
      setLoading(true);
      sdk.git.diff(workspaceId, path)
        .then((data: GitDiffResult[]) => setDiff(data[0] ?? null))
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [workspaceId, path, isImage]);

  return (
    <HoverCard onOpenChange={handleOpenChange}>
      <HoverCardTrigger
        render={<div />}
        delay={300}
        closeDelay={150}
        className="block"
        onClick={(e) => onOpenFile?.(e, path)}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextMenu(e, path); }}
      >
        <div className={`group w-full text-left px-2 py-1 text-xs font-mono flex items-center gap-1.5 hover:bg-accent cursor-pointer ${selectedFile === path ? "bg-accent" : ""}`}>
          {children}
        </div>
      </HoverCardTrigger>
      <HoverCardContent side="right" sideOffset={4} align="start" className="p-0 w-[480px] max-h-[360px] overflow-auto">
        {isImage ? (
          <img
            src={`/api/workspaces/${workspaceId}/files/content?path=${encodeURIComponent(path)}&raw=true`}
            alt={path}
            className="block max-w-full max-h-[340px] object-contain"
          />
        ) : loading ? (
          <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
            <Loader2 size={14} className="animate-spin mr-1.5" />
            Loading diff...
          </div>
        ) : !diff ? (
          <div className="p-3 text-xs text-muted-foreground">No diff available</div>
        ) : diff.isBinary ? (
          <div className="p-3 text-xs text-muted-foreground">Binary file</div>
        ) : (
          <DiffViewer
            oldCode={diff.oldContent}
            newCode={diff.newContent}
            oldTitle={diff.oldContent ? "Original" : undefined}
            newTitle={diff.isNew ? path : undefined}
            className="border-0 shadow-none rounded-none text-[11px]"
          />
        )}
      </HoverCardContent>
    </HoverCard>
  );
}

export function GitChangesPanel({
  workspaceId, branch, branches, files, hasFiles, ahead, selectedFile,
  syncing, clean, onOpenFile, onDiscard, onStageToggle,
  onDiscardAll, onBranchCheckout, onCommitDialogOpen, onAutoCommit,
  onSyncChanges, onViewDiff, onRefreshClick, onContextMenu, isVertical,
}: Props) {
  const tc = useTranslations('common');
  const tChanges = useTranslations('git.changes');
  const [branchOpen, setBranchOpen] = useState(false);
  const [autoCommitting, setAutoCommitting] = useState(false);

  const handleAutoCommit = useCallback(async () => {
    if (autoCommitting) return;
    setAutoCommitting(true);
    try { await onAutoCommit(); } finally { setAutoCommitting(false); }
  }, [autoCommitting, onAutoCommit]);

  return (
    <ResizablePanel id="changes" defaultSize={isVertical ? "40%" : "25%"} minSize="15%" maxSize="60%" className="flex flex-col bg-muted/20 overflow-hidden">
      {/* Header with branch selector */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b">
        <div className="relative flex-1 min-w-0">
          <button onClick={() => setBranchOpen(!branchOpen)} className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground active:opacity-70 transition-all duration-100 cursor-pointer w-full">
            <GitBranch size={13} className="shrink-0" />
            <span className="truncate">{branch ?? "..."}</span>
            {hasFiles && <span className="text-muted-foreground">({files.length})</span>}
            <ChevronDown size={12} className="shrink-0" />
          </button>
          {branchOpen && (
            <>
              <div className="absolute left-0 top-full z-50 mt-1 w-48 bg-popover border rounded shadow-md py-0.5 max-h-60 overflow-auto">
                {branches.map((b) => (
                  <button key={b.name} onClick={() => { onBranchCheckout(b.name); setBranchOpen(false); }}
                    className={`w-full text-left px-2 py-1 text-xs hover:bg-accent active:scale-[0.98] active:bg-accent transition-all duration-100 cursor-pointer truncate ${b.current ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
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
          <button onClick={onDiscardAll} className="p-1 text-muted-foreground hover:text-destructive active:scale-90 transition-all duration-100 cursor-pointer" title={tChanges('discardAll')}>
            <Trash2 size={13} />
          </button>
        )}
        <button onClick={onViewDiff} disabled={!hasFiles} className="p-1 text-muted-foreground hover:text-foreground active:scale-90 transition-all duration-100 cursor-pointer disabled:opacity-30" title={tChanges('viewDiff')}>
          <FileDiff size={13} />
        </button>
        <button onClick={onRefreshClick} className="p-1 text-muted-foreground hover:text-foreground active:scale-90 transition-all duration-100 cursor-pointer" title={tc('refresh')}>
          <RefreshCw size={13} />
        </button>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-auto">
        {files.map((f) => (
          <FileDiffHoverCard key={f.path} workspaceId={workspaceId} path={f.path} selectedFile={selectedFile} onContextMenu={onContextMenu} onOpenFile={onOpenFile}>
            <FileIconImg name={f.path.split("/").pop() ?? f.path} />
            {f.conflicted && <AlertTriangle size={12} className="shrink-0 text-red-500" />}
            <span className="truncate flex-1 dark:!text-gray-200">{f.path}</span>
            <span className="hidden group-hover:flex md:flex items-center gap-0.5 shrink-0">
              <button
                onClick={(e) => { e.stopPropagation(); onStageToggle(e, f.path, f.staged); }}
                disabled={f.conflicted}
                className="p-0.5 rounded hover:bg-accent/80 active:scale-90 transition-all duration-100 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed dark:!text-gray-200"
                title={f.staged ? "Unstage" : "Stage"}
              >
                {f.staged ? <Minus size={13} /> : <Plus size={13} />}
              </button>
              <button onClick={(e) => { e.stopPropagation(); onDiscard(e, f.path); }} className="p-0.5 rounded hover:bg-accent/80 active:scale-90 transition-all duration-100 cursor-pointer dark:!text-gray-200" title={tChanges('discardAll')}><RotateCcw size={13} /></button>
            </span>
            <span className={`w-4 text-center font-bold shrink-0 ${statusColors[f.status]}`}>{statusLabels[f.status]}</span>
          </FileDiffHoverCard>
        ))}
        {clean && (
          <Empty className="border-0 py-6">
            <EmptyMedia variant="icon"><GitBranch /></EmptyMedia>
            <EmptyDescription>{tChanges('noChanges')}</EmptyDescription>
          </Empty>
        )}
      </div>

      {/* Action button */}
      {hasFiles ? (
        <div className="border-t p-2 flex gap-1.5">
          <button onClick={onCommitDialogOpen}
            className="flex-1 text-xs px-2 py-1 rounded bg-primary text-primary-foreground active:scale-[0.98] transition-all duration-100 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
            {tChanges('commit')}
          </button>
          <button onClick={handleAutoCommit} disabled={autoCommitting}
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent active:scale-90 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-100"
            title={tChanges('autoCommit')}>
            {autoCommitting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          </button>
        </div>
      ) : ahead > 0 ? (
        <div className="border-t p-2">
          <button onClick={onSyncChanges} disabled={syncing !== null}
            className="w-full text-xs px-2 py-1 rounded bg-primary text-primary-foreground active:scale-[0.98] transition-all duration-100 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5">
            {syncing ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            {syncing ? tChanges('syncing') : tChanges('syncChanges')}
          </button>
        </div>
      ) : null}
    </ResizablePanel>
  );
}
