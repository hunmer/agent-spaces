"use client";

import { useEffect, useCallback } from "react";
import { useCodeFavoritesStore, type CodeFavorite } from "@/stores/code-favorites";
import { useEditorStore } from "@/stores/editor";
import { FileCode, Trash2, MapPin, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { copyToClipboard } from "@/lib/utils";

interface CodeFavoritesPanelProps {
  workspaceId: string;
}

export function CodeFavoritesPanel({ workspaceId }: CodeFavoritesPanelProps) {
  const { favorites, load, removeFavorite } = useCodeFavoritesStore();
  const jumpToPosition = useEditorStore((s) => s.jumpToPosition);
  const t = useTranslations('editor');

  useEffect(() => {
    load(workspaceId);
  }, [workspaceId, load]);

  if (favorites.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-2">
        <FileCode size={32} className="opacity-30" />
        <span>{t('noFavorites')}</span>
        <span className="text-xs">{t('noFavoritesHint')}</span>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="grid gap-2 p-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))' }}>
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
  onJump: (wid: string, path: string, line: number, col?: number, endLine?: number, endColumn?: number) => Promise<void>;
  onRemove: (id: string) => void;
}) {
  const t = useTranslations('editor');
  const handleClick = () => {
    onJump(workspaceId, favorite.path, favorite.line, favorite.column, favorite.endLine, favorite.endColumn);
  };

  const handleCopy = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const pos = `${favorite.path}:${favorite.line}:${favorite.endLine}`;
    copyToClipboard(pos).then(() => {
      toast.success(t('copiedPosition', { pos }));
    });
  }, [favorite, t]);

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
        <div className="flex items-center gap-0.5 shrink-0">
          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground mr-0.5">
            <MapPin size={10} />
            {favorite.endLine > favorite.line ? `${favorite.line}-${favorite.endLine}` : favorite.line}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={handleCopy}
            title={t('copyPosition')}
          >
            <Copy size={12} />
          </Button>
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
        <pre className="text-[11px] text-muted-foreground bg-muted/50 rounded px-2 py-1 mt-1.5 max-h-16 overflow-auto whitespace-pre break-all font-mono">
          {favorite.snippet}
        </pre>
      )}
    </div>
  );
}
