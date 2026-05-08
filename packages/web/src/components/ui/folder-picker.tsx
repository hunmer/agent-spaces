"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from 'next-intl';
import { File, Folder, FolderOpen, ChevronRight, ArrowUp, Home, Loader2, FolderPlus, Check, X, ShieldCheck, ShieldAlert, ShieldOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface BrowseEntry {
  name: string;
  path: string;
}

interface FolderBrowseResult {
  path: string;
  parent: string | null;
  separator: string;
  home: string;
  directories: BrowseEntry[];
  files?: BrowseEntry[];
}

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [permission, setPermission] = useState<PermissionCheckResult | null>(null);
  const [checkingPermission, setCheckingPermission] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const newFolderInputRef = useRef<HTMLInputElement>(null);

  const checkPermission = useCallback(async (path: string) => {
    if (!path) {
      setPermission(null);
      return;
    }
    setCheckingPermission(true);
    try {
      const res = await fetch(`/api/folder/check-permissions?path=${encodeURIComponent(path)}`);
      if (!res.ok) {
        setPermission(null);
        return;
      }
      const data: PermissionCheckResult = await res.json();
      setPermission(data);
    } catch {
      setPermission(null);
    } finally {
      setCheckingPermission(false);
    }
  }, []);

  const browse = useCallback(async (path: string) => {
    setLoading(true);
    setError("");
    try {
      let url = `/api/folder/browse?path=${encodeURIComponent(path)}`;
      if (allowFiles) {
        url += '&files=1';
        if (fileFilter) url += `&fileFilter=${encodeURIComponent(fileFilter)}`;
      }
      const res = await fetch(url);
      if (!res.ok) throw new Error((await res.json()).error || "Failed to browse");
      const data: FolderBrowseResult = await res.json();
      setCurrentPath(data.path);
      setDirectories(data.directories);
      setFiles(data.files ?? []);
      setParentPath(data.parent);
      checkPermission(data.path);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [checkPermission, allowFiles, fileFilter]);

  useEffect(() => {
    if (open) {
      browse(value || "");
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const toggleBrowse = () => {
    if (open) {
      setOpen(false);
      setCreating(false);
      setNewFolderName("");
    } else {
      setOpen(true);
    }
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;

    const separator = currentPath.includes("/") ? "/" : "\\";
    const newPath = currentPath ? `${currentPath}${separator}${name}` : name;

    try {
      const res = await fetch("/api/folder/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: newPath }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to create folder");

      setCreating(false);
      setNewFolderName("");
      onChange(newPath);
      setCurrentPath(newPath);
      setOpen(false);
    } catch (err: any) {
      setError(err.message);
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
        <input
          className="flex-1 rounded-xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
          placeholder={placeholder}
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleInputKeyDown}
          ref={inputRef}
        />
        <button
          type="button"
          onClick={toggleBrowse}
          className={cn(
            "flex items-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm transition-colors",
            open
              ? "border-primary bg-primary/5 text-primary"
              : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          )}
        >
          <FolderOpen className="size-4" />
          Browse
        </button>
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 flex flex-col rounded-xl border border-border bg-popover shadow-lg" style={{ height: 360 }}>
          {/* Header */}
          <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
            <button
              type="button"
              onClick={() => navigateTo("")}
              className="flex size-7 items-center justify-center rounded-md hover:bg-accent transition-colors"
              title="Home"
            >
              <Home className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={goUp}
              className="flex size-7 items-center justify-center rounded-md hover:bg-accent transition-colors"
              title="Go up"
            >
              <ArrowUp className="size-3.5" />
            </button>
            <div className="flex-1 truncate rounded-md bg-muted px-2.5 py-1 text-xs text-muted-foreground font-mono">
              {currentPath}
            </div>
            <button
              type="button"
              onClick={() => { setCreating(true); setNewFolderName(""); }}
              className="flex size-7 items-center justify-center rounded-md hover:bg-accent transition-colors"
              title={t('newFolder')}
            >
              <FolderPlus className="size-3.5" />
            </button>
            {!allowFiles && (
              <button
                type="button"
                onClick={selectCurrent}
                className="rounded-lg bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                {t('select')}
              </button>
            )}
          </div>

          {/* New folder input */}
          {creating && (
            <div className="flex items-center gap-1.5 border-b border-border px-3 py-1.5">
              <FolderPlus className="size-4 text-muted-foreground shrink-0" />
              <input
                ref={newFolderInputRef}
                className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary"
                placeholder={t('folderNamePlaceholder')}
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={handleNewFolderKeyDown}
              />
              <button
                type="button"
                onClick={handleCreateFolder}
                className="flex size-6 items-center justify-center rounded-md hover:bg-accent transition-colors"
                disabled={!newFolderName.trim()}
              >
                <Check className="size-3.5 text-primary" />
              </button>
              <button
                type="button"
                onClick={() => { setCreating(false); setNewFolderName(""); }}
                className="flex size-6 items-center justify-center rounded-md hover:bg-accent transition-colors"
              >
                <X className="size-3.5 text-muted-foreground" />
              </button>
            </div>
          )}

          {/* Directory + file list */}
          <div ref={listRef} className="flex-1 overflow-y-auto p-1.5">
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
      )}
    </div>
  );
}
