const {
  Button, Input, Badge, Loader2,
  Plus, RefreshCw, Settings, Star, Rss,
} = window.AgentSpacesUI;
const { useState } = React;

export function Toolbar({
  counts, fetchingAll, agentMeta,
  onAdd, onFetchAll, onConfigureAgent,
  filter, onFilterChange, error, toast,
}) {
  const [url, setUrl] = useState('');
  const submitting = fetchingAll;

  const submit = (e) => {
    e.preventDefault();
    if (!url.trim()) return;
    onAdd(url.trim()).then((ok) => { if (ok) setUrl(''); });
  };

  return (
    <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-2 flex-wrap">
      <div className="flex items-center gap-1.5 mr-1">
        <Rss className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">RSS 阅读器</span>
        <Badge variant="secondary" className="ml-1">{counts.total}</Badge>
      </div>

      <form onSubmit={submit} className="flex items-center gap-1.5 flex-1 min-w-[200px]">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="粘贴订阅源 URL，回车添加"
          className="h-8 text-sm"
        />
        <Button type="submit" size="sm" className="h-8" disabled={submitting}>
          <Plus className="h-4 w-4" /> 添加
        </Button>
      </form>

      <Button
        variant={filter === 'favorite' ? 'default' : 'outline'}
        size="sm"
        className="h-8"
        onClick={() => onFilterChange(filter === 'favorite' ? 'all' : 'favorite')}
        title="只看收藏"
      >
        <Star className="h-4 w-4" />
        <span className="hidden sm:inline ml-1">收藏</span>
        {counts.favorite > 0 && (
          <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{counts.favorite}</Badge>
        )}
      </Button>

      <Button
        variant="outline"
        size="sm"
        className="h-8"
        onClick={onFetchAll}
        disabled={submitting}
      >
        {fetchingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        <span className="hidden sm:inline ml-1">拉取全部</span>
      </Button>

      <Button
        variant="outline"
        size="sm"
        className="h-8"
        onClick={onConfigureAgent}
        title="配置 AI 模型"
      >
        <Settings className="h-4 w-4" />
        <span className="hidden sm:inline ml-1 max-w-[120px] truncate">
          {agentMeta?.name || '配置 AI'}
        </span>
      </Button>

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
