"use client";

import { useEffect } from "react";
import { FileTree } from "./file-tree";
import { CodeEditor } from "./code-editor";
import { useEditorStore } from "@/stores/editor";
import { RefreshCw } from "lucide-react";

interface EditorPanelProps {
  workspaceId: string;
}

export function EditorPanel({ workspaceId }: EditorPanelProps) {
  const { tree, treeLoading, loadTree, openFile } = useEditorStore();

  useEffect(() => {
    loadTree(workspaceId);
  }, [workspaceId, loadTree]);

  return (
    <div className="flex h-full">
      <div className="w-56 border-r flex flex-col shrink-0">
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
            nodes={tree}
            workspaceId={workspaceId}
            onFileSelect={(path) => openFile(workspaceId, path)}
          />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <CodeEditor workspaceId={workspaceId} />
      </div>
    </div>
  );
}
