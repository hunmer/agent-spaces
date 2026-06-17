import { useEffect, useMemo } from 'react';

const {
  Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Textarea, Slider,
} = window.AgentSpacesUI;
const { Library, PlusCircle, Sparkles } = window.AgentSpacesUI;

function normalizeText(value) {
  return String(value || '').trim();
}

export default function CreationPanel({
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
  const selectedGroup = referenceGroups.find((group) => group.id === selectedGroupId) || null;
  const selectedReferenceItems = useMemo(
    () => referenceItems.filter((item) => creationGroupIds.includes(item.groupId)),
    [referenceItems, creationGroupIds],
  );

  useEffect(() => {
    if (!selectedGroupId && referenceGroups.length > 0) {
      onSelectedGroupIdChange(referenceGroups[0].id);
    }
  }, [referenceGroups, selectedGroupId, onSelectedGroupIdChange]);

  return (
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
  );
}
