const {
  Button, Plus, Settings, Tabs, TabsList, TabsTrigger, Input, Badge,
  Popover, PopoverContent, PopoverTrigger,
} = window.AgentSpacesUI;
const { Search, Filter, X } = window.AgentSpacesUI;

export default function Toolbar({
  total,
  onNew,
  onOpenSettings,
  filter,
  onFilterChange,
  onClearFilter,
  viewMode,
  onViewModeChange,
}) {
  const hasFilter = filter.keyword || filter.type || filter.tag || filter.durationSort;

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <Tabs value={viewMode} onValueChange={onViewModeChange}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="manage" className="w-full">文案管理</TabsTrigger>
          <TabsTrigger value="create" className="w-full">创作模式</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex items-center gap-2">
        {total > 0 && <span className="text-sm text-muted-foreground">共 {total} 条</span>}
        {viewMode === 'manage' && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <Filter className="size-4" />筛选
                {hasFilter && <Badge variant="secondary" className="ml-1">已启用</Badge>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-3" align="end">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">筛选</div>
                  {hasFilter && (
                    <Button size="sm" variant="ghost" className="h-7" onClick={onClearFilter}>
                      <X className="size-3.5" />清除
                    </Button>
                  )}
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">关键词</div>
                  <div className="relative mt-1">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                    <Input
                      value={filter.keyword}
                      onChange={(e) => onFilterChange({ ...filter, keyword: e.target.value })}
                      placeholder="搜索标题/内容"
                      className="h-8 pl-7"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant={filter.type === '' ? 'default' : 'outline'} size="sm" onClick={() => onFilterChange({ ...filter, type: '' })}>全部</Button>
                  <Button variant={filter.type === 'text' ? 'default' : 'outline'} size="sm" onClick={() => onFilterChange({ ...filter, type: 'text' })}>文本</Button>
                  <Button variant={filter.type === 'audio' ? 'default' : 'outline'} size="sm" onClick={() => onFilterChange({ ...filter, type: 'audio' })}>音频</Button>
                  <Button variant={filter.type === 'video' ? 'default' : 'outline'} size="sm" onClick={() => onFilterChange({ ...filter, type: 'video' })}>视频</Button>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">标签</div>
                  <Input
                    value={filter.tag}
                    onChange={(e) => onFilterChange({ ...filter, tag: e.target.value })}
                    placeholder="输入标签"
                    className="mt-1 h-8"
                  />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">时长排序</div>
                  <div className="mt-1 grid grid-cols-3 gap-2">
                    <Button variant={filter.durationSort === '' ? 'default' : 'outline'} size="sm" onClick={() => onFilterChange({ ...filter, durationSort: '' })}>默认</Button>
                    <Button variant={filter.durationSort === 'asc' ? 'default' : 'outline'} size="sm" onClick={() => onFilterChange({ ...filter, durationSort: 'asc' })}>短到长</Button>
                    <Button variant={filter.durationSort === 'desc' ? 'default' : 'outline'} size="sm" onClick={() => onFilterChange({ ...filter, durationSort: 'desc' })}>长到短</Button>
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        )}
        <Button variant="outline" size="icon" onClick={onOpenSettings} title="存储设置">
          <Settings className="size-4" />
        </Button>
        <Button onClick={onNew}>
          <Plus className="size-4" />新建文案
        </Button>
      </div>
    </div>
  );
}
