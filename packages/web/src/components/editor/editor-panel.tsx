"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileTree, FileTreeFolder, FileTreeFile } from "./file-tree";
import { SearchPanel } from "./search-panel";
import { ImportFileDialog } from "./import-file-dialog";
import { useEditorStore } from "@/stores/editor";
import type { FileNode } from "@agent-spaces/shared";
import { RefreshCw, Ellipsis, Upload, Copy, FolderPlus, FilePlus, Search, X } from "lucide-react";
import { FileIconImg, FolderIconImg } from "./file-icon";
import { useTranslations } from 'next-intl';
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FolderPicker } from "@/components/ui/folder-picker";
import { useWorkspaceStore } from "@/stores/workspace";

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

function FileTreeNodes({ nodes }: { nodes: FileNode[] }) {
  return nodes.map((node) =>
    node.type === "directory" ? (
      <FileTreeFolder key={node.path} path={node.path} name={node.name} folderIcon={(isOpen) => <FolderIconImg name={node.name} isOpen={isOpen} />}>
        {node.children && <FileTreeNodes nodes={node.children} />}
      </FileTreeFolder>
    ) : (
      <FileTreeFile key={node.path} path={node.path} name={node.name} icon={<FileIconImg name={node.name} />} />
    ),
  );
}

const STORAGE_KEY_PREFIX = 'agent-spaces:file-tree-expanded:';

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

interface EditorPanelProps {
  workspaceId: string;
}

export function EditorPanel({ workspaceId }: EditorPanelProps) {
  const { tree, treeLoading, loadTree, loadDirectory, openFile, openFiles, revealPath, clearRevealPath } = useEditorStore();
  const workspace = useWorkspaceStore((s) => s.workspaces.find((w) => w.id === workspaceId));
  const boundDir = workspace?.boundDirs?.[0] || '';
  const t = useTranslations('editor');
  const tc = useTranslations('common');
  const [selectedPath, setSelectedPath] = useState<string>();
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => loadExpandedPaths(workspaceId));
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importTargetPath, setImportTargetPath] = useState('');
  const [nameDialog, setNameDialog] = useState<{ open: boolean; mode: 'file' | 'folder'; targetDir: string; value: string }>({ open: false, mode: 'file', targetDir: '', value: '' });
  const [renameDialog, setRenameDialog] = useState<{ open: boolean; path: string; value: string }>({ open: false, path: '', value: '' });
  const [moveDialog, setMoveDialog] = useState<{ open: boolean; path: string; value: string; mode: 'move' | 'copy' }>({ open: false, path: '', value: '', mode: 'move' });
  const [fileSearch, setFileSearch] = useState('');
  const [bottomTab, setBottomTab] = useState<'all' | 'recent' | 'open'>('all');
  const filteredTree = useMemo(() => filterTreeByName(tree, fileSearch), [tree, fileSearch]);
  const fileSizeMap = useMemo(() => buildFileSizeMap(tree), [tree]);
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
    fetch(`/api/workspaces/${workspaceId}/files/content`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: fullPath, content: '' }),
    }).then(() => { loadTree(workspaceId); setNameDialog((p) => ({ ...p, open: false })); });
  }, [nameDialog, workspaceId, loadTree]);

  const openNameDialog = useCallback((mode: 'file' | 'folder', targetDir: string) => {
    setNameDialog({ open: true, mode, targetDir, value: '' });
  }, []);

  useEffect(() => {
    const saved = loadExpandedPaths(workspaceId);
    setExpandedPaths(saved);
    loadTree(workspaceId).then(() => {
      // Reload children for previously expanded directories
      for (const dir of saved) {
        loadDirectory(workspaceId, dir);
      }
    });
  }, [workspaceId, loadTree, loadDirectory]);

  const handleExpandedChange = useCallback((newExpanded: Set<string>) => {
    setExpandedPaths(newExpanded);
    saveExpandedPaths(workspaceId, newExpanded);
  }, [workspaceId]);

  const handleDelete = async (path: string) => {
    await fetch(`/api/workspaces/${workspaceId}/files?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
    loadTree(workspaceId);
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
    const res = await fetch(`/api/workspaces/${workspaceId}/files/rename`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPath, newPath }),
    });
    if (res.ok) { loadTree(workspaceId); setRenameDialog(p => ({ ...p, open: false })); }
  }, [renameDialog, workspaceId, loadTree]);

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
    const endpoint = mode === 'copy' ? '/files/copy' : '/files/rename';
    const body = mode === 'copy' ? { srcPath, destPath: newRelPath } : { oldPath: srcPath, newPath: newRelPath };
    const res = await fetch(`/api/workspaces/${workspaceId}${endpoint}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) { loadTree(workspaceId); setMoveDialog(p => ({ ...p, open: false })); }
  }, [moveDialog, workspaceId, loadTree, boundDir]);

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
      saveExpandedPaths(workspaceId, next);
      return next;
    });
    // Load each parent directory to ensure children are available
    (async () => {
      for (const d of dirsToExpand) {
        await loadDirectory(workspaceId, d);
      }
      setSelectedPath(revealPath);
      clearRevealPath();
    })();
  }, [revealPath, workspaceId, loadDirectory, clearRevealPath]);

  return (
    <div className="flex flex-col h-full">
      <Tabs defaultValue="files" className="flex flex-col h-full">
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
              <input
                type="text"
                value={fileSearch}
                onChange={(e) => setFileSearch(e.target.value)}
                placeholder={t('searchFiles') + '...'}
                className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                spellCheck={false}
              />
              {fileSearch && (
                <button onClick={() => setFileSearch('')} className="p-0.5 hover:bg-accent rounded">
                  <X className="size-3 text-muted-foreground" />
                </button>
              )}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger className="p-0.5 hover:bg-accent rounded">
                <Ellipsis className="size-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => { setImportTargetPath(''); setImportDialogOpen(true); }}>
                  <Upload className="size-4" />
                  {t('importFile')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {
                  const relPath = selectedPath || '';
                  const absPath = relPath ? (boundDir ? boundDir.replace(/\/+$/, '') + '/' + relPath : relPath) : boundDir;
                  navigator.clipboard.writeText(absPath);
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
              onClick={() => loadTree(workspaceId)}
              className="p-0.5 hover:bg-accent rounded"
              disabled={treeLoading}
            >
              <RefreshCw className={`size-3 ${treeLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-auto py-1">
            {bottomTab === 'all' ? (
              <>
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
                      openFile(workspaceId, path);
                    }}
                    workspaceId={workspaceId}
                    onDelete={handleDelete}
                    onImport={(targetPath) => { setImportTargetPath(targetPath); setImportDialogOpen(true); }}
                    onCopyPath={(path) => { navigator.clipboard.writeText(boundDir ? boundDir.replace(/\/+$/, '') + '/' + path : path); toast.success(t('copied')); }}
                    onCreateFile={(targetDir) => openNameDialog('file', targetDir)}
                    onCreateFolder={(targetDir) => openNameDialog('folder', targetDir)}
                    onRename={handleRename}
                    onMove={handleMove}
                    onCopyItem={handleCopy}
                    onLoadDirectory={(dirPath) => loadDirectory(workspaceId, dirPath)}
                    boundDir={boundDir}
                    fileSizeMap={fileSizeMap}
                    refreshInterval={5000}
                  >
                    <FileTreeNodes nodes={filteredTree} />
                  </FileTree>
                )}
              </>
            ) : (
              (() => {
                const files = bottomTab === 'recent' ? recentFiles : openedFileNodes;
                const lower = fileSearch.toLowerCase();
                const filtered = fileSearch ? files.filter(f => f.name.toLowerCase().includes(lower)) : files;
                return filtered.length === 0 ? (
                  <div className="px-2 py-4 text-xs text-muted-foreground text-center">{t('noFiles')}</div>
                ) : filtered.map(node => (
                  <button
                    key={node.path}
                    onClick={() => { setSelectedPath(node.path); openFile(workspaceId, node.path); }}
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
                ));
              })()
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

        <TabsContent value="search" className="flex-1 min-h-0 mt-0">
          <SearchPanel workspaceId={workspaceId} />
        </TabsContent>
      </Tabs>
      <ImportFileDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        workspaceId={workspaceId}
        targetPath={importTargetPath}
        onImported={() => loadTree(workspaceId)}
      />
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
