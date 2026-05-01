"use client";

import { useState } from "react";
import type { FileNode } from "@agent-spaces/shared";
import { ChevronRight, ChevronDown, File, Folder, FolderOpen } from "lucide-react";

interface FileTreeProps {
  nodes: FileNode[];
  workspaceId: string;
  onFileSelect: (path: string) => void;
  depth?: number;
}

export function FileTree({ nodes, workspaceId, onFileSelect, depth = 0 }: FileTreeProps) {
  return (
    <div className="text-sm select-none">
      {nodes.map((node) => (
        <FileTreeNode
          key={node.path}
          node={node}
          workspaceId={workspaceId}
          onFileSelect={onFileSelect}
          depth={depth}
        />
      ))}
    </div>
  );
}

function FileTreeNode({
  node,
  workspaceId,
  onFileSelect,
  depth,
}: {
  node: FileNode;
  workspaceId: string;
  onFileSelect: (path: string) => void;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const isDir = node.type === "directory";

  const handleClick = () => {
    if (isDir) {
      setExpanded(!expanded);
    } else {
      onFileSelect(node.path);
    }
  };

  return (
    <div>
      <div
        className="flex items-center gap-1 py-0.5 px-1 cursor-pointer hover:bg-accent rounded-sm"
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
        onClick={handleClick}
      >
        {isDir ? (
          <>
            {expanded ? (
              <ChevronDown className="size-3.5 shrink-0" />
            ) : (
              <ChevronRight className="size-3.5 shrink-0" />
            )}
            {expanded ? (
              <FolderOpen className="size-3.5 shrink-0 text-blue-500" />
            ) : (
              <Folder className="size-3.5 shrink-0 text-blue-500" />
            )}
          </>
        ) : (
          <>
            <span className="size-3.5 shrink-0" />
            <File className="size-3.5 shrink-0 text-muted-foreground" />
          </>
        )}
        <span className="truncate ml-1">{node.name}</span>
      </div>
      {isDir && expanded && node.children && (
        <FileTree
          nodes={node.children}
          workspaceId={workspaceId}
          onFileSelect={onFileSelect}
          depth={depth + 1}
        />
      )}
    </div>
  );
}
