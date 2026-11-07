"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Search, CaseSensitive, Regex, ChevronRight, ChevronDown, Loader2 } from "lucide-react";
import { FileIconImg } from "./file-icon";
import { useEditorStore } from "@/stores/editor";
import { useTranslations } from "next-intl";
import type { CodeSearchResult } from "@agent-spaces/shared";
import { cn } from "@/lib/utils";
import { sdk } from '@/lib/sdk';
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import { FileContextMenu } from "./file-context-menu";

interface SearchPanelProps {
  workspaceId: string;
}

const FILE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.css', '.html', '.py', '.go', '.rs'];

interface GroupedResults {
  [file: string]: CodeSearchResult[];
}

export function SearchPanel({ workspaceId }: SearchPanelProps) {
  const t = useTranslations('editor');
  const { jumpToPosition } = useEditorStore();
  const [query, setQuery] = useState("");
  const [isRegex, setIsRegex] = useState(false);
  const [isCaseSensitive, setIsCaseSensitive] = useState(false);
  const [extFilters, setExtFilters] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [codeResults, setCodeResults] = useState<GroupedResults>({});
  const [codeTotal, setCodeTotal] = useState(0);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setCodeResults({});
      setCodeTotal(0);
      return;
    }

    setLoading(true);
    try {
      const filePattern = extFilters.size > 0
        ? [...extFilters].map(ext => `*${ext}`).join(',')
        : undefined;
      const results: CodeSearchResult[] = await sdk.search.code(workspaceId, {
        query: q,
        regex: isRegex,
        caseSensitive: isCaseSensitive,
        filePattern,
      });

      const grouped: GroupedResults = {};
      for (const r of results) {
        if (!grouped[r.file]) grouped[r.file] = [];
        grouped[r.file].push(r);
      }

      setCodeResults(grouped);
      setCodeTotal(results.length);
      setExpandedFiles(new Set(Object.keys(grouped)));
    } catch {
      setCodeResults({});
      setCodeTotal(0);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, isRegex, isCaseSensitive, extFilters]);

  const handleInput = useCallback((value: string) => {
    setQuery(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 300);
  }, [doSearch]);

  useEffect(() => {
    if (query.trim()) doSearch(query);
  }, [doSearch, isCaseSensitive, isRegex, extFilters, query]);

  const toggleFile = (file: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(file)) next.delete(file);
      else next.add(file);
      return next;
    });
  };

  const handleResultClick = (file: string, line: number, column?: number) => {
    jumpToPosition(workspaceId, file, line, column);
  };

  const fileCount = Object.keys(codeResults).length;

  return (
    <div className="flex flex-col h-full">
      {/* Search input */}
      <div className="px-2 py-2 border-b space-y-1.5">
        <div className="flex items-center gap-1">
          <Search className="size-3.5 text-muted-foreground shrink-0" />
          <Input
            type="text"
            value={query}
            onChange={(e) => handleInput(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="h-6 bg-transparent text-xs border-0 focus-visible:ring-0 focus-visible:border-0 px-1"
            spellCheck={false}
          />
          {loading && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setIsCaseSensitive(!isCaseSensitive)}
            className={cn("p-1 rounded text-xs", isCaseSensitive ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground", "cursor-pointer")}
          >
            <CaseSensitive className="size-3" />
          </button>
          <button
            onClick={() => setIsRegex(!isRegex)}
            className={cn("p-1 rounded text-xs", isRegex ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground", "cursor-pointer")}
          >
            <Regex className="size-3" />
          </button>
          <div className="ml-1 flex items-center gap-px flex-wrap">
            {FILE_EXTENSIONS.map(ext => (
              <button
                key={ext}
                onClick={() => setExtFilters(prev => {
                  const next = new Set(prev);
                  if (next.has(ext)) next.delete(ext); else next.add(ext);
                  return next;
                })}
                className={cn(
                  "px-1 py-0 rounded text-[10px] font-mono leading-4 cursor-pointer",
                  extFilters.has(ext) ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                )}
              >
                {ext}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results summary */}
      {!loading && query.trim() && codeTotal > 0 && (
        <div className="px-2 py-1 text-[10px] text-muted-foreground border-b">
          {t('searchResults', { count: codeTotal, files: fileCount })}
        </div>
      )}

      {/* Results list */}
      <div className="flex-1 overflow-auto">
        <div className="py-1">
          {loading && codeTotal === 0 ? (
            <div className="space-y-1 px-2">
              {Array.from({ length: 3 }, (_, fi) => (
                <div key={fi}>
                  <div className="flex items-center gap-1 py-0.5">
                    <Skeleton className="size-3" />
                    <Skeleton className="size-3" />
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-6 ml-auto" />
                  </div>
                  {Array.from({ length: 3 }, (_, ri) => (
                    <div key={ri} className="flex items-start gap-2 pl-4 py-0.5">
                      <Skeleton className="h-3 w-6 shrink-0" />
                      <Skeleton className="h-3 flex-1" />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : null}
          {!loading && Object.entries(codeResults).map(([file, matches]) => (
            <div key={file}>
              <ContextMenu>
                <ContextMenuTrigger className="contents">
                  <button
                    onClick={() => toggleFile(file)}
                    className="w-full flex items-center gap-1 px-2 py-0.5 text-xs font-medium hover:bg-accent/50 cursor-pointer"
                  >
                    {expandedFiles.has(file) ? (
                      <ChevronDown className="size-3 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronRight className="size-3 text-muted-foreground shrink-0" />
                    )}
                    <FileIconImg name={file} />
                    <span className="truncate">{file}</span>
                    <span className="text-muted-foreground ml-auto shrink-0">({matches.length})</span>
                  </button>
                </ContextMenuTrigger>
                <FileContextMenu filePath={file} workspaceId={workspaceId} />
              </ContextMenu>

              {expandedFiles.has(file) && matches.map((m, i) => (
                <button
                  key={i}
                  onClick={() => handleResultClick(m.file, m.line, m.column)}
                  className="w-full flex items-start gap-2 pl-6 pr-2 py-0.5 text-xs hover:bg-accent/50 text-left font-mono cursor-pointer"
                >
                  <span className="text-muted-foreground w-8 text-right shrink-0">{m.line}</span>
                  <span className="truncate">
                    <HighlightMatch text={m.text} start={m.matchStart} length={m.matchLength} />
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>

        {!loading && query.trim() && codeTotal === 0 && (
          <div className="px-2 py-4 text-xs text-muted-foreground text-center">{t('noResults')}</div>
        )}
        {!loading && codeTotal >= 200 && (
          <div className="px-2 py-2 text-xs text-muted-foreground text-center">{t('tooManyResults')}</div>
        )}
      </div>
    </div>
  );
}

function HighlightMatch({ text, start, length }: { text: string; start: number; length: number }) {
  if (start < 0 || length <= 0 || start >= text.length) return <span>{text}</span>;
  const before = text.slice(0, start);
  const match = text.slice(start, start + length);
  const after = text.slice(start + length);
  return (
    <span>
      {before}
      <span className="bg-yellow-200/60 dark:bg-yellow-800/40 rounded-sm px-px">{match}</span>
      {after}
    </span>
  );
}
