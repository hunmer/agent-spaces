"use client";

import { useEffect } from "react";
import { useCodeFavoritesStore, type CodeFavorite } from "@/stores/code-favorites";
import { useEditorStore } from "@/stores/editor";
import { FileCode, Trash2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

interface CodeFavoritesPanelProps {
  workspaceId: string;
}

export function CodeFavoritesPanel({ workspaceId }: CodeFavoritesPanelProps) {
  const { favorites, load, removeFavorite } = useCodeFavoritesStore();
  const jumpToPosition = useEditorStore((s) => s.jumpToPosition);

  useEffect(() => {
    load(workspaceId);
  }, [workspaceId, load]);

  if (favorites.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-2">
        <FileCode size={32} className="opacity-30" />
        <span>暂无代码收藏</span>
        <span className="text-xs">在编辑器中右键 → 添加到代码收藏</span>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-2 space-y-2">
        {favorites.map((fav) => (
          <FavoriteCard
            key={fav.id}
            favorite={fav}
            workspaceId={workspaceId}
            onJump={jumpToPosition}
            onRemove={removeFavorite}
          />
        ))}
      </div>
    </ScrollArea>
  );
}

function FavoriteCard({
  favorite,
  workspaceId,
  onJump,
  onRemove,
}: {
  favorite: CodeFavorite;
  workspaceId: string;
  onJump: (wid: string, path: string, line: number, col?: number) => Promise<void>;
  onRemove: (id: string) => void;
}) {
  const handleClick = () => {
    onJump(workspaceId, favorite.path, favorite.line, favorite.column);
  };

  return (
    <div
      className="group border rounded-lg p-3 hover:bg-accent/50 cursor-pointer transition-colors"
      onClick={handleClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <FileCode size={14} className="shrink-0 text-muted-foreground" />
          <span className="text-sm font-medium truncate">{favorite.label || favorite.path}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
            <MapPin size={10} />
            {favorite.line}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => { e.stopPropagation(); onRemove(favorite.id); }}
          >
            <Trash2 size={12} />
          </Button>
        </div>
      </div>
      <div className="text-xs text-muted-foreground truncate mt-1">{favorite.path}</div>
      {favorite.snippet && (
        <pre className="text-[11px] text-muted-foreground bg-muted/50 rounded px-2 py-1 mt-1.5 overflow-hidden text-ellipsis whitespace-nowrap font-mono">
          {favorite.snippet}
        </pre>
      )}
    </div>
  );
}
