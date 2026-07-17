const { useState, useMemo } = React;
const {
  ScrollArea, Loader2, AlertCircle, Inbox, RefreshCw, Plus,
  ChevronRight, ChevronDown, Folder, Rss,
} = window.AgentSpacesUI;
import { timeAgo } from '../utils/format.js';

const NO_CATEGORY = '未分类';

export function FeedList({
  feeds, selectedFeedId, counts,
  fetchingFeedIds, fetchingAll,
  onSelect, onFetchOne, onFetchAll, onAddClick,
}) {
  const allActive = selectedFeedId === 'all';

  // 按分类分组
  const groups = useMemo(() => {
    const map = new Map(); // category -> feeds[]
    for (const f of feeds) {
      const cat = String(f.category || '').trim() || NO_CATEGORY;
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat).push(f);
    }
    // 分类按字母序，「未分类」排最后
    return [...map.entries()].sort((a, b) => {
      if (a[0] === NO_CATEGORY) return 1;
      if (b[0] === NO_CATEGORY) return -1;
      return a[0].localeCompare(b[0], 'zh');
    });
  }, [feeds]);

  // 折叠状态：记录被折叠的分类（默认全部展开）
  const [collapsed, setCollapsed] = useState(() => new Set());
  const toggleCategory = (cat) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full w-full min-h-0">
      {/* 头部：标题 + 计数 badge + 添加按钮 */}
      <div className="flex items-center gap-1 px-2 py-2 border-b border-border">
        <span className="text-xs font-semibold text-foreground px-1">订阅源</span>
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/15 text-primary">
          {feeds.length}
        </span>
        <button
          type="button"
          className="ml-auto inline-flex items-center gap-1 text-xs px-2 py-1 rounded hover:bg-muted text-foreground"
          onClick={onAddClick}
          title="添加订阅源"
        >
          <Plus className="h-3.5 w-3.5" /> 添加
        </button>
      </div>

      {/* 滚动列表 */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-2 flex flex-col gap-1">
          {/* 全部 */}
          <FeedItem
            active={allActive}
            icon={<Rss className="h-3.5 w-3.5 text-primary" />}
            title="全部文章"
            count={counts.total}
            onClick={() => onSelect('all')}
          />

          {feeds.length === 0 && (
            <div className="text-xs text-muted-foreground px-2 py-6 text-center flex flex-col items-center gap-1">
              <Inbox className="h-5 w-5 opacity-50" />
              <span>还没有订阅源</span>
              <span>点击右上「添加」</span>
            </div>
          )}

          {groups.map(([category, list]) => {
            const isCollapsed = collapsed.has(category);
            const groupTotal = list.reduce((sum, f) => sum + (counts.byFeed.get(f.id) || 0), 0);
            return (
              <div key={category} className="flex flex-col">
                <CategoryHeader
                  label={category}
                  count={groupTotal}
                  collapsed={isCollapsed}
                  onToggle={() => toggleCategory(category)}
                />
                {!isCollapsed && list.map((f) => (
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
                    fetching={fetchingFeedIds.has(f.id)}
                    indented
                    onClick={() => onSelect(f.id)}
                    onRefresh={() => onFetchOne(f.id)}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* 底部：拉取全部 */}
      <div className="border-t border-border p-2">
        <button
          type="button"
          className="w-full inline-flex items-center justify-center gap-1.5 text-xs px-2 py-1.5 rounded border border-border hover:bg-muted text-foreground disabled:opacity-50"
          onClick={onFetchAll}
          disabled={fetchingAll || feeds.length === 0}
        >
          {fetchingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          拉取全部
        </button>
      </div>
    </div>
  );
}

function CategoryHeader({ label, count, collapsed, onToggle }) {
  return (
    <div
      className="flex items-center gap-1 px-2 py-1 mt-1 cursor-pointer select-none rounded hover:bg-muted/50"
      onClick={onToggle}
    >
      {collapsed
        ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
      <Folder className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
      <span className="text-xs font-semibold text-foreground flex-1 truncate">{label}</span>
      {count > 0 && <span className="text-[11px] text-muted-foreground">{count}</span>}
    </div>
  );
}

function FeedItem({
  active, title, subtitle, count = 0,
  error = false, fetching = false, indented = false, icon,
  onClick, onRefresh,
}) {
  return (
    <div
      className={
        'group flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer text-sm transition-colors '
        + (active ? 'bg-primary/15 text-foreground' : 'hover:bg-muted/60 text-foreground')
        + (indented ? ' ml-3' : '')
      }
      onClick={onClick}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          {error && <AlertCircle className="h-3.5 w-3.5 text-destructive flex-shrink-0" />}
          {fetching && <Loader2 className="h-3.5 w-3.5 animate-spin flex-shrink-0" />}
          <span className="truncate font-medium flex-1 min-w-0">{title}</span>
          {/* 刷新图标：标题右侧 */}
          {onRefresh && (
            <button
              type="button"
              className="flex-shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary p-0.5 transition-opacity"
              title="拉取更新"
              onClick={(e) => { e.stopPropagation(); onRefresh(); }}
              disabled={fetching}
            >
              <RefreshCw className={'h-3.5 w-3.5 ' + (fetching ? 'animate-spin' : '')} />
            </button>
          )}
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
    </div>
  );
}
