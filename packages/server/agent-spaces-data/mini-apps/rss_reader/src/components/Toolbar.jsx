const {
  Badge, Star, Settings, Rss,
} = window.AgentSpacesUI;

export function Toolbar({
  counts,
  onOpenSettings,
  filter, onFilterChange, error, toast,
}) {
  return (
    <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-2 flex-wrap">
      <div className="flex items-center gap-1.5 mr-1">
        <Rss className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">RSS 阅读器</span>
        <Badge variant="secondary" className="ml-1">{counts.total}</Badge>
      </div>

      <button
        type="button"
        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded h-8 ml-auto text-muted-foreground hover:bg-muted"
        onClick={onOpenSettings}
        title="设置"
      >
        <Settings className="h-4 w-4" />
        <span className="hidden sm:inline">设置</span>
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
