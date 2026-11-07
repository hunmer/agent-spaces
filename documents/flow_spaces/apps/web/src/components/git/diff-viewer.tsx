"use client";

import { useCallback, useMemo, useState } from "react";
import { DiffViewer as DiffViewerBase } from "@/components/viewers/diff-viewer";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { Check, FileQuestion, Filter, Split } from "lucide-react";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

interface DiffViewerProps {
  oldContent: string;
  newContent: string;
  path: string;
  language?: string;
  isBinary?: boolean;
  /** 只展示修改代码部分及上下文，默认 true */
  compactDiff?: boolean;
  mergeMode?: boolean;
  onResolve?: (content: string, side: "left" | "right") => Promise<void> | void;
}

function detectLanguage(path: string): string | undefined {
  const ext = path.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript',
    js: 'javascript', jsx: 'javascript',
    json: 'json', md: 'markdown',
    css: 'css', html: 'html',
    py: 'python', rs: 'rust',
    go: 'go', yaml: 'yaml', yml: 'yaml',
  };
  return ext ? map[ext] : undefined;
}

/**
 * 基于行级 diff，提取修改行及其上下 context 行。
 * 返回截断后的 oldLines / newLines，无修改时返回 null。
 */
function computeCompactDiff(
  oldContent: string,
  newContent: string,
  contextLines: number,
): { oldLines: string[]; newLines: string[] } | null {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');

  // LCS-based diff: 标记每行是否 unchanged
  const m = oldLines.length;
  const n = newLines.length;

  // 快速路径：完全相同
  if (oldContent === newContent) return null;

  // 用简单 LCS 找 unchanged 行
  // 对大文件用 O(ND) algorithm 更高效，这里用 DP O(MN) 但限制大小
  if (m * n > 4_000_000) {
    // 文件太大，退回全量显示
    return null;
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (oldLines[i] === newLines[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  // 回溯找 matched pairs
  const oldMatched = new Set<number>();
  const newMatched = new Set<number>();
  let i = 0, j = 0;
  while (i < m && j < n) {
    if (oldLines[i] === newLines[j]) {
      oldMatched.add(i);
      newMatched.add(j);
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }

  // 标记需要展示的行（修改行 + 上下文）
  const oldShow = new Set<number>();
  const newShow = new Set<number>();

  for (let k = 0; k < m; k++) {
    if (!oldMatched.has(k)) {
      for (let c = Math.max(0, k - contextLines); c <= Math.min(m - 1, k + contextLines); c++) {
        oldShow.add(c);
      }
    }
  }
  for (let k = 0; k < n; k++) {
    if (!newMatched.has(k)) {
      for (let c = Math.max(0, k - contextLines); c <= Math.min(n - 1, k + contextLines); c++) {
        newShow.add(c);
      }
    }
  }

  // 也把 matched 行中在 show 范围内的加上（保持对齐上下文）
  // old 侧：连续 show 区间内夹着的 matched 行也需要
  // new 侧同理
  // 为了生成连续的内容（避免碎片化），合并相邻区间
  function mergeRanges(showSet: Set<number>): [number, number][] {
    const indices = Array.from(showSet).sort((a, b) => a - b);
    if (indices.length === 0) return [];
    const ranges: [number, number][] = [[indices[0], indices[0]]];
    for (let k = 1; k < indices.length; k++) {
      const last = ranges[ranges.length - 1];
      if (indices[k] <= last[1] + 1) {
        last[1] = indices[k];
      } else {
        ranges.push([indices[k], indices[k]]);
      }
    }
    return ranges;
  }

  const oldRanges = mergeRanges(oldShow);
  const newRanges = mergeRanges(newShow);

  if (oldRanges.length === 0 && newRanges.length === 0) return null;

  // 用折叠标记拼接行，保持行号可追溯
  const SEP = '···';
  function buildCompact(lines: string[], ranges: [number, number][]): string[] {
    const result: string[] = [];
    for (let r = 0; r < ranges.length; r++) {
      const [start, end] = ranges[r];
      if (r > 0 || start > 0) {
        result.push(SEP);
      }
      for (let k = start; k <= end; k++) {
        result.push(lines[k]);
      }
    }
    if (ranges.length > 0) {
      const lastEnd = ranges[ranges.length - 1][1];
      if (lastEnd < lines.length - 1) {
        result.push(SEP);
      }
    }
    return result;
  }

  return {
    oldLines: buildCompact(oldLines, oldRanges),
    newLines: buildCompact(newLines, newRanges),
  };
}

export function DiffViewer({
  oldContent,
  newContent,
  path,
  isBinary,
  compactDiff = true,
  mergeMode = false,
  onResolve,
}: DiffViewerProps) {
  const language = detectLanguage(path);
  const isMobile = useIsMobile();
  const [compact, setCompact] = useState(compactDiff);
  const [resolving, setResolving] = useState<"left" | "right" | null>(null);

  const compactResult = useMemo(() => {
    if (!compact) return null;
    return computeCompactDiff(oldContent, newContent, 10);
  }, [compact, oldContent, newContent]);

  const displayOld = compactResult ? compactResult.oldLines.join('\n') : oldContent;
  const displayNew = compactResult ? compactResult.newLines.join('\n') : newContent;

  const handleResolve = useCallback(async (side: "left" | "right") => {
    if (!onResolve || resolving) return;
    setResolving(side);
    try {
      await onResolve(side === "left" ? oldContent : newContent, side);
    } finally {
      setResolving(null);
    }
  }, [newContent, oldContent, onResolve, resolving]);

  const oldEmpty = !oldContent;
  const newEmpty = !newContent;
  const bothEmpty = oldEmpty && newEmpty;

  return (
    <div className="h-full w-full flex flex-col">
      <div className="flex items-center justify-between px-2 py-1 border-b bg-muted/30">
        <span className="text-xs text-muted-foreground font-mono truncate">
          {path}
        </span>
        <div className="flex items-center gap-1">
          {mergeMode && onResolve && (
            <>
              {!oldEmpty && (
                <button
                  onClick={() => handleResolve("left")}
                  disabled={resolving !== null}
                  className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-50"
                  title="保留左侧"
                >
                  {resolving === "left" ? <Check className="h-3 w-3" /> : <Split className="h-3 w-3 rotate-180" />}
                  保留左侧
                </button>
              )}
              {!newEmpty && (
                <button
                  onClick={() => handleResolve("right")}
                  disabled={resolving !== null}
                  className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-50"
                  title="保留右侧"
                >
                  {resolving === "right" ? <Check className="h-3 w-3" /> : <Split className="h-3 w-3" />}
                  保留右侧
                </button>
              )}
            </>
          )}
          {!bothEmpty && !isBinary && (
            <button
              onClick={() => setCompact(v => !v)}
              className={cn(
                "flex items-center gap-1 text-xs px-1.5 py-0.5 rounded transition-colors",
                compact
                  ? "text-blue-600 dark:text-blue-400 bg-blue-500/10"
                  : "text-muted-foreground hover:text-foreground"
              )}
              title={compact ? "显示全部代码" : "只看修改部分"}
            >
              <Filter className="h-3 w-3" />
              {compact ? "紧凑" : "全部"}
            </button>
          )}
        </div>
      </div>
      <div className="flex-1">
        {isBinary ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
            二进制文件，不支持预览
          </div>
        ) : bothEmpty ? (
          <Empty className="h-full border-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileQuestion />
              </EmptyMedia>
              <EmptyTitle>无内容</EmptyTitle>
              <EmptyDescription>该文件没有可显示的内容</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : oldEmpty ? (
          <DiffViewerBase
            oldCode=""
            newCode={displayNew}
            language={language}
            layout="unified"
          />
        ) : (
          <DiffViewerBase
            oldCode={displayOld}
            newCode={displayNew}
            language={language}
            layout={isMobile ? "unified" : "split"}
          />
        )}
      </div>
    </div>
  );
}
