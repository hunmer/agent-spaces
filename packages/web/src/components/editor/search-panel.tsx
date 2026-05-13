"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Search, CaseSensitive, Regex, FolderSearch, ChevronRight, ChevronDown, File, Loader2 } from "lucide-react";
import { useEditorStore } from "@/stores/editor";
import { useTranslations } from "next-intl";
import type { CodeSearchResult, FileSearchResult } from "@agent-spaces/shared";
import { cn } from "@/lib/utils";

interface SearchPanelProps {
  workspaceId: string;
}

interface GroupedResults {
  [file: string]: CodeSearchResult[];
}

export function SearchPanel({ workspaceId }: SearchPanelProps) {
  const t = useTranslations('editor');
  const { jumpToPosition } = useEditorStore();
  const [query, setQuery] = useState("");
  const [isRegex, setIsRegex] = useState(false);
  const [isCaseSensitive, setIsCaseSensitive] = useState(false);
  const [isFileMode, setIsFileMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [codeResults, setCodeResults] = useState<GroupedResults>({});
  const [codeTotal, setCodeTotal] = useState(0);
  const [fileResults, setFileResults] = useState<FileSearchResult[]>([]);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setCodeResults({});
      setCodeTotal(0);
      setFileResults([]);
      return;
    }

    setLoading(true);
    try {
      if (isFileMode) {
        const res = await fetch(`/api/workspaces/${workspaceId}/search/files?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setFileResults(data.results || []);
        setCodeResults({});
        setCodeTotal(0);
      } else {
        const params = new URLSearchParams({
          q,
          regex: String(isRegex),
          caseSensitive: String(isCaseSensitive),
        });
        const res = await fetch(`/api/workspaces/${workspaceId}/search/code?${params}`);
        const data = await res.json();
        const results: CodeSearchResult[] = data.results || [];

        const grouped: GroupedResults = {};
        for (const r of results) {
          if (!grouped[r.file]) grouped[r.file] = [];
          grouped[r.file].push(r);
        }

        setCodeResults(grouped);
        setCodeTotal(results.length);
        setFileResults([]);
        setExpandedFiles(new Set(Object.keys(grouped)));
      }
    } catch {
      setCodeResults({});
      setCodeTotal(0);
      setFileResults([]);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, isRegex, isCaseSensitive, isFileMode]);

  const handleInput = useCallback((value: string) => {
    setQuery(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 300);
  }, [doSearch]);

  useEffect(() => {
    if (query.trim()) doSearch(query);
  }, [isRegex, isCaseSensitive, isFileMode]);

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

  const handleFileClick = (path: string) => {
    jumpToPosition(workspaceId, path, 1);
  };

  const fileCount = Object.keys(codeResults).length;

  return (
    <div className="flex flex-col h-full">
      {/* Search input */}
      <div className="px-2 py-1.5 border-b space-y-1">
        <div className="flex items-center gap-1">
          <Search className="size-3.5 text-muted-foreground shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => handleInput(e.target.value)}
            placeholder={isFileMode ? t('searchPlaceholder').replace('内容', '名') : t('searchPlaceholder')}
            className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            spellCheck={false}
          />
          {loading && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setIsCaseSensitive(!isCaseSensitive)}
            className={cn("p-1 rounded text-xs", isCaseSensitive ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground")}
            title={t('caseSensitive')}
          >
            <CaseSensitive className="size-3" />
          </button>
          <button
            onClick={() => setIsRegex(!isRegex)}
            className={cn("p-1 rounded text-xs", isRegex ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground")}
            title={t('useRegex')}
          >
            <Regex className="size-3" />
          </button>
          <button
            onClick={() => setIsFileMode(!isFileMode)}
            className={cn("p-1 rounded text-xs", isFileMode ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground")}
            title={t('searchFiles')}
          >
            <FolderSearch className="size-3" />
          </button>
        </div>
      </div>

      {/* Results summary */}
      {!loading && query.trim() && (codeTotal > 0 || fileResults.length > 0) && (
        <div className="px-2 py-1 text-[10px] text-muted-foreground border-b">
          {isFileMode
            ? `${fileResults.length} 个文件`
            : t('searchResults').replace('{count}', String(codeTotal)).replace('{files}', String(fileCount))
          }
        </div>
      )}

      {/* Results list */}
      <div className="flex-1 overflow-auto">
        {isFileMode ? (
          <div className="py-1">
            {fileResults.map((f) => (
              <button
                key={f.path}
                onClick={() => handleFileClick(f.path)}
                className="w-full flex items-center gap-1.5 px-2 py-0.5 text-xs hover:bg-accent/50 text-left"
              >
                <File className="size-3 text-muted-foreground shrink-0" />
                <span className="truncate">{f.path}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="py-1">
            {Object.entries(codeResults).map(([file, matches]) => (
              <div key={file}>
                <button
                  onClick={() => toggleFile(file)}
                  className="w-full flex items-center gap-1 px-2 py-0.5 text-xs font-medium hover:bg-accent/50"
                >
                  {expandedFiles.has(file) ? (
                    <ChevronDown className="size-3 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="size-3 text-muted-foreground shrink-0" />
                  )}
                  <File className="size-3 text-muted-foreground shrink-0" />
                  <span className="truncate">{file}</span>
                  <span className="text-muted-foreground ml-auto shrink-0">({matches.length})</span>
                </button>

                {expandedFiles.has(file) && matches.map((m, i) => (
                  <button
                    key={i}
                    onClick={() => handleResultClick(m.file, m.line, m.column)}
                    className="w-full flex items-start gap-2 pl-6 pr-2 py-0.5 text-xs hover:bg-accent/50 text-left font-mono"
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
        )}

        {!loading && query.trim() && codeTotal === 0 && fileResults.length === 0 && (
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
