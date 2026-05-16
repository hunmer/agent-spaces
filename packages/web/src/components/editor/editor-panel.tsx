"use client";

import { useCallback, useEffect, useState } from "react";
import { FileTree, FileTreeFolder, FileTreeFile } from "./file-tree";
import { SearchPanel } from "./search-panel";
import { ImportFileDialog } from "./import-file-dialog";
import { useEditorStore } from "@/stores/editor";
import type { FileNode } from "@agent-spaces/shared";
import { RefreshCw, Ellipsis, Upload, Copy } from "lucide-react";
import { FileIconImg, FolderIconImg } from "./file-icon";
import { useTranslations } from 'next-intl';
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";

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
                  const path = selectedPath || '';
                  navigator.clipboard.writeText(path);
                  toast.success(t('copied'));
                }}>
                  <Copy className="size-4" />
                  {t('copyPath')}
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
                onCopyPath={(path) => { navigator.clipboard.writeText(path); toast.success(t('copied')); }}
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
