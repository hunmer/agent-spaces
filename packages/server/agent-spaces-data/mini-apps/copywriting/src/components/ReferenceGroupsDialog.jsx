import { useEffect, useState } from 'react';

const {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Button, Input, ScrollArea, Checkbox,
} = window.AgentSpacesUI;
const { Plus, PencilLine, Trash2 } = window.AgentSpacesUI;

export default function ReferenceGroupsDialog({
  open,
  onOpenChange,
  groups,
  currentItemId,
  onSaveGroups,
}) {
  const [draftGroups, setDraftGroups] = useState(groups);
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);

  useEffect(() => {
    if (!open) return;
    setDraftGroups(groups);
    setName('');
    setEditingId('');
    setSelectedIds(
      currentItemId
        ? groups.filter((group) => group.itemIds.some((id) => String(id) === String(currentItemId))).map((group) => group.id)
        : [],
    );
  }, [open, groups, currentItemId]);

  const saveGroups = async (nextGroups) => {
    setDraftGroups(nextGroups);
    await onSaveGroups(nextGroups);
  };

  const upsertGroup = async () => {
    const groupName = name.trim();
    if (!groupName) return;
    const next = editingId
      ? draftGroups.map((group) => (group.id === editingId ? { ...group, name: groupName } : group))
      : [...draftGroups, { id: `group-${Date.now()}`, name: groupName, itemIds: [] }];
    setName('');
    setEditingId('');
    await saveGroups(next);
  };

  const removeGroup = async (groupId) => {
    await saveGroups(draftGroups.filter((group) => group.id !== groupId));
  };

  const toggleSelected = (groupId) => {
    setSelectedIds((prev) => (prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId]));
  };

  const confirmMemberShip = async () => {
    if (!currentItemId) return onOpenChange(false);
    const next = draftGroups.map((group) => ({
      ...group,
      itemIds: selectedIds.includes(group.id)
        ? Array.from(new Set([...group.itemIds, currentItemId]))
        : group.itemIds.filter((id) => String(id) !== String(currentItemId)),
    }));
    await saveGroups(next);
    onOpenChange(false);
  };

  const startEdit = (group) => {
    setEditingId(group.id);
    setName(group.name);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{currentItemId ? '添加到参考列表' : '参考列表分组管理'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="新建或编辑分组名称" className="h-8" />
            <Button size="sm" onClick={upsertGroup}>
              <Plus className="size-4" />保存
            </Button>
          </div>
          <ScrollArea className="h-72">
            {draftGroups.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">暂无分组，请在上方新建</div>
            ) : (
              <div className="space-y-2">
                {draftGroups.map((group) => (
                  <div key={group.id} className="flex items-center gap-2 rounded-md border p-2">
                    {currentItemId && (
                      <Checkbox
                        checked={selectedIds.includes(group.id)}
                        onCheckedChange={() => toggleSelected(group.id)}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{group.name}</div>
                      <div className="text-xs text-muted-foreground">{group.itemIds.length} 条文案</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" onClick={() => startEdit(group)} title="编辑分组">
                        <PencilLine className="size-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => removeGroup(group.id)} title="删除分组">
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>关闭</Button>
          {currentItemId && <Button onClick={confirmMemberShip}>确认添加</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
