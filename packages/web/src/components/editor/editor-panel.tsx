"use client";

import { useEffect, useState } from "react";
import { FileTree, FileTreeFolder, FileTreeFile } from "./file-tree";
import { useEditorStore } from "@/stores/editor";
import type { FileNode } from "@agent-spaces/shared";
import { RefreshCw } from "lucide-react";
import { FileIconImg, FolderIconImg } from "./file-icon";

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

interface EditorPanelProps {
  workspaceId: string;
}

export function EditorPanel({ workspaceId }: EditorPanelProps) {
  const { tree, treeLoading, loadTree, openFile } = useEditorStore();
  const [selectedPath, setSelectedPath] = useState<string>();

  useEffect(() => {
    loadTree(workspaceId);
  }, [workspaceId, loadTree]);

  const handleDelete = async (path: string) => {
    await fetch(`/api/workspaces/${workspaceId}/files?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
    loadTree(workspaceId);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-2 py-1.5 border-b text-xs font-medium text-muted-foreground">
        <span>EXPLORER</span>
        <button
          onClick={() => loadTree(workspaceId)}
          className="p-0.5 hover:bg-accent rounded"
          disabled={treeLoading}
        >
          <RefreshCw className={`size-3 ${treeLoading ? "animate-spin" : ""}`} />
        </button>
      </div>
      <div className="flex-1 overflow-auto py-1">
        {tree.length === 0 && !treeLoading && (
          <div className="px-2 py-4 text-xs text-muted-foreground text-center">
            No files found
          </div>
        )}
        <FileTree
          selectedPath={selectedPath}
          onFileSelect={(path) => {
            setSelectedPath(path);
            openFile(workspaceId, path);
          }}
          workspaceId={workspaceId}
          onDelete={handleDelete}
        >
          <FileTreeNodes nodes={tree} />
        </FileTree>
      </div>
    </div>
  );
}
