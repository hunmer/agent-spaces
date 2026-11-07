"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from 'next-intl';
import { File, Folder, FolderOpen, ChevronRight, ArrowUp, Home, Loader2, FolderPlus, Check, X, ShieldCheck, ShieldAlert, ShieldOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { sdk } from "@/lib/sdk";

interface BrowseEntry {
  name: string;
  path: string;
}

interface FolderBrowseResult {
  path: string;
  parent: string | null;
  separator: string;
  home: string;
  drives?: string[];
  directories: BrowseEntry[];
  files?: BrowseEntry[];
  filesTotal?: number;
  limit?: number;
  offset?: number;
}

const FILES_PAGE_SIZE = 200;

interface PermissionCheckResult {
  path: string;
  exists: boolean;
  readable: boolean;
  writable: boolean;
  error: string;
}

interface FolderPickerProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  allowFiles?: boolean;
  fileFilter?: string;
}

export function FolderPicker({ value, onChange, className, placeholder = "/path/to/project", allowFiles = false, fileFilter }: FolderPickerProps) {
  const [open, setOpen] = useState(false);
  const [currentPath, setCurrentPath] = useState(value || "");
  const [directories, setDirectories] = useState<BrowseEntry[]>([]);
  const [files, setFiles] = useState<BrowseEntry[]>([]);
  const t = useTranslations('folderPicker');
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [drives, setDrives] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filesTotal, setFilesTotal] = useState(0);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [permission, setPermission] = useState<PermissionCheckResult | null>(null);
  const [checkingPermission, setCheckingPermission] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const newFolderInputRef = useRef<HTMLInputElement>(null);
  // 保留当前 browse 的路径，供 loadMore 复用
  const browsePathRef = useRef("");

  const checkPermission = useCallback(async (path: string) => {
    if (!path) {
      setPermission(null);
      return;
    }
    setCheckingPermission(true);
    try {
      const data = await sdk.workspace.checkPermissions(path);
      setPermission(data as unknown as PermissionCheckResult);
    } catch {
      setPermission(null);
    } finally {
      setCheckingPermission(false);
    }
  }, []);

  const buildBrowseUrl = useCallback((path: string, offset: number) => {
    let url = `/api/folder/browse?path=${encodeURIComponent(path)}&limit=${FILES_PAGE_SIZE}&offset=${offset}`;
    if (allowFiles) {
      url += '&files=1';
      if (fileFilter) url += `&fileFilter=${encodeURIComponent(fileFilter)}`;
    }
    return url;
  }, [allowFiles, fileFilter]);

  const browse = useCallback(async (path: string) => {
    setLoading(true);
    setLoadingMore(false);
    setError("");
    browsePathRef.current = path;
    try {
      const data = await sdk.http.get<FolderBrowseResult>(buildBrowseUrl(path, 0));
      // 若期间用户已切换到其它路径，丢弃本次结果
      if (browsePathRef.current !== path) return;
      setCurrentPath(data.path);
      setDirectories(data.directories);
      setFiles(data.files ?? []);
      setFilesTotal(data.filesTotal ?? (data.files?.length ?? 0));
      setParentPath(data.parent);
      setDrives(data.drives ?? []);
      checkPermission(data.path);
    } catch (err: unknown) {
      if (browsePathRef.current !== path) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (browsePathRef.current === path) setLoading(false);
    }
  }, [checkPermission, buildBrowseUrl]);

  // 加载更多文件（滚动到底部触发）
  const loadMoreFiles = useCallback(async () => {
    const path = browsePathRef.current;
    if (!path || loading || loadingMore) return;
    if (files.length >= filesTotal) return;
    setLoadingMore(true);
    try {
      const data = await sdk.http.get<FolderBrowseResult>(buildBrowseUrl(path, files.length));
      if (browsePathRef.current !== path) return;
      setFiles(prev => [...prev, ...(data.files ?? [])]);
      setFilesTotal(data.filesTotal ?? filesTotal);
    } catch {
      // 静默失败，不打断浏览
    } finally {
      if (browsePathRef.current === path) setLoadingMore(false);
    }
  }, [loading, loadingMore, files.length, filesTotal, buildBrowseUrl]);

  const handleListScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) {
      loadMoreFiles();
    }
  }, [loadMoreFiles]);

  useEffect(() => {
    if (open) {
      browse(value || "");
    }
  }, [open, browse, value]);

  useEffect(() => {
    if (creating && newFolderInputRef.current) {
      newFolderInputRef.current.focus();
    }
  }, [creating]);

  const navigateTo = (path: string) => {
    browse(path);
  };

  const goUp = () => {
    if (parentPath) browse(parentPath);
  };

  const selectCurrent = () => {
    onChange(currentPath);
    setOpen(false);
  };

  const selectFile = (filePath: string) => {
    onChange(filePath);
    setOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      browse(value);
    }
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;

    const separator = currentPath.includes("/") ? "/" : "\\";
    const newPath = currentPath ? `${currentPath}${separator}${name}` : name;

    try {
      await sdk.workspace.createFolder(newPath);

      setCreating(false);
      setNewFolderName("");
      onChange(newPath);
      setCurrentPath(newPath);
      setOpen(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleNewFolderKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCreateFolder();
    } else if (e.key === "Escape") {
      setCreating(false);
      setNewFolderName("");
    }
  };

  const hasEntries = directories.length > 0 || files.length > 0;

  return (
    <div className={cn("relative", className)}>
      <div className="flex gap-1.5">
        <Input
          className="h-auto rounded-xl py-2.5"
          placeholder={placeholder}
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleInputKeyDown}
          ref={inputRef}
        />
        <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setCreating(false); setNewFolderName(""); } }}>
          <PopoverTrigger
            className={cn(
              "flex items-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm transition-colors",
              open
                ? "border-primary bg-primary/5 text-primary"
                : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <FolderOpen className="size-4" />
            Browse
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-[var(--radix-popover-trigger-width)] p-0 overflow-hidden rounded-xl"
            style={{ height: 360 }}
          >
            <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
            <button
              type="button"
              onClick={() => navigateTo("")}
              className="flex size-7 items-center justify-center rounded-md hover:bg-accent transition-colors cursor-pointer"
              title="Home"
            >
              <Home className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={goUp}
              className="flex size-7 items-center justify-center rounded-md hover:bg-accent transition-colors cursor-pointer"
              title="Go up"
            >
              <ArrowUp className="size-3.5" />
            </button>
            {drives.length > 1 && (
              <select
                value={drives.find(d => currentPath.toLowerCase().startsWith(d.toLowerCase())) ?? ''}
                onChange={(e) => browse(e.target.value)}
                className="h-7 shrink-0 rounded-md border border-border bg-muted px-1.5 text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
                title="Switch drive"
              >
                {drives.map(d => (
                  <option key={d} value={d}>{d.replace(/[\\/]+$/, '')}</option>
                ))}
              </select>
            )}
            <Input
              className="truncate bg-muted text-xs text-muted-foreground font-mono focus-visible:bg-background h-7"
              value={currentPath}
              onChange={(e) => setCurrentPath(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  browse(currentPath);
                }
              }}
            />
            <button
              type="button"
              onClick={() => { setCreating(true); setNewFolderName(""); }}
              className="flex size-7 items-center justify-center rounded-md hover:bg-accent transition-colors cursor-pointer"
              title={t('newFolder')}
            >
              <FolderPlus className="size-3.5" />
            </button>
            {!allowFiles && (
              <button
                type="button"
                onClick={selectCurrent}
                className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
                title={t('select')}
              >
                <Check className="size-3.5" />
              </button>
            )}
          </div>

          {/* New folder input */}
          {creating && (
            <div className="flex items-center gap-1.5 border-b border-border px-3 py-1.5">
              <FolderPlus className="size-4 text-muted-foreground shrink-0" />
              <Input
                ref={newFolderInputRef}
                className="flex-1 h-7 text-sm"
                placeholder={t('folderNamePlaceholder')}
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={handleNewFolderKeyDown}
              />
              <button
                type="button"
                onClick={handleCreateFolder}
                className="flex size-6 items-center justify-center rounded-md hover:bg-accent transition-colors cursor-pointer"
                disabled={!newFolderName.trim()}
              >
                <Check className="size-3.5 text-primary" />
              </button>
              <button
                type="button"
                onClick={() => { setCreating(false); setNewFolderName(""); }}
                className="flex size-6 items-center justify-center rounded-md hover:bg-accent transition-colors cursor-pointer"
              >
                <X className="size-3.5 text-muted-foreground" />
              </button>
            </div>
          )}

          {/* Directory + file list */}
          <div ref={listRef} onScroll={handleListScroll} className="flex-1 overflow-y-auto p-1.5">
            {loading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="size-4 animate-spin mr-2" />
                Loading...
              </div>
            ) : error ? (
              <div className="px-3 py-8 text-center text-xs text-destructive">{error}</div>
            ) : !hasEntries ? (
              <div className="px-3 py-8 text-center text-xs text-muted-foreground">No subdirectories</div>
            ) : (
              <>
                {directories.map((dir) => (
                  <button
                    key={dir.path}
                    type="button"
                    onClick={() => navigateTo(dir.path)}
                    onDoubleClick={() => {
                      onChange(dir.path);
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm hover:bg-accent transition-colors text-left"
                  >
                    <Folder className="size-4 text-muted-foreground shrink-0" />
                    <span className="flex-1 truncate">{dir.name}</span>
                    <ChevronRight className="size-3 text-muted-foreground shrink-0" />
                  </button>
                ))}
                {files.map((file) => (
                  <button
                    key={file.path}
                    type="button"
                    onClick={() => selectFile(file.path)}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm hover:bg-accent transition-colors text-left"
                  >
                    <File className="size-4 text-muted-foreground shrink-0" />
                    <span className="flex-1 truncate font-mono text-xs">{file.name}</span>
                  </button>
                ))}
                {loadingMore ? (
                  <div className="flex items-center justify-center py-3 text-xs text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin mr-2" />
                    Loading more...
                  </div>
                ) : files.length > 0 && files.length < filesTotal ? (
                  <div className="py-2 text-center text-xs text-muted-foreground">
                    {files.length} / {filesTotal}
                  </div>
                ) : null}
              </>
            )}
          </div>

          {/* Permission check bar */}
          <div className="border-t border-border px-3 py-1.5 flex items-center gap-2 text-xs">
            {checkingPermission ? (
              <>
                <Loader2 className="size-3 animate-spin text-muted-foreground" />
                <span className="text-muted-foreground">Checking permissions...</span>
              </>
            ) : permission ? (
              <>
                {permission.readable && permission.writable ? (
                  <>
                    <ShieldCheck className="size-3.5 text-green-500" />
                    <span className="text-green-600 dark:text-green-400">Read/Write</span>
                  </>
                ) : permission.readable && !permission.writable ? (
                  <>
                    <ShieldAlert className="size-3.5 text-amber-500" />
                    <span className="text-amber-600 dark:text-amber-400">Read-only — files cannot be written here</span>
                  </>
                ) : (
                  <>
                    <ShieldOff className="size-3.5 text-destructive" />
                    <span className="text-destructive">{permission.error || "No access"}</span>
                  </>
                )}
              </>
            ) : (
              <span className="text-muted-foreground">{t('selectDirectory')}</span>
            )}
            </div>
          </div>
        </PopoverContent>
      </Popover>
      </div>
    </div>
  );
}
