"use client";

import { X } from "lucide-react";
import { useEditorStore } from "@/stores/editor";
import { useWorkspaceStore } from "@/stores/workspace";
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu";
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

interface EditorTabsProps {
  workspaceId: string;
}

function getRelativePath(filePath: string, boundDirs: string[]): string {
  for (const dir of boundDirs) {
    const normalized = dir.endsWith('/') ? dir : dir + '/';
    if (filePath.startsWith(normalized)) {
      return filePath.slice(normalized.length);
    }
  }
  return filePath;
}

export function EditorTabs({ workspaceId }: EditorTabsProps) {
  const { openFiles, activeFilePath, setActiveFile, closeFile, saveFile, setRevealPath } = useEditorStore();
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const workspace = workspaces.find((w) => w.id === workspaceId);
  const boundDirs = workspace?.boundDirs ?? [];
  const t = useTranslations('editor');

  if (openFiles.length === 0) return null;

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast.success(t('copied'));
  };

  return (
    <div className="flex items-center border-b bg-muted/30 overflow-x-auto">
      {openFiles.map((file) => (
        <ContextMenu key={file.path}>
          <ContextMenuTrigger>
            <div
              className={`flex items-center gap-1 px-3 py-1.5 text-xs border-r cursor-pointer shrink-0 ${
                file.path === activeFilePath
                  ? "bg-background text-foreground"
                  : "text-muted-foreground hover:bg-accent"
              }`}
              onClick={() => setActiveFile(workspaceId, file.path)}
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
                  closeFile(workspaceId, file.path);
                }}
              >
                <X className="size-3" />
              </button>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onClick={() => setRevealPath(file.path)}>
              {t('revealInTree')}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => handleCopy(file.path)}>
              {t('copyFilePath')}
            </ContextMenuItem>
            <ContextMenuItem onClick={() => handleCopy(getRelativePath(file.path, boundDirs))}>
              {t('copyRelativePath')}
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      ))}
    </div>
  );
}
