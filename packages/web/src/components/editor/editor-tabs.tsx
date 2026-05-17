"use client";

import { useState, useCallback } from "react";
import { X, GitCommitHorizontal, Pin } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type Modifier,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEditorStore, isCommitDiffPath, getCommitHashFromPath } from "@/stores/editor";
import type { OpenFile } from "@/stores/editor";
import { useWorkspaceStore } from "@/stores/workspace";
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { FileIconImg } from "./file-icon";
import { cn } from "@/lib/utils";

const restrictToHorizontal: Modifier = ({ transform }) => ({
  ...transform,
  y: 0,
});

interface EditorTabsProps {
  workspaceId: string;
}

function getAbsolutePath(relPath: string, boundDirs: string[]): string {
  if (boundDirs.length === 0) return relPath;
  const base = boundDirs[0].replace(/\/+$/, '');
  return base + '/' + relPath;
}

function getRelativePath(relPath: string, boundDirs: string[]): string {
  return relPath;
}

interface SortableTabProps {
  file: OpenFile;
  isActive: boolean;
  boundDirs: string[];
  commitDiffs: Record<string, { diffs: unknown[]; message: string }>;
  onClose: (e: React.MouseEvent, file: OpenFile) => void;
  onClick: () => void;
  onCopy: (text: string) => void;
  onRevealInFinder: (relPath: string) => void;
  onSetRevealPath: (path: string) => void;
  onTogglePin: (path: string) => void;
  onCloseOthers: (path: string) => void;
  onCloseLeft: (path: string) => void;
  onCloseRight: (path: string) => void;
  t: (key: string) => string;
}

function SortableTab({
  file, isActive, boundDirs, commitDiffs,
  onClose, onClick, onCopy, onRevealInFinder, onSetRevealPath,
  onTogglePin, onCloseOthers, onCloseLeft, onCloseRight, t,
}: SortableTabProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: file.path });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <div
          ref={setNodeRef}
          style={style}
          {...attributes}
          {...listeners}
          className={cn(
            "flex items-center gap-1 px-3 py-1.5 text-xs border-r cursor-grab shrink-0 select-none",
            isActive ? "bg-background text-foreground" : "text-muted-foreground hover:bg-accent",
            isDragging && "opacity-50 shadow-lg z-10",
            file.pinned && "border-l-2 border-l-primary/60",
          )}
          onClick={onClick}
        >
          {file.pinned && <Pin size={10} className="text-primary/70 shrink-0 -ml-1 mr-0.5" />}
          {isCommitDiffPath(file.path) ? (
            <GitCommitHorizontal size={14} className="text-blue-500 shrink-0" />
          ) : (
            <FileIconImg name={file.name} />
          )}
          {file.modified && !file.pinned && (
            <span className="size-1.5 rounded-full bg-orange-400 shrink-0" />
          )}
          <span className="truncate max-w-32">
            {isCommitDiffPath(file.path)
              ? commitDiffs[getCommitHashFromPath(file.path)]?.message?.split("\n")[0]?.slice(0, 30) || file.name
              : file.name}
          </span>
          <button
            className="ml-1 hover:bg-accent rounded p-0.5"
            onClick={(e) => onClose(e, file)}
          >
            <X className="size-3" />
          </button>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => onSetRevealPath(file.path)}>
          {t('revealInTree')}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onRevealInFinder(file.path)}>
          {t('revealInFinder')}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => onCopy(getAbsolutePath(file.path, boundDirs))}>
          {t('copyFilePath')}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onCopy(getRelativePath(file.path, boundDirs))}>
          {t('copyRelativePath')}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => onTogglePin(file.path)}>
          {file.pinned ? t('unpin') : t('pin')}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onCloseOthers(file.path)}>
          {t('closeOthers')}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onCloseLeft(file.path)}>
          {t('closeLeft')}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onCloseRight(file.path)}>
          {t('closeRight')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function EditorTabs({ workspaceId }: EditorTabsProps) {
  const { openFiles, activeFilePath, setActiveFile, closeFile, saveFile, setRevealPath, commitDiffs,
    togglePin, reorderFiles, closeOthers, closeToLeft, closeToRight } = useEditorStore();
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const workspace = workspaces.find((w) => w.id === workspaceId);
  const boundDirs = workspace?.boundDirs ?? [];
  const t = useTranslations('editor');
  const [pendingClose, setPendingClose] = useState<{ path: string; name: string } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast.success(t('copied'));
  };

  const handleRevealInFinder = (relPath: string) => {
    fetch(`/api/workspaces/${workspaceId}/files/reveal?path=${encodeURIComponent(relPath)}`, { method: 'POST' });
  };

  const handleClose = (e: React.MouseEvent, file: { path: string; name: string; modified: boolean }) => {
    e.stopPropagation();
    if (file.modified) {
      setPendingClose(file);
    } else {
      closeFile(workspaceId, file.path);
    }
  };

  const handleSaveAndClose = async () => {
    if (!pendingClose) return;
    await saveFile(workspaceId, pendingClose.path);
    closeFile(workspaceId, pendingClose.path);
    setPendingClose(null);
  };

  const handleDiscardAndClose = () => {
    if (!pendingClose) return;
    closeFile(workspaceId, pendingClose.path);
    setPendingClose(null);
  };

  const handleDragEnd = useCallback((event: { active: { id: string | number }; over: { id: string | number } | null }) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const files = useEditorStore.getState().openFiles;
    const fromIdx = files.findIndex((f) => f.path === String(active.id));
    const toIdx = files.findIndex((f) => f.path === String(over.id));
    if (fromIdx === -1 || toIdx === -1) return;

    const reordered = arrayMove(files, fromIdx, toIdx);
    const newIdx = reordered.findIndex((f) => f.path === String(active.id));
    const moved = reordered[newIdx];

    const leftPinned = newIdx > 0 && reordered[newIdx - 1].pinned;
    const rightPinned = !leftPinned && newIdx < reordered.length - 1 && reordered[newIdx + 1].pinned;
    if (moved) {
      reordered[newIdx] = { ...moved, pinned: leftPinned || rightPinned };
    }

    const pinned = reordered.filter((f) => f.pinned);
    const unpinned = reordered.filter((f) => !f.pinned);
    reorderFiles(workspaceId, [...pinned, ...unpinned]);
  }, [workspaceId, reorderFiles]);

  if (openFiles.length === 0) return null;

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToHorizontal]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={openFiles.map((f) => f.path)} strategy={horizontalListSortingStrategy}>
          <div className="flex items-center border-b bg-muted/30 overflow-x-auto">
            {openFiles.map((file) => (
              <SortableTab
                key={file.path}
                file={file}
                isActive={file.path === activeFilePath}
                boundDirs={boundDirs}
                commitDiffs={commitDiffs}
                onClose={handleClose}
                onClick={() => setActiveFile(workspaceId, file.path)}
                onCopy={handleCopy}
                onRevealInFinder={handleRevealInFinder}
                onSetRevealPath={setRevealPath}
                onTogglePin={(path) => togglePin(workspaceId, path)}
                onCloseOthers={(path) => closeOthers(workspaceId, path)}
                onCloseLeft={(path) => closeToLeft(workspaceId, path)}
                onCloseRight={(path) => closeToRight(workspaceId, path)}
                t={(key) => t(key)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <Dialog open={!!pendingClose} onOpenChange={(open) => !open && setPendingClose(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('saveChangesTitle')}</DialogTitle>
            <DialogDescription>
              {t('saveChangesDesc', { name: pendingClose?.name ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingClose(null)}>
              {t('cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDiscardAndClose}>
              {t('discardChanges')}
            </Button>
            <Button onClick={handleSaveAndClose}>
              {t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
