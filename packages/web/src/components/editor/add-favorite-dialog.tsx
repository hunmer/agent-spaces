"use client";

import { useEffect, useState } from "react";
import { useCodeFavoritesStore, type PendingFavorite } from "@/stores/code-favorites";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AddFavoriteDialog() {
  const { pendingFavorite, setPendingFavorite, addFavorite } = useCodeFavoritesStore();
  const [title, setTitle] = useState("");

  useEffect(() => {
    if (pendingFavorite) setTitle("");
  }, [pendingFavorite]);

  if (!pendingFavorite) return null;

  const handleSubmit = () => {
    addFavorite({
      ...pendingFavorite,
      label: title.trim() || pendingFavorite.label,
    });
    setPendingFavorite(null);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) setPendingFavorite(null);
  };

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>添加代码收藏</DialogTitle>
        </DialogHeader>
        <FavoritePreview fav={pendingFavorite} />
        <div className="space-y-2">
          <Input
            placeholder="标题（可选）"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
            }}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setPendingFavorite(null)}>
            取消
          </Button>
          <Button onClick={handleSubmit}>
            收藏
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FavoritePreview({ fav }: { fav: PendingFavorite }) {
  const fileName = fav.path.split("/").pop() || fav.path;
  const lineLabel = fav.endLine > fav.line ? `${fav.line}-${fav.endLine}` : `${fav.line}`;
  return (
    <div className="space-y-2">
      <div className="text-sm text-muted-foreground space-y-0.5">
        <div className="font-medium text-foreground">{fileName}</div>
        <div>{fav.path}:{lineLabel}</div>
      </div>
      {fav.snippet && (
        <pre className="text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2 font-mono max-h-48 overflow-auto whitespace-pre break-all">
          {fav.snippet}
        </pre>
      )}
    </div>
  );
}
