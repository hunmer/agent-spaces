import { useState, useEffect, useCallback } from 'react';

const {
  Popover, PopoverContent, PopoverTrigger,
  Play, Pause, Music, ChevronLeft, ChevronRight, ListMusic, Heart, Trash2,
} = window.AgentSpacesUI;

const PAGE_SIZE = 50;

export default function PlaylistPopover({ currentAudioUrl, isPlaying, onSelect, likedSongs, onToggleLiked, onRemove }) {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(false);

  const loadItems = useCallback(async () => {
    try {
      const data = await window.AgentSpacesUI.readConfigJson('music-history.json');
      setItems(data || []);
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setPage(0);
      loadItems();
    }
  }, [open, loadItems]);

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const pageItems = items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center justify-center w-10 h-10 text-muted-foreground hover:text-foreground transition-colors" title="播放列表">
          <ListMusic className="w-[22px] h-[22px]" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="!w-[520px] bg-popover/95 text-popover-foreground backdrop-blur-xl border-border p-0"
        align="end"
        side="top"
      >
        <div className="px-4 py-3 border-b border-border flex justify-between items-center">
          <span className="text-sm font-semibold">播放列表</span>
          <span className="text-xs text-muted-foreground">{items.length} 首</span>
        </div>
        <div className="overflow-y-auto max-h-[350px]">
          {pageItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Music className="w-8 h-8 mb-2" />
              <span className="text-sm">暂无音乐记录</span>
            </div>
          ) : (
            pageItems.map((item, idx) => {
              const isActive = item.audioUrl === currentAudioUrl;
              return (
                <button
                  key={item.id || idx}
                  onClick={() => onSelect(item)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-accent transition-colors text-left ${
                    isActive ? 'bg-accent' : ''
                  }`}
                >
                  <div className="w-7 h-7 rounded bg-muted flex items-center justify-center shrink-0">
                    {isActive && isPlaying ? (
                      <Pause className="w-3 h-3 text-[var(--theme-accent)]" />
                    ) : (
                      <Play className="w-3 h-3 text-muted-foreground ml-0.5" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm truncate ${isActive ? 'text-[var(--theme-accent)] font-medium' : ''}`}>
                      {item.title}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{item.artist}</div>
                  </div>
                  <button
                    className="shrink-0 p-1 hover:scale-110 transition-transform"
                    onClick={(e) => { e.stopPropagation(); onToggleLiked(item.audioUrl); }}
                  >
                    <Heart
                      className={`w-4 h-4 ${likedSongs.has(item.audioUrl) ? 'text-[var(--theme-accent)]' : 'text-muted-foreground'}`}
                      fill={likedSongs.has(item.audioUrl) ? 'currentColor' : 'none'}
                    />
                  </button>
                  <button
                    className="shrink-0 p-1 text-muted-foreground hover:text-red-400 hover:scale-110 transition-all"
                    onClick={(e) => { e.stopPropagation(); onRemove(item); }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </button>
              );
            })
          )}
        </div>
        {totalPages > 1 && (
          <div className="px-4 py-2.5 border-t border-border flex items-center justify-between">
            <button
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
              className="p-1 hover:bg-accent rounded disabled:opacity-30 disabled:cursor-not-allowed text-muted-foreground hover:text-popover-foreground transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs text-muted-foreground">{page + 1} / {totalPages}</span>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
              className="p-1 hover:bg-accent rounded disabled:opacity-30 disabled:cursor-not-allowed text-muted-foreground hover:text-popover-foreground transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
