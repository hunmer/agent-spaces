import { useEffect, useMemo, useState } from 'react';

const {
  Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Textarea, Slider, ToggleGroup, ToggleGroupItem,
} = window.AgentSpacesUI;
const { Library, Sparkles, Trash2 } = window.AgentSpacesUI;

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
  onCancelCreation,
  onOpenGroupDialog,
  onRemoveReferenceItem,
  onClearReferenceItems,
  creationRunning,
}) {
  const [sourceMode, setSourceMode] = useState('group');
  const useKnowledgeBase = sourceMode === 'knowledge';
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
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          type="single"
          value={sourceMode}
          onValueChange={(value) => value && setSourceMode(value)}
          disabled={creationRunning}
          className="shrink-0"
        >
          <ToggleGroupItem value="group" className="h-9 px-3 text-xs">使用分组</ToggleGroupItem>
          <ToggleGroupItem value="knowledge" className="h-9 px-3 text-xs">使用知识库</ToggleGroupItem>
        </ToggleGroup>
        {!useKnowledgeBase && (
          <>
            <div className="min-w-48 flex-1">
              <div className="text-xs text-muted-foreground">分组</div>
              <Select
                value={selectedGroupId}
                onValueChange={onSelectedGroupIdChange}
                disabled={creationRunning}
                items={referenceGroups.map((group) => ({ value: group.id, label: group.name }))}
              >
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
            <Button variant="outline" size="sm" onClick={onOpenGroupDialog} disabled={creationRunning}>
              <Library className="size-4" />管理分组
            </Button>
          </>
        )}
        <Button variant="outline" size="sm" onClick={onPickAgent} disabled={creationRunning}>
          <Sparkles className="size-4" />
          {creationAgentLabel || creationAgentMeta?.name || '选择 agent'}
        </Button>
      </div>

      {!useKnowledgeBase && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>参考文案列表</span>
            <div className="flex items-center gap-2">
              <span>{selectedReferenceItems.length} 条</span>
              {selectedReferenceItems.length > 0 && (
                <Button size="sm" variant="ghost" className="h-6 gap-1 px-2 text-xs" onClick={onClearReferenceItems}>
                  <Trash2 className="size-3" />清空
                </Button>
              )}
            </div>
          </div>
          <div className="mt-2 min-h-0 flex-1 overflow-auto rounded-md border bg-background p-2">
            {selectedReferenceItems.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">暂无参考文案</div>
            ) : (
              <div className="space-y-2">
                {selectedReferenceItems.map((item) => (
                  <div key={`${item.groupId}-${item.id}`} className="rounded-md border p-2 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium">{item.title}</div>
                      <button
                        type="button"
                        onClick={() => onRemoveReferenceItem(item.id)}
                        className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                        aria-label="删除"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                    <div className="mt-1 line-clamp-2 text-muted-foreground">{item.preview}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div>
        <div className="text-xs text-muted-foreground">要求输入</div>
        <Textarea
          value={creationInput}
          onChange={(e) => onCreationInputChange(e.target.value)}
          placeholder="输入创作要求"
          className="mt-1 min-h-28"
          disabled={creationRunning}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>输出文案数量</span>
          <span>{creationOutputCount}</span>
        </div>
        <Slider
          value={creationOutputCount}
          min={1}
          max={5}
          step={1}
          disabled={creationRunning}
          onValueChange={(value) => {
            const next = Array.isArray(value) ? value[0] : value;
            onCreationOutputCountChange(next);
          }}
        />
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button
          onClick={creationRunning ? onCancelCreation : onRunCreation}
          variant={creationRunning ? 'outline' : 'default'}
          disabled={!creationRunning && (!creationAgentMeta || !selectedGroup)}
        >
          <Sparkles className="size-4" />{creationRunning ? '取消生成' : '开始生成'}
        </Button>
      </div>
    </div>
  );
}
