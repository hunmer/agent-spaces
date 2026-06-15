"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  loadLayoutTemplates,
  addLayoutTemplate,
  renameLayoutTemplate,
  deleteLayoutTemplate,
  type LayoutTemplate,
} from "@/lib/layout-templates";
import { LayoutTemplateIcon, Pencil, Trash2, Check, X, Plus, RotateCcw } from "lucide-react";
import type { IJsonModel } from "flexlayout-react";

/**
 * Caller-provided behavior that adapts the generic layout manager to a specific
 * flexlayout surface (workspace shell, workflow editor, ...). The dialog stays
 * UI-only and storage-agnostic.
 */
export interface LayoutManagerDialogConfig {
  /** localStorage key that stores the saved layout templates list for this surface. */
  templatesStorageKey?: string;
  /** Read the current live layout so it can be captured into a new template. */
  getCurrentLayout: () => IJsonModel | null;
  /** Apply a saved template to the active layout. */
  onApply: (json: IJsonModel) => void;
  /** Reset the active layout to its default. */
  onReset: () => void;
  /** Dialog title. */
  title?: string;
  /** Dialog description. */
  description?: string;
}

interface LayoutManagerDialogProps extends LayoutManagerDialogConfig {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LayoutManagerDialog({
  open,
  onOpenChange,
  templatesStorageKey,
  getCurrentLayout,
  onApply,
  onReset,
  title = "布局管理",
  description = "保存、切换或管理布局",
}: LayoutManagerDialogProps) {
  const [templates, setTemplates] = useState<LayoutTemplate[]>([]);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const refresh = useCallback(
    () => setTemplates(loadLayoutTemplates(templatesStorageKey)),
    [templatesStorageKey],
  );

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  const handleSave = () => {
    if (!newName.trim()) return;
    const json = getCurrentLayout();
    if (!json) return;
    addLayoutTemplate(newName.trim(), json, templatesStorageKey);
    setNewName("");
    refresh();
  };

  const handleApply = (t: LayoutTemplate) => {
    onApply(t.json);
    onOpenChange(false);
  };

  const handleRenameStart = (t: LayoutTemplate) => {
    setEditingId(t.id);
    setEditName(t.name);
  };

  const handleRenameConfirm = () => {
    if (editingId && editName.trim()) {
      renameLayoutTemplate(editingId, editName.trim(), templatesStorageKey);
      setEditingId(null);
      refresh();
    }
  };

  const handleDelete = (id: string) => {
    deleteLayoutTemplate(id, templatesStorageKey);
    refresh();
  };

  const handleReset = () => {
    onReset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="新布局名称"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
            />
            <Button size="sm" onClick={handleSave} disabled={!newName.trim()}>
              <Plus className="size-4" />
            </Button>
          </div>

          {templates.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">暂无已保存的布局</p>
          ) : (
            <div className="max-h-60 space-y-1 overflow-y-auto">
              {templates.map((t) => (
                <div
                  key={t.id}
                  className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
                >
                  {editingId === t.id ? (
                    <>
                      <Input
                        className="h-7 flex-1 text-xs"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRenameConfirm();
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        autoFocus
                      />
                      <Button variant="ghost" size="icon" onClick={handleRenameConfirm}>
                        <Check className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setEditingId(null)}>
                        <X className="size-3.5" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <LayoutTemplateIcon className="size-4 shrink-0 text-muted-foreground" />
                      <button
                        className="flex-1 truncate text-left text-sm hover:underline"
                        onClick={() => handleApply(t)}
                      >
                        {t.name}
                      </button>
                      <span className="hidden text-xs text-muted-foreground group-hover:block">
                        {new Date(t.createdAt).toLocaleDateString()}
                      </span>
                      <Button variant="ghost" size="icon" onClick={() => handleRenameStart(t)}>
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(t.id)}>
                        <Trash2 className="size-3.5 text-destructive" />
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="border-t pt-2">
            <Button variant="outline" size="sm" className="w-full" onClick={handleReset}>
              <RotateCcw className="mr-2 size-3.5" />
              重置为默认布局
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
