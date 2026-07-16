const { ScrollArea, Loader2, Trash2, AlertCircle, Inbox, RefreshCw } = window.AgentSpacesUI;
import { timeAgo } from '../utils/format.js';

export function FeedList({
  feeds, selectedFeedId, counts,
  fetchingFeedIds,
  onSelect, onRemove, onFetchOne,
}) {
  const allActive = selectedFeedId === 'all';
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-3 py-2 border-b border-border text-xs font-semibold text-muted-foreground">
        订阅源 ({feeds.length})
      </div>
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-2 flex flex-col gap-1">
          <FeedItem
            active={allActive}
            title="全部文章"
            count={counts.total}
            onClick={() => onSelect('all')}
          />
          {feeds.length === 0 && (
            <div className="text-xs text-muted-foreground px-2 py-6 text-center flex flex-col items-center gap-1">
              <Inbox className="h-5 w-5 opacity-50" />
              <span>还没有订阅源</span>
              <span>在上方输入 URL 添加</span>
            </div>
          )}
          {feeds.map((f) => {
            const fetching = fetchingFeedIds.has(f.id);
            return (
              <FeedItem
                key={f.id}
                active={selectedFeedId === f.id}
                title={f.title || f.url}
                subtitle={
                  f.error
                    ? `失败：${f.error}`
                    : f.lastFetchAt
                      ? `更新于 ${timeAgo(f.lastFetchAt)}`
                      : '尚未拉取'
                }
                count={counts.byFeed.get(f.id) || 0}
                error={!!f.error}
                fetching={fetching}
                onClick={() => onSelect(f.id)}
                onRemove={() => onRemove(f.id)}
                onRefresh={() => onFetchOne(f.id)}
              />
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

function FeedItem({
  active, title, subtitle, count = 0,
  error = false, fetching = false,
  onClick, onRemove, onRefresh,
}) {
  return (
    <div
      className={
        'group flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer text-sm transition-colors '
        + (active ? 'bg-primary/15 text-foreground' : 'hover:bg-muted/60 text-foreground')
      }
      onClick={onClick}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          {error && <AlertCircle className="h-3.5 w-3.5 text-destructive flex-shrink-0" />}
          {fetching && <Loader2 className="h-3.5 w-3.5 animate-spin flex-shrink-0" />}
          <span className="truncate font-medium">{title}</span>
        </div>
        {subtitle && (
          <div className={'text-[11px] truncate ' + (error ? 'text-destructive' : 'text-muted-foreground')}>
            {subtitle}
          </div>
        )}
      </div>
      {count > 0 && (
        <span className="text-[11px] text-muted-foreground flex-shrink-0">{count}</span>
      )}
      {onRefresh && (
        <button
          type="button"
          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground p-0.5"
          title="拉取更新"
          onClick={(e) => { e.stopPropagation(); onRefresh(); }}
          disabled={fetching}
        >
          <RefreshCw className={'h-3.5 w-3.5 ' + (fetching ? 'animate-spin' : '')} />
        </button>
      )}
      {onRemove && (
        <button
          type="button"
          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive p-0.5"
          title="删除订阅"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
