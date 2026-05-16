"use client";

import { useCallback, useEffect, useState } from "react";
import { FileTree, FileTreeFolder, FileTreeFile } from "./file-tree";
import { SearchPanel } from "./search-panel";
import { ImportFileDialog } from "./import-file-dialog";
import { useEditorStore } from "@/stores/editor";
import type { FileNode } from "@agent-spaces/shared";
import { RefreshCw, Ellipsis, Upload, Copy, FolderPlus, FilePlus } from "lucide-react";
import { FileIconImg, FolderIconImg } from "./file-icon";
import { useTranslations } from 'next-intl';
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useWorkspaceStore } from "@/stores/workspace";

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
  const { tree, treeLoading, loadTree, openFile, revealPath, clearRevealPath } = useEditorStore();
  const workspace = useWorkspaceStore((s) => s.workspaces.find((w) => w.id === workspaceId));
  const boundDir = workspace?.boundDirs?.[0] || '';
  const t = useTranslations('editor');
  const [selectedPath, setSelectedPath] = useState<string>();
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => loadExpandedPaths(workspaceId));
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importTargetPath, setImportTargetPath] = useState('');

  useEffect(() => {
    loadTree(workspaceId);
    setExpandedPaths(loadExpandedPaths(workspaceId));
  }, [workspaceId, loadTree]);

  const handleExpandedChange = useCallback((newExpanded: Set<string>) => {
    setExpandedPaths(newExpanded);
    saveExpandedPaths(workspaceId, newExpanded);
  }, [workspaceId]);

  const handleDelete = async (path: string) => {
    await fetch(`/api/workspaces/${workspaceId}/files?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
    loadTree(workspaceId);
  };

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
    setSelectedPath(revealPath);
    clearRevealPath();
  }, [revealPath, workspaceId, clearRevealPath]);

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

        <TabsContent value="files" className="flex-1 min-h-0 mt-0">
          <div className="flex items-center justify-end px-2 py-1 border-b gap-1">
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
                <DropdownMenuItem onClick={() => {
                  const name = prompt(t('newFileName'));
                  if (!name) return;
                  fetch(`/api/workspaces/${workspaceId}/files/content`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: name, content: '' }),
                  }).then(() => loadTree(workspaceId));
                }}>
                  <FilePlus className="size-4" />
                  {t('newFile')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {
                  const name = prompt(t('newFolderName'));
                  if (!name) return;
                  fetch(`/api/workspaces/${workspaceId}/files/content`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: name + '/.gitkeep', content: '' }),
                  }).then(() => loadTree(workspaceId));
                }}>
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
          <div className="overflow-auto py-1" style={{ height: 'calc(100% - 28px)' }}>
            {tree.length === 0 && !treeLoading && (
              <div className="px-2 py-4 text-xs text-muted-foreground text-center">
                {t('noFiles')}
              </div>
            )}
            {tree.length > 0 && (
              <FileTree
                expanded={expandedPaths}
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
                onCreateFile={(targetDir) => {
                  const name = prompt(t('newFileName'));
                  if (!name) return;
                  fetch(`/api/workspaces/${workspaceId}/files/content`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: targetDir ? targetDir + '/' + name : name, content: '' }),
                  }).then(() => loadTree(workspaceId));
                }}
                onCreateFolder={(targetDir) => {
                  const name = prompt(t('newFolderName'));
                  if (!name) return;
                  fetch(`/api/workspaces/${workspaceId}/files/content`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: targetDir ? targetDir + '/' + name + '/.gitkeep' : name + '/.gitkeep', content: '' }),
                  }).then(() => loadTree(workspaceId));
                }}
                boundDir={boundDir}
              >
                <FileTreeNodes nodes={tree} />
              </FileTree>
            )}
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
    </div>
  );
}
