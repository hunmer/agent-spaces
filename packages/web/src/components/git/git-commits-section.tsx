"use client";

import { Loader2, ArrowUp, ArrowDown, RefreshCw, Settings2, ScrollText } from "lucide-react";
import type { GitLogEntry } from "@agent-spaces/shared";
import { ResizablePanel } from "@/components/ui/resizable";
import { useTranslations } from "next-intl";

import { GitCommitLogList } from "./git-commit-log-list";
import { DiffViewer } from "./diff-viewer";

interface FileDiff {
  path: string;
  oldContent: string;
  newContent: string;
  isBinary: boolean;
  isConflict?: boolean;
}

interface Props {
  workspaceId: string;
  log: GitLogEntry[];
  loading: boolean;
  ahead: number;
  behind: number;
  syncing: string | null;
  currentHeadHash: string | undefined;
  currentBranch: string | undefined;
  selectedDiff: FileDiff | undefined;
  onPush: () => void;
  onPull: () => void;
  onRefreshClick: () => void;
  onSettingsOpen: () => void;
  onOpLogOpen: () => void;
  onSelectEntry: (entry: GitLogEntry) => void;
  onRefreshAll: () => void;
  onOpenPrompt: (title: string, label: string, placeholder: string, onSubmit: (v: string) => void) => void;
  onResolveConflict: (path: string, content: string) => void;
  isVertical: boolean;
}

export function GitCommitsSection({
  workspaceId, log, loading, ahead, behind, syncing,
  currentHeadHash, currentBranch, selectedDiff,
  onPush, onPull, onRefreshClick, onSettingsOpen, onOpLogOpen,
  onSelectEntry, onRefreshAll, onOpenPrompt, onResolveConflict, isVertical,
}: Props) {
  const t = useTranslations('git.commits');

  return (
    <ResizablePanel id="commits" defaultSize={isVertical ? "60%" : "75%"} minSize="30%" className="flex flex-col min-w-0 overflow-hidden">
      {/* Commits header */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          {loading && <Loader2 size={12} className="animate-spin text-muted-foreground shrink-0" />}
          <span className="text-xs font-medium text-muted-foreground truncate">
            {log.length > 0 ? t('titleWithCount', { count: log.length }) : t('title')}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onPush} disabled={syncing !== null}
            className="relative p-1 text-muted-foreground hover:text-foreground active:scale-90 transition-all duration-100 cursor-pointer disabled:opacity-50"
            title={ahead > 0 ? t('pushNCommits', { count: ahead }) : "Push"}>
            {syncing === "push" ? <Loader2 size={13} className="animate-spin" /> : <ArrowUp size={13} />}
            {ahead > 0 && (
              <span className="absolute -top-1 -right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-medium leading-none text-primary-foreground">{ahead}</span>
            )}
          </button>
          <button onClick={onPull} disabled={syncing !== null}
            className="relative p-1 text-muted-foreground hover:text-foreground active:scale-90 transition-all duration-100 cursor-pointer disabled:opacity-50"
            title={behind > 0 ? t('pullNCommits', { count: behind }) : "Pull"}>
            {syncing === "pull" ? <Loader2 size={13} className="animate-spin" /> : <ArrowDown size={13} />}
            {behind > 0 && (
              <span className="absolute -top-1 -right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-medium leading-none text-primary-foreground">{behind}</span>
            )}
          </button>
          <button onClick={onRefreshClick} className="p-1 text-muted-foreground hover:text-foreground active:scale-90 transition-all duration-100 cursor-pointer"><RefreshCw size={13} /></button>
          <button onClick={onSettingsOpen} className="p-1 text-muted-foreground hover:text-foreground active:scale-90 transition-all duration-100 cursor-pointer" title={t('settingsTitle')}><Settings2 size={13} /></button>
          <button onClick={onOpLogOpen} className="p-1 text-muted-foreground hover:text-foreground active:scale-90 transition-all duration-100 cursor-pointer" title={t('operationLog')}><ScrollText size={13} /></button>
        </div>
      </div>

      {/* Commit list or Diff */}
      {selectedDiff ? (
        <div className="flex-1 min-h-0">
          <DiffViewer
            oldContent={selectedDiff.oldContent}
            newContent={selectedDiff.newContent}
            path={selectedDiff.path}
            isBinary={selectedDiff.isBinary}
            mergeMode={!!selectedDiff.isConflict}
            onResolve={selectedDiff.isConflict ? (content) => onResolveConflict(selectedDiff.path, content) : undefined}
          />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <GitCommitLogList
            workspaceId={workspaceId}
            log={log}
            currentHeadHash={currentHeadHash}
            currentBranch={currentBranch}
            onSelectEntry={onSelectEntry}
            onRefreshAll={onRefreshAll}
            onOpenPrompt={onOpenPrompt}
          />
          {!loading && !log.length && (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              {t('noCommits')}
            </div>
          )}
        </div>
      )}
    </ResizablePanel>
  );
}
