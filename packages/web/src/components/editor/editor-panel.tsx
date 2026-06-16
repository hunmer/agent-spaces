"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileTree, FileTreeNodes } from "./file-tree";
import { SearchPanel } from "./search-panel";
import { ImportFileDialog } from "./import-file-dialog";
import { useEditorStore } from "@/stores/editor";
import type { FileNode, FileSearchResult } from "@agent-spaces/shared";
import { RefreshCw, Ellipsis, Upload, Copy, FolderPlus, FilePlus, Search, X } from "lucide-react";
import { FileIconImg } from "./file-icon";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import { FileContextMenu } from "./file-context-menu";
import { useTranslations } from 'next-intl';
import { toast } from "sonner";
import { cn, copyToClipboard } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FolderPicker } from "@/components/ui/folder-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspaceStore } from "@/stores/workspace";
import { useMobilePanelStore } from "@/stores/mobile-panel";
import { sdk } from '@/lib/sdk';

type FilePanelApi = {
  tree: FileNode[];
  treeLoading: boolean;
  loadingDirs: Set<string>;
  openFiles: { path: string }[];
  revealPath?: string | null;
  loadTree: () => Promise<void>;
  loadDirectory: (dirPath: string) => Promise<void>;
  openFile: (path: string) => Promise<void> | void;
  clearRevealPath?: () => void;
  searchFiles?: (query: string) => Promise<FileSearchResult[]>;
  saveEmptyFile: (path: string) => Promise<void>;
  deletePath: (path: string) => Promise<void>;
  renamePath: (oldPath: string, newPath: string) => Promise<void>;
  copyPath: (srcPath: string, destPath: string) => Promise<void>;
};

function filterTreeByName(nodes: FileNode[], query: string): FileNode[] {
  if (!query) return nodes;
  const lower = query.toLowerCase();
  const result: FileNode[] = [];
  for (const node of nodes) {
    if (node.type === 'directory') {
      const filteredChildren = node.children ? filterTreeByName(node.children, query) : [];
      if (filteredChildren.length > 0) {
        result.push({ ...node, children: filteredChildren });
      }
    } else if (node.name.toLowerCase().includes(lower)) {
      result.push(node);
    }
  }
  return result;
}

function collectAllDirPaths(nodes: FileNode[]): string[] {
  const paths: string[] = [];
  const walk = (list: FileNode[]) => {
    for (const node of list) {
      if (node.type === 'directory') {
        paths.push(node.path);
        if (node.children) walk(node.children);
      }
    }
  };
  walk(nodes);
  return paths;
}

function buildFileSizeMap(nodes: FileNode[]): Record<string, number> {
  const map: Record<string, number> = {};
  const walk = (list: FileNode[]) => {
    for (const node of list) {
      if (node.type === 'file' && node.size != null) {
        map[node.path] = node.size;
      }
      if (node.children) walk(node.children);
    }
  };
  walk(nodes);
  return map;
}

function collectAllFiles(nodes: FileNode[]): FileNode[] {
  const files: FileNode[] = [];
  const walk = (list: FileNode[]) => {
    for (const node of list) {
      if (node.type === 'file') files.push(node);
      if (node.children) walk(node.children);
    }
  };
  walk(nodes);
  return files;
}

function toSingleLevelTree(files: FileNode[]): FileNode[] {
  const dirMap = new Map<string, FileNode[]>();
  const rootFiles: FileNode[] = [];
  for (const f of files) {
    const idx = f.path.indexOf('/');
    if (idx === -1) {
      rootFiles.push(f);
    } else {
      const dir = f.path.substring(0, idx);
      let list = dirMap.get(dir);
      if (!list) { list = []; dirMap.set(dir, list); }
      list.push(f);
    }
  }
  const result: FileNode[] = [...rootFiles];
  for (const [dirPath, children] of dirMap) {
    result.push({ name: dirPath, path: dirPath, type: 'directory', children });
  }
  return result;
}

const STORAGE_KEY_PREFIX = 'agent-spaces:file-tree-expanded:';
const ROOT_DROP_TARGET = '__file_tree_root_drop_target__';
const FILE_TREE_DRAG_MIME = 'application/x-agent-spaces-file-path';

function loadExpandedPaths(workspaceId: string): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + workspaceId);
    if (raw) return new Set(JSON.parse(raw));
  } catch {}
  return new Set();
}

function saveExpandedPaths(workspaceId: string, paths: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY_PREFIX + workspaceId, JSON.stringify([...paths]));
  } catch {}
}

function FlatFileTree({ files, selectedPath, onSelect, workspaceId, boundDir, emptyText }: {
  files: FileNode[];
  selectedPath?: string;
  onSelect: (path: string) => void;
  workspaceId?: string;
  boundDir: string;
  emptyText: string;
}) {
  const tree = useMemo(() => toSingleLevelTree(files), [files]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(tree.filter(n => n.type === 'directory').map(n => n.path)));
  if (files.length === 0) {
    return <div className="px-2 py-4 text-xs text-muted-foreground text-center">{emptyText}</div>;
  }
  return (
    <FileTree
      expanded={expanded}
      onExpandedChange={setExpanded}
      selectedPath={selectedPath}
      onFileSelect={onSelect}
      workspaceId={workspaceId}
      boundDir={boundDir}
    >
      <FileTreeNodes nodes={tree} />
    </FileTree>
  );
}

export interface EditorPanelProps {
  workspaceId?: string;
  storageKey?: string;
  boundDir?: string;
  variant?: 'workspace' | 'project';
  api?: FilePanelApi;
  showSearchPanel?: boolean;
  showImport?: boolean;
}

export function CommonEditorPanel({ workspaceId, storageKey, boundDir: providedBoundDir, variant = 'workspace', api, showSearchPanel = true, showImport = true }: EditorPanelProps) {
  const editorStore = useEditorStore();
  const workspace = useWorkspaceStore((s) => workspaceId ? s.workspaces.find((w) => w.id === workspaceId) : undefined);
  const panelKey = storageKey ?? workspaceId ?? 'default';
  const tree = api?.tree ?? editorStore.tree;
  const treeLoading = api?.treeLoading ?? editorStore.treeLoading;
  const loadTree = useCallback(async () => {
    if (api?.loadTree) {
      await api.loadTree();
    } else if (workspaceId) {
      await editorStore.loadTree(workspaceId);
    }
  }, [api, editorStore, workspaceId]);
  const loadDirectory = useCallback(async (dirPath: string) => {
    if (api?.loadDirectory) {
      await api.loadDirectory(dirPath);
    } else if (workspaceId) {
      await editorStore.loadDirectory(workspaceId, dirPath);
    }
  }, [api, editorStore, workspaceId]);
  const openFile = useCallback(async (path: string) => {
    if (api?.openFile) {
      await api.openFile(path);
    } else if (workspaceId) {
      await editorStore.openFile(workspaceId, path);
    }
  }, [api, editorStore, workspaceId]);
  const openFiles = api?.openFiles ?? editorStore.openFiles;
  const revealPath = api?.revealPath ?? editorStore.revealPath;
  const clearRevealPath = api?.clearRevealPath ?? editorStore.clearRevealPath;
  const loadingDirs = api?.loadingDirs ?? editorStore.loadingDirs;
  const boundDir = providedBoundDir ?? workspace?.boundDirs?.[0] ?? '';
  const t = useTranslations('editor');
  const tc = useTranslations('common');
  const [selectedPath, setSelectedPath] = useState<string>();
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => loadExpandedPaths(panelKey));
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importTargetPath, setImportTargetPath] = useState('');
  const [nameDialog, setNameDialog] = useState<{ open: boolean; mode: 'file' | 'folder'; targetDir: string; value: string }>({ open: false, mode: 'file', targetDir: '', value: '' });
  const [renameDialog, setRenameDialog] = useState<{ open: boolean; path: string; value: string }>({ open: false, path: '', value: '' });
  const [moveDialog, setMoveDialog] = useState<{ open: boolean; path: string; value: string; mode: 'move' | 'copy' }>({ open: false, path: '', value: '', mode: 'move' });
  const [fileSearch, setFileSearch] = useState('');
  const [globalFileResults, setGlobalFileResults] = useState<FileSearchResult[]>([]);
  const [globalFileLoading, setGlobalFileLoading] = useState(false);
  const [draggedPath, setDraggedPath] = useState<string | null>(null);
  const [draggedOverPath, setDraggedOverPath] = useState<string | null>(null);
  const draggedPathRef = useRef<string | null>(null);
  const fileSearchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [bottomTab, setBottomTab] = useState<'all' | 'recent' | 'open'>('all');
  const [sidebarTab, setSidebarTab] = useState('files');
  const filteredTree = useMemo(() => filterTreeByName(tree, fileSearch), [tree, fileSearch]);
  const fileSizeMap = useMemo(() => buildFileSizeMap(tree), [tree]);

  // 有搜索词时走后端全局搜索，否则清空
  useEffect(() => {
    clearTimeout(fileSearchTimer.current);
    if (!fileSearch.trim() || (!api?.searchFiles && !workspaceId)) {
      setGlobalFileResults([]);
      return;
    }
    fileSearchTimer.current = setTimeout(async () => {
      setGlobalFileLoading(true);
      try {
        const results = api?.searchFiles
          ? await api.searchFiles(fileSearch.trim())
          : workspaceId
            ? await sdk.search.files(workspaceId, fileSearch.trim())
            : [];
        setGlobalFileResults(results || []);
      } catch {
        setGlobalFileResults([]);
      } finally {
        setGlobalFileLoading(false);
      }
    }, 300);
    return () => clearTimeout(fileSearchTimer.current);
  }, [api, fileSearch, workspaceId]);

  const displayTree = fileSearch.trim() && globalFileResults.length > 0
    ? globalFileResults.filter(r => r.type === 'file').map(r => ({ path: r.path, name: r.name, type: 'file' as const }))
    : [];
  const recentFiles = useMemo(() => {
    const files = collectAllFiles(tree).filter(f => f.modifiedAt);
    files.sort((a, b) => (b.modifiedAt || '').localeCompare(a.modifiedAt || ''));
    return files.slice(0, 50);
  }, [tree]);
  const openedFileNodes = useMemo(() => {
    const pathSet = new Set(openFiles.map(f => f.path));
    return [...collectAllFiles(tree).filter(f => pathSet.has(f.path))].reverse();
  }, [tree, openFiles]);

  // 搜索时自动展开所有目录
  const effectiveExpanded = useMemo(() => {
    if (!fileSearch) return expandedPaths;
    return new Set(collectAllDirPaths(filteredTree));
  }, [fileSearch, filteredTree, expandedPaths]);

  const handleNameConfirm = useCallback(() => {
    const { mode, targetDir, value } = nameDialog;
    if (!value.trim()) return;
    const name = value.trim();
    const relPath = targetDir ? targetDir + '/' + name : name;
    const fullPath = mode === 'folder' ? relPath + '/.gitkeep' : relPath;
    const save = api?.saveEmptyFile ?? (async (path: string) => {
      if (workspaceId) await sdk.editor.save(workspaceId, path, '');
    });
    save(fullPath).then(() => { loadTree(); setNameDialog((p) => ({ ...p, open: false })); });
  }, [api, nameDialog, loadTree, workspaceId]);

  const openNameDialog = useCallback((mode: 'file' | 'folder', targetDir: string) => {
    setNameDialog({ open: true, mode, targetDir, value: '' });
  }, []);

  useEffect(() => {
    const saved = loadExpandedPaths(panelKey);
    setExpandedPaths(saved);
    loadTree().then(() => {
      // Reload children for previously expanded directories
      for (const dir of saved) {
        loadDirectory(dir);
      }
    });
  }, [panelKey, loadTree, loadDirectory]);

  const handleExpandedChange = useCallback((newExpanded: Set<string>) => {
    setExpandedPaths(newExpanded);
    saveExpandedPaths(panelKey, newExpanded);
  }, [panelKey]);

  const handleDelete = async (path: string) => {
    if (api?.deletePath) {
      await api.deletePath(path);
    } else if (workspaceId) {
      await sdk.editor.deleteFile(workspaceId, path);
    }
    loadTree();
  };

  const handleRename = useCallback((path: string) => {
    const name = path.split('/').pop() || '';
    setRenameDialog({ open: true, path, value: name });
  }, []);

  const handleRenameConfirm = useCallback(async () => {
    const { path: oldPath, value } = renameDialog;
    if (!value.trim() || value.trim() === oldPath.split('/').pop()) { setRenameDialog(p => ({ ...p, open: false })); return; }
    const dir = oldPath.substring(0, oldPath.lastIndexOf('/'));
    const newPath = dir ? `${dir}/${value.trim()}` : value.trim();
    if (api?.renamePath) {
      await api.renamePath(oldPath, newPath);
    } else if (workspaceId) {
      await sdk.editor.rename(workspaceId, oldPath, newPath);
    }
    loadTree(); setRenameDialog(p => ({ ...p, open: false }));
  }, [api, renameDialog, loadTree, workspaceId]);

  const handleMove = useCallback((path: string) => {
    const dir = path.substring(0, path.lastIndexOf('/'));
    const absDir = dir ? boundDir.replace(/\/+$/, '') + '/' + dir : boundDir.replace(/\/+$/, '');
    setMoveDialog({ open: true, path, value: absDir, mode: 'move' });
  }, [boundDir]);

  const handleCopy = useCallback((path: string) => {
    const dir = path.substring(0, path.lastIndexOf('/'));
    const absDir = dir ? boundDir.replace(/\/+$/, '') + '/' + dir : boundDir.replace(/\/+$/, '');
    setMoveDialog({ open: true, path, value: absDir, mode: 'copy' });
  }, [boundDir]);

  const handleMoveConfirm = useCallback(async () => {
    const { path: srcPath, value, mode } = moveDialog;
    if (!value.trim()) return;
    const base = boundDir.replace(/\/+$/, '');
    let destRelPath = value.trim();
    if (destRelPath.startsWith(base)) {
      destRelPath = destRelPath.slice(base.length).replace(/^\/+/, '');
    }
    const name = srcPath.split('/').pop() || '';
    const newRelPath = destRelPath ? `${destRelPath}/${name}` : name;
    if (mode === 'copy') {
      if (api?.copyPath) {
        await api.copyPath(srcPath, newRelPath);
      } else if (workspaceId) {
        await sdk.editor.copy(workspaceId, srcPath, newRelPath);
      }
    } else {
      if (api?.renamePath) {
        await api.renamePath(srcPath, newRelPath);
      } else if (workspaceId) {
        await sdk.editor.rename(workspaceId, srcPath, newRelPath);
      }
    }
    loadTree(); setMoveDialog(p => ({ ...p, open: false }));
  }, [api, moveDialog, loadTree, boundDir, workspaceId]);

  const findTreeNode = useCallback((path: string): FileNode | undefined => {
    const walk = (nodes: FileNode[]): FileNode | undefined => {
      for (const node of nodes) {
        if (node.path === path) return node;
        if (node.children) {
          const found = walk(node.children);
          if (found) return found;
        }
      }
      return undefined;
    };
    return walk(tree);
  }, [tree]);

  const getParentDir = useCallback((path: string) => {
    const index = path.lastIndexOf('/');
    return index > -1 ? path.slice(0, index) : '';
  }, []);

  const getDragSourcePath = useCallback((event: React.DragEvent<HTMLDivElement>) => (
    draggedPathRef.current
    || draggedPath
    || event.dataTransfer.getData(FILE_TREE_DRAG_MIME)
    || event.dataTransfer.getData('text/plain')
  ), [draggedPath]);

  const getDropTargetDir = useCallback((targetPath: string) => {
    const targetNode = findTreeNode(targetPath);
    return targetNode?.type === 'directory' ? targetPath : getParentDir(targetPath);
  }, [findTreeNode, getParentDir]);

  const reloadExpandedTree = useCallback(async () => {
    await loadTree();
    for (const dir of expandedPaths) {
      await loadDirectory(dir);
    }
  }, [expandedPaths, loadDirectory, loadTree]);

  const movePathToDirectory = useCallback(async (srcPath: string, targetDir: string) => {
    const name = srcPath.split('/').pop() || '';
    const newPath = targetDir ? `${targetDir}/${name}` : name;
    if (!name || newPath === srcPath || getParentDir(srcPath) === targetDir) return;
    if (targetDir === srcPath || targetDir.startsWith(`${srcPath}/`)) return;

    try {
      if (api?.renamePath) {
        await api.renamePath(srcPath, newPath);
      } else if (workspaceId) {
        await sdk.editor.rename(workspaceId, srcPath, newPath);
      }
    } catch {
      toast.error('移动失败');
      return;
    }

    if (selectedPath === srcPath) setSelectedPath(newPath);
    await reloadExpandedTree();
  }, [api, getParentDir, reloadExpandedTree, selectedPath, workspaceId]);

  const handleTreeDragStart = useCallback((event: React.DragEvent<HTMLDivElement>, path: string) => {
    draggedPathRef.current = path;
    setDraggedPath(path);
    event.dataTransfer.setData(FILE_TREE_DRAG_MIME, path);
    event.dataTransfer.setData('text/plain', path);
    event.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleTreeDragEnd = useCallback(() => {
    draggedPathRef.current = null;
    setDraggedPath(null);
    setDraggedOverPath(null);
  }, []);

  const handleTreeDragOver = useCallback((event: React.DragEvent<HTMLDivElement>, targetPath: string) => {
    event.preventDefault();
    const sourcePath = getDragSourcePath(event);
    if (!sourcePath || sourcePath === targetPath) return;

    const targetDir = getDropTargetDir(targetPath);
    if (targetDir === sourcePath || targetDir.startsWith(`${sourcePath}/`)) {
      setDraggedOverPath(null);
      event.dataTransfer.dropEffect = 'none';
      return;
    }

    setDraggedOverPath(targetPath);
    event.dataTransfer.dropEffect = 'move';
  }, [getDragSourcePath, getDropTargetDir]);

  const handleTreeDragLeave = useCallback(() => {
    setDraggedOverPath(null);
  }, []);

  const handleTreeDrop = useCallback(async (event: React.DragEvent<HTMLDivElement>, targetPath: string) => {
    event.preventDefault();
    const sourcePath = getDragSourcePath(event);
    setDraggedOverPath(null);
    setDraggedPath(null);
    draggedPathRef.current = null;
    if (!sourcePath || sourcePath === targetPath) return;

    const targetDir = getDropTargetDir(targetPath);
    await movePathToDirectory(sourcePath, targetDir);
  }, [getDragSourcePath, getDropTargetDir, movePathToDirectory]);

  const handleTreeRootDragOver = useCallback((event: React.DragEvent<HTMLDivElement>, targetId: string) => {
    event.preventDefault();
    event.stopPropagation();
    setDraggedOverPath(targetId);
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const handleTreeRootDrop = useCallback(async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const sourcePath = getDragSourcePath(event);
    setDraggedOverPath(null);
    setDraggedPath(null);
    draggedPathRef.current = null;
    if (!sourcePath) return;
    await movePathToDirectory(sourcePath, '');
  }, [getDragSourcePath, movePathToDirectory]);

  const handleTreeRootDragLeave = useCallback((_event: React.DragEvent<HTMLDivElement>, targetId: string) => {
    setDraggedOverPath((path) => path === targetId ? null : path);
  }, []);

  useEffect(() => {
    if (!revealPath) return;
    const parts = revealPath.split('/').filter(Boolean);
    const dirsToExpand: string[] = [];
    let current = '';
    for (let i = 0; i < parts.length - 1; i++) {
      current = current ? `${current}/${parts[i]}` : parts[i];
      dirsToExpand.push(current);
    }
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      for (const d of dirsToExpand) next.add(d);
      saveExpandedPaths(panelKey, next);
      return next;
    });
    // Load each parent directory to ensure children are available
    (async () => {
      if (revealPath === '__search_panel__') {
        setSidebarTab('search');
        clearRevealPath();
        return;
      }
      for (const d of dirsToExpand) {
        await loadDirectory(d);
      }
      setSelectedPath(revealPath);
      clearRevealPath();
    })();
  }, [revealPath, panelKey, loadDirectory, clearRevealPath]);

  return (
    <div className="relative flex flex-col h-full">
      <Tabs value={sidebarTab} onValueChange={setSidebarTab} className="flex flex-col h-full">
        <TabsList className="w-full h-8 shrink-0 rounded-none border-b bg-transparent p-0">
          <TabsTrigger value="files" className="flex-1 gap-1 rounded-none border border-b-2 border-transparent text-xs text-muted-foreground data-[active]:border-b-primary data-[active]:bg-transparent data-[active]:text-foreground data-[active]:shadow-none">
            {t('explorer')}
          </TabsTrigger>
          <TabsTrigger value="search" className="flex-1 gap-1 rounded-none border border-b-2 border-transparent text-xs text-muted-foreground data-[active]:border-b-primary data-[active]:bg-transparent data-[active]:text-foreground data-[active]:shadow-none">
            {t('search')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="files" className="flex flex-col flex-1 min-h-0 mt-0">
          <div className="flex items-center gap-1 px-2 py-1 border-b shrink-0">
            <div className="flex items-center flex-1 gap-1 px-1.5 py-0.5 rounded bg-muted/50">
              <Search className="size-3 text-muted-foreground shrink-0" />
              <Input
                type="text"
                value={fileSearch}
                onChange={(e) => setFileSearch(e.target.value)}
                placeholder={t('searchFiles') + '...'}
                className="h-6 bg-transparent text-xs border-0 focus-visible:ring-0 focus-visible:border-0 px-1"
                spellCheck={false}
              />
              {fileSearch && (
                <button onClick={() => setFileSearch('')} className="p-0.5 hover:bg-accent rounded cursor-pointer">
                  <X className="size-3 text-muted-foreground" />
                </button>
              )}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger className="p-0.5 hover:bg-accent rounded">
                <Ellipsis className="size-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {showImport && workspaceId ? (
                  <DropdownMenuItem onClick={() => { setImportTargetPath(''); setImportDialogOpen(true); }}>
                    <Upload className="size-4" />
                    {t('importFile')}
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onClick={() => {
                  const relPath = selectedPath || '';
                  const absPath = relPath ? (boundDir ? boundDir.replace(/\/+$/, '') + '/' + relPath : relPath) : boundDir;
                  copyToClipboard(absPath);
                  toast.success(t('copied'));
                }}>
                  <Copy className="size-4" />
                  {t('copyPath')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openNameDialog('file', '')}>
                  <FilePlus className="size-4" />
                  {t('newFile')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openNameDialog('folder', '')}>
                  <FolderPlus className="size-4" />
                  {t('newFolder')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              onClick={() => loadTree()}
              className="p-0.5 hover:bg-accent rounded cursor-pointer"
              disabled={treeLoading}
            >
              <RefreshCw className={`size-3 ${treeLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-auto py-1">
            {bottomTab === 'all' ? (
              fileSearch.trim() ? (
                <>
                  {globalFileLoading && globalFileResults.length === 0 ? (
                    <div className="space-y-0.5 px-2">
                      {Array.from({ length: 6 }, (_, i) => (
                        <div key={i} className="flex items-center gap-1 px-2 py-[3px]">
                          <Skeleton className="size-4 shrink-0" />
                          <Skeleton className="h-4 flex-1" />
                        </div>
                      ))}
                    </div>
                  ) : globalFileResults.length === 0 ? (
                    <div className="px-2 py-4 text-xs text-muted-foreground text-center">{t('noResults')}</div>
                  ) : (
                    <>
                      <div className="px-2 py-0.5 text-[10px] text-muted-foreground">
                        {t('searchResults', { count: globalFileResults.length, files: globalFileResults.length })}
                      </div>
                      {displayTree.map(node => (
                        <ContextMenu key={node.path}>
                          <ContextMenuTrigger className="contents">
                            <button
                              onClick={() => { setSelectedPath(node.path); openFile(node.path); useMobilePanelStore.getState().setActivePanel('code-editor'); }}
                              className={`w-full flex items-center gap-1.5 px-3 py-[3px] text-xs hover:bg-accent/50 transition-colors ${selectedPath === node.path ? 'bg-accent' : ''}`}
                            >
                              <FileIconImg name={node.name} />
                              <span className="truncate">{node.name}</span>
                              {node.path.includes('/') && (
                                <span className="ml-auto text-[10px] text-muted-foreground truncate max-w-[100px]">
                                  {node.path.replace(/\/[^/]*$/, '')}
                                </span>
                              )}
                            </button>
                          </ContextMenuTrigger>
                          {workspaceId ? <FileContextMenu filePath={node.path} workspaceId={workspaceId} boundDir={boundDir} /> : null}
                        </ContextMenu>
                      ))}
                    </>
                  )}
                </>
              ) : (
                <>
                  {treeLoading && tree.length === 0 && (
                    <div className="space-y-0.5 px-2">
                      {Array.from({ length: 8 }, (_, i) => (
                        <div key={i} className="flex items-center gap-1 px-2 py-[3px]">
                          <Skeleton className="size-4 shrink-0" />
                          <Skeleton className="h-4 flex-1" />
                        </div>
                      ))}
                    </div>
                  )}
                  {tree.length === 0 && !treeLoading && (
                    <div className="px-2 py-4 text-xs text-muted-foreground text-center">
                      {t('noFiles')}
                    </div>
                  )}
                  {tree.length > 0 && (
                    <FileTree
                      expanded={effectiveExpanded}
                      onExpandedChange={handleExpandedChange}
                      selectedPath={selectedPath}
                      onFileSelect={(path) => {
                        setSelectedPath(path);
                        openFile(path);
                        useMobilePanelStore.getState().setActivePanel('code-editor');
                      }}
                      workspaceId={workspaceId}
                      variant={variant}
                      onDelete={handleDelete}
                      onImport={showImport && workspaceId ? (targetPath) => { setImportTargetPath(targetPath); setImportDialogOpen(true); } : undefined}
                      onCopyPath={(path) => { copyToClipboard(boundDir ? boundDir.replace(/\/+$/, '') + '/' + path : path); toast.success(t('copied')); }}
                      onCreateFile={(targetDir) => openNameDialog('file', targetDir)}
                      onCreateFolder={(targetDir) => openNameDialog('folder', targetDir)}
                      onRename={handleRename}
                      onMove={handleMove}
                      onCopyItem={handleCopy}
                      onLoadDirectory={loadDirectory}
                      loadingDirs={loadingDirs}
                      boundDir={boundDir}
                      fileSizeMap={fileSizeMap}
                      refreshInterval={5000}
                      draggedOverPath={draggedOverPath}
                      onItemDragStart={handleTreeDragStart}
                      onItemDragOver={handleTreeDragOver}
                      onItemDragLeave={handleTreeDragLeave}
                      onItemDrop={handleTreeDrop}
                      onItemDragEnd={handleTreeDragEnd}
                      rootDropTargetId={ROOT_DROP_TARGET}
                      onRootDropLineDragOver={handleTreeRootDragOver}
                      onRootDropLineDragEnter={handleTreeRootDragOver}
                      onRootDropLineDragLeave={handleTreeRootDragLeave}
                      onRootDropLineDrop={handleTreeRootDrop}
                    >
                      <FileTreeNodes nodes={filteredTree} />
                    </FileTree>
                  )}
                </>
              )
            ) : (
              <FlatFileTree
                files={(() => {
                  const files = bottomTab === 'recent' ? recentFiles : openedFileNodes;
                  const lower = fileSearch.toLowerCase();
                  return fileSearch ? files.filter(f => f.name.toLowerCase().includes(lower)) : files;
                })()}
                selectedPath={selectedPath}
                onSelect={(path) => { setSelectedPath(path); openFile(path); useMobilePanelStore.getState().setActivePanel('code-editor'); }}
                workspaceId={workspaceId}
                boundDir={boundDir}
                emptyText={t('noFiles')}
              />
            )}
          </div>
          <div className="shrink-0 border-t flex h-7">
            {([['all', 'allFiles'], ['recent', 'recentlyAdded'], ['open', 'recentlyOpened']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setBottomTab(key as 'all' | 'recent' | 'open')}
                className={`flex-1 text-[11px] border-b-2 transition-colors ${
                  bottomTab === key
                    ? 'border-b-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {t(label)}
              </button>
            ))}
          </div>
        </TabsContent>

      </Tabs>
      {showSearchPanel && workspaceId ? (
        <div className={cn("absolute inset-x-0 bottom-0 top-8 z-10", sidebarTab !== 'search' && "hidden")}>
          <SearchPanel workspaceId={workspaceId} />
        </div>
      ) : null}
      {showImport && workspaceId ? (
        <ImportFileDialog
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
          workspaceId={workspaceId}
          targetPath={importTargetPath}
          onImported={() => loadTree()}
        />
      ) : null}
      <Dialog open={nameDialog.open} onOpenChange={(v) => setNameDialog((p) => ({ ...p, open: v }))}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{nameDialog.mode === 'file' ? t('newFile') : t('newFolder')}</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            placeholder={nameDialog.mode === 'file' ? t('newFileName') : t('newFolderName')}
            value={nameDialog.value}
            onChange={(e) => setNameDialog((p) => ({ ...p, value: e.target.value }))}
            onKeyDown={(e) => e.key === 'Enter' && handleNameConfirm()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNameDialog((p) => ({ ...p, open: false }))}>{tc('cancel')}</Button>
            <Button onClick={handleNameConfirm} disabled={!nameDialog.value.trim()}>{tc('create')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={renameDialog.open} onOpenChange={(v) => setRenameDialog((p) => ({ ...p, open: v }))}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{t('renameTitle')}</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            placeholder={t('renamePlaceholder')}
            value={renameDialog.value}
            onChange={(e) => setRenameDialog((p) => ({ ...p, value: e.target.value }))}
            onKeyDown={(e) => e.key === 'Enter' && handleRenameConfirm()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialog((p) => ({ ...p, open: false }))}>{tc('cancel')}</Button>
            <Button onClick={handleRenameConfirm} disabled={!renameDialog.value.trim()}>{t('rename')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={moveDialog.open} onOpenChange={(v) => setMoveDialog((p) => ({ ...p, open: v }))}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{moveDialog.mode === 'move' ? t('moveTitle') : t('copyTitle')}</DialogTitle>
          </DialogHeader>
          <FolderPicker
            value={moveDialog.value}
            onChange={(v) => setMoveDialog((p) => ({ ...p, value: v }))}
            placeholder={moveDialog.mode === 'move' ? t('movePlaceholder') : t('copyPlaceholder')}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveDialog((p) => ({ ...p, open: false }))}>{tc('cancel')}</Button>
            <Button onClick={handleMoveConfirm} disabled={!moveDialog.value.trim()}>{moveDialog.mode === 'move' ? t('move') : t('copyFile')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function EditorPanel({ workspaceId }: { workspaceId: string }) {
  return <CommonEditorPanel workspaceId={workspaceId} />;
}
