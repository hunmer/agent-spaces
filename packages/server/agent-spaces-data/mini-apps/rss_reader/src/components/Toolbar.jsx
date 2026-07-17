const {
  Badge, Star, Settings, Rss, Menu,
} = window.AgentSpacesUI;

export function Toolbar({
  counts,
  onOpenSettings,
  filter, onFilterChange, error, toast,
  isMobile, onOpenFeeds,
}) {
  return (
    <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-2">
      {/* 小屏：左侧菜单按钮，打开订阅 drawer */}
      {isMobile && (
        <button
          type="button"
          className="inline-flex items-center justify-center h-8 w-8 rounded hover:bg-muted text-foreground flex-shrink-0"
          onClick={onOpenFeeds}
          title="订阅源"
        >
          <Menu className="h-4 w-4" />
        </button>
      )}

      <div className="flex items-center gap-1.5 mr-1 min-w-0">
        <Rss className="h-4 w-4 text-primary flex-shrink-0" />
        <span className="text-sm font-semibold truncate">RSS 阅读器</span>
        <Badge variant="secondary" className="ml-1 flex-shrink-0">{counts.total}</Badge>
      </div>

      <button
        type="button"
        className={
          'inline-flex items-center gap-1 text-xs px-2 py-1 rounded h-8 flex-shrink-0 '
          + (filter === 'favorite'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-muted')
        }
        onClick={() => onFilterChange(filter === 'favorite' ? 'all' : 'favorite')}
        title="只看收藏"
      >
        <Star className={'h-4 w-4 ' + (filter === 'favorite' ? 'fill-current' : '')} />
      </button>

      <button
        type="button"
        className="inline-flex items-center justify-center h-8 w-8 rounded ml-auto text-muted-foreground hover:bg-muted flex-shrink-0"
        onClick={onOpenSettings}
        title="设置"
      >
        <Settings className="h-4 w-4" />
      </button>

      {(error || toast) && (
        <div className="basis-full text-xs px-1">
          {error ? (
            <span className="text-destructive">{error}</span>
          ) : (
            <span className="text-muted-foreground">{toast}</span>
          )}
        </div>
      )}
    </div>
  );
}
