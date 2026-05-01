"use client";

import { X } from "lucide-react";
import { useEditorStore } from "@/stores/editor";

interface EditorTabsProps {
  workspaceId: string;
}

export function EditorTabs({ workspaceId }: EditorTabsProps) {
  const { openFiles, activeFilePath, setActiveFile, closeFile, saveFile } = useEditorStore();

  if (openFiles.length === 0) return null;

  return (
    <div className="flex items-center border-b bg-muted/30 overflow-x-auto">
      {openFiles.map((file) => (
        <div
          key={file.path}
          className={`flex items-center gap-1 px-3 py-1.5 text-xs border-r cursor-pointer shrink-0 ${
            file.path === activeFilePath
              ? "bg-background text-foreground"
              : "text-muted-foreground hover:bg-accent"
          }`}
          onClick={() => setActiveFile(file.path)}
        >
          {file.modified && (
            <span className="size-1.5 rounded-full bg-orange-400 shrink-0" />
          )}
          <span className="truncate max-w-32">{file.name}</span>
          <button
            className="ml-1 hover:bg-accent rounded p-0.5"
            onClick={(e) => {
              e.stopPropagation();
              if (file.modified) {
                saveFile(workspaceId, file.path);
              }
              closeFile(file.path);
            }}
          >
            <X className="size-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
