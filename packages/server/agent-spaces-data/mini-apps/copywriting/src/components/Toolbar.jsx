import { useEffect, useMemo, useState } from 'react';

const {
  Button, Plus, Settings, Tabs, TabsList, TabsTrigger, Select, SelectContent,
  SelectItem, SelectTrigger, SelectValue, Textarea, Slider, Input, Badge, Popover, PopoverContent,
  PopoverTrigger, ScrollArea, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Checkbox,
} = window.AgentSpacesUI;
const { Search, Filter, X, Library, Trash2, PlusCircle, Sparkles } = window.AgentSpacesUI;

function normalizeText(value) {
  return String(value || '').trim();
}

export default function Toolbar({
  total,
  onNew,
  onOpenSettings,
  filter,
  onFilterChange,
  onClearFilter,
  viewMode,
  onViewModeChange,
  referenceGroups,
  selectedGroupId,
  onSelectedGroupIdChange,
  creationAgentMeta,
  creationAgentLabel,
  onPickAgent,
  creationInput,
  onCreationInputChange,
  creationOutputCount,
  onCreationOutputCountChange,
  creationGroupIds,
  referenceItems,
  onRunCreation,
  onOpenGroupDialog,
}) {
  const hasFilter = filter.keyword || filter.type || filter.tag || filter.durationSort;
  const selectedGroup = referenceGroups.find((group) => group.id === selectedGroupId) || null;
  const selectedReferenceItems = useMemo(
    () => referenceItems.filter((item) => creationGroupIds.includes(item.groupId)),
    [referenceItems, creationGroupIds],
  );
  const [popoverOpen, setPopoverOpen] = useState(false);

  useEffect(() => {
    if (!selectedGroupId && referenceGroups.length > 0) {
      onSelectedGroupIdChange(referenceGroups[0].id);
    }
  }, [referenceGroups, selectedGroupId, onSelectedGroupIdChange]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">文案管理</h1>
          {total > 0 && <span className="text-sm text-muted-foreground">共 {total} 条</span>}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={onOpenSettings} title="存储设置">
            <Settings className="size-4" />
          </Button>
          <Button onClick={onNew}>
            <Plus className="size-4" />新建文案
          </Button>
        </div>
      </div>

      <Tabs value={viewMode} onValueChange={onViewModeChange}>
        <div className="space-y-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="manage" className="w-full">文案管理</TabsTrigger>
            <TabsTrigger value="create" className="w-full">创作模式</TabsTrigger>
          </TabsList>

          <div className="flex items-center justify-end">
            {viewMode === 'manage' && (
              <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
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
          </div>
        </div>

        <div className="mt-3">
          {viewMode === 'create' && (
            <div className="space-y-3 rounded-lg border bg-card p-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-48 flex-1">
                  <div className="text-xs text-muted-foreground">分组</div>
                  <Select value={selectedGroupId} onValueChange={onSelectedGroupIdChange}>
                    <SelectTrigger className="mt-1 h-9">
                      <SelectValue placeholder="选择分组" />
                    </SelectTrigger>
                    <SelectContent>
                      {referenceGroups.map((group) => (
                        <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="outline" size="sm" onClick={onOpenGroupDialog}>
                  <Library className="size-4" />管理分组
                </Button>
                <Button variant="outline" size="sm" onClick={onPickAgent}>
                  <Sparkles className="size-4" />
                  {creationAgentLabel || creationAgentMeta?.name || '选择 agent'}
                </Button>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>参考文案列表</span>
                  <span>{selectedReferenceItems.length} 条</span>
                </div>
                <div className="mt-2 max-h-40 overflow-auto rounded-md border bg-background p-2">
                  {selectedReferenceItems.length === 0 ? (
                    <div className="py-8 text-center text-xs text-muted-foreground">暂无参考文案</div>
                  ) : (
                    <div className="space-y-2">
                      {selectedReferenceItems.map((item) => (
                        <div key={`${item.groupId}-${item.id}`} className="rounded-md border p-2 text-xs">
                          <div className="font-medium">{item.title}</div>
                          <div className="mt-1 line-clamp-2 text-muted-foreground">{item.preview}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <div className="text-xs text-muted-foreground">要求输入</div>
                <Textarea
                  value={normalizeText(creationInput)}
                  onChange={(e) => onCreationInputChange(e.target.value)}
                  placeholder="输入创作要求"
                  className="mt-1 min-h-28"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>输出文案数量</span>
                  <span>{creationOutputCount}</span>
                </div>
                <Slider
                  value={[creationOutputCount]}
                  min={1}
                  max={5}
                  step={1}
                  onValueChange={(value) => onCreationOutputCountChange(value[0] || 1)}
                />
              </div>

              <div className="flex items-center justify-between gap-2">
                <Button variant="outline" size="sm" onClick={onOpenGroupDialog}>
                  <PlusCircle className="size-4" />新建/编辑分组
                </Button>
                <Button onClick={onRunCreation} disabled={!creationAgentMeta || !selectedGroup || !normalizeText(creationInput)}>
                  <Sparkles className="size-4" />开始生成
                </Button>
              </div>
            </div>
          )}
        </div>
      </Tabs>
    </div>
  );
}
