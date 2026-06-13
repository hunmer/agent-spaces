import { useState, useEffect } from 'react';

const {
  Sheet, SheetTrigger, SheetContent, SheetTitle,
  Play, Pause, Music, ChevronLeft, ChevronRight, ListMusic, Heart, Trash2,
} = window.AgentSpacesUI;

const PAGE_SIZE = 50;

export default function PlaylistPopover({ currentAudioUrl, isPlaying, onSelect, likedSongs, onToggleLiked, onRemove, playlist }) {
  // 数据源单一：直接使用父级 playlist，避免与本地 items 状态不同步（删除/清空后列表不刷新）
  const items = Array.isArray(playlist) ? playlist : [];
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(false);

  // 打开时回到第一页
  useEffect(() => {
    if (open) setPage(0);
  }, [open]);

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  // 删除导致当前页越界时，回退到最后一页
  useEffect(() => {
    if (page > totalPages - 1) setPage(totalPages - 1);
  }, [page, totalPages]);

  const pageItems = items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        className="flex items-center justify-center w-10 h-10 text-muted-foreground hover:text-foreground transition-colors"
        title="播放列表"
      >
        <ListMusic className="w-[22px] h-[22px]" />
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-[440px] sm:max-w-[440px] gap-0 p-0"
      >
        <div className="px-4 py-3 pr-12 border-b border-border flex items-center justify-between">
          <SheetTitle className="m-0 text-sm font-semibold">播放列表</SheetTitle>
          <span className="text-xs text-muted-foreground">{items.length} 首</span>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
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
          <div className="px-4 py-2.5 border-t border-border flex items-center justify-between shrink-0">
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
      </SheetContent>
    </Sheet>
  );
}
