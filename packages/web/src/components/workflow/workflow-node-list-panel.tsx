'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Lock, Pencil, Play, Trash2, Unlock, X } from 'lucide-react';
import type { WorkflowGroup } from '@agent-spaces/shared';
import { cn } from '@/lib/utils';
import { getNodeDefinition } from '@/lib/workflow-nodes';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WorkflowNodeDefinitionIcon } from './workflow-node-icon';

type NodeLike = { id: string; type?: string; label?: string };
type EdgeLike = { source: string; target: string };

type GroupViewMode = 'connected' | 'named';

type WorkflowNodeListPanelProps = {
  nodes: NodeLike[];
  edges: EdgeLike[];
  groups?: WorkflowGroup[];
  selectedNodeId?: string | null;
  isReadOnly?: boolean;
  onSelectNode: (nodeId: string) => void;
  onDeleteGroup?: (nodeIds: string[]) => void;
  onTestNode?: (nodeId: string) => void;
  onExecuteWorkflow?: () => void;
  isExecuting?: boolean;
  // 命名分组管理（迁自 WorkflowGroupManagePanel）
  onRenameGroup?: (groupId: string, name: string) => void;
  onUngroup?: (groupId: string) => void;
  onBatchUngroup?: (groupIds: string[]) => void;
  onFocusGroup?: (groupId: string) => void;
};

// 连通分量着色板 —— bar 为色条实色，bg 为分区淡色背景。完整类名，供 Tailwind 静态扫描。
const GROUP_PALETTE = [
  { bar: 'bg-blue-500', bg: 'bg-blue-500/10' },
  { bar: 'bg-emerald-500', bg: 'bg-emerald-500/10' },
  { bar: 'bg-amber-500', bg: 'bg-amber-500/10' },
  { bar: 'bg-purple-500', bg: 'bg-purple-500/10' },
  { bar: 'bg-rose-500', bg: 'bg-rose-500/10' },
  { bar: 'bg-cyan-500', bg: 'bg-cyan-500/10' },
  { bar: 'bg-orange-500', bg: 'bg-orange-500/10' },
  { bar: 'bg-pink-500', bg: 'bg-pink-500/10' },
];

/** Union-Find 求无向连通分量，返回每个分量包含的节点 id 列表。 */
function connectedComponents(nodes: NodeLike[], edges: EdgeLike[]): string[][] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let cur = x;
    while (parent.get(cur) !== cur) {
      parent.set(cur, parent.get(parent.get(cur) as string) as string);
      cur = parent.get(cur) as string;
    }
    return cur;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const node of nodes) parent.set(node.id, node.id);
  for (const edge of edges) {
    if (parent.has(edge.source) && parent.has(edge.target)) union(edge.source, edge.target);
  }

  const buckets = new Map<string, string[]>();
  for (const node of nodes) {
    const root = find(node.id);
    const list = buckets.get(root);
    if (list) list.push(node.id);
    else buckets.set(root, [node.id]);
  }
  return [...buckets.values()];
}

export function WorkflowNodeListPanel({
  nodes,
  edges,
  groups,
  selectedNodeId,
  isReadOnly = false,
  onSelectNode,
  onDeleteGroup,
  onTestNode,
  onExecuteWorkflow,
  isExecuting = false,
  onRenameGroup,
  onUngroup,
  onBatchUngroup,
  onFocusGroup,
}: WorkflowNodeListPanelProps) {
  const t = useTranslations('workflows');
  const [viewMode, setViewMode] = useState<GroupViewMode>('connected');
  const [deleteTarget, setDeleteTarget] = useState<{ nodeIds: string[]; label: string } | null>(null);

  // 命名分组内联重命名 + 多选解散
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);

  const { connectedGroups, isolatedNodes, nodeMap } = useMemo(() => {
    const map = new Map<string, NodeLike>();
    for (const node of nodes) map.set(node.id, node);

    const components = connectedComponents(nodes, edges);
    // 大小为 1 的分量 = 没有任何 edge 相连的孤立节点
    const connected = components.filter(group => group.length > 1);
    const isolated = components.filter(group => group.length === 1).flat();
    return { connectedGroups: connected, isolatedNodes: isolated, nodeMap: map };
  }, [nodes, edges]);

  const namedGroups = useMemo(() => groups || [], [groups]);
  const removableSelectedGroupIds = useMemo(
    () => namedGroups
      .filter(group => selectedGroupIds.includes(group.id) && !group.locked)
      .map(group => group.id),
    [namedGroups, selectedGroupIds],
  );

  // 命名分组被删除/外部更新后，清理失效的选择与编辑态
  useEffect(() => {
    const existingIds = new Set(namedGroups.map(group => group.id));
    setSelectedGroupIds(ids => ids.filter(id => existingIds.has(id)));
    if (editingGroupId && !existingIds.has(editingGroupId)) {
      setEditingGroupId(null);
    }
  }, [editingGroupId, namedGroups]);

  const startEdit = (group: WorkflowGroup) => {
    if (isReadOnly) return;
    setEditingGroupId(group.id);
    setEditName(group.name);
  };

  const commitEdit = () => {
    if (!editingGroupId) return;
    const trimmed = editName.trim();
    if (trimmed) onRenameGroup?.(editingGroupId, trimmed);
    setEditingGroupId(null);
  };

  const cancelEdit = () => {
    setEditingGroupId(null);
    setEditName('');
  };

  const toggleSelect = (groupId: string) => {
    setSelectedGroupIds(ids => (
      ids.includes(groupId)
        ? ids.filter(id => id !== groupId)
        : [...ids, groupId]
    ));
  };

  const batchUngroup = () => {
    if (removableSelectedGroupIds.length === 0) return;
    onBatchUngroup?.(removableSelectedGroupIds);
    setSelectedGroupIds([]);
  };

  const renderNode = (id: string) => {
    const node = nodeMap.get(id);
    if (!node) return null;
    const label = node.label || node.type || id;
    const definition = node.type ? getNodeDefinition(node.type) : null;
    const active = selectedNodeId === id;
    return (
      <div
        key={id}
        className={cn(
          'group/node flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-accent/60',
          active && 'bg-accent',
        )}
        onClick={() => onSelectNode(id)}
      >
        <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-muted-foreground">
          <WorkflowNodeDefinitionIcon definition={definition} className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1 truncate text-xs">{label}</span>
        {node.type && (
          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {node.type}
          </span>
        )}
        {onTestNode && (
          <button
            type="button"
            className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-green-600 disabled:opacity-30 group-hover/node:opacity-100"
            title={t('editor.nodeList.run')}
            disabled={isExecuting}
            onClick={(event) => { event.stopPropagation(); onTestNode(id); }}
          >
            <Play className="h-3 w-3" />
          </button>
        )}
      </div>
    );
  };

  const renderNamedGroup = (group: WorkflowGroup) => {
    const isSelected = selectedGroupIds.includes(group.id);
    const isEditing = editingGroupId === group.id;
    return (
      <div
        key={group.id}
        className="group flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-accent/50"
        onClick={() => onFocusGroup?.(group.id)}
      >
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => toggleSelect(group.id)}
          onClick={(event) => event.stopPropagation()}
        />
        {group.locked
          ? <Lock className="h-3 w-3 shrink-0 opacity-50" />
          : <Unlock className="h-3 w-3 shrink-0 opacity-30" />}
        {isEditing ? (
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <Input
              value={editName}
              className="h-6 px-1 text-xs"
              onChange={(event) => setEditName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commitEdit();
                if (event.key === 'Escape') cancelEdit();
              }}
              onClick={(event) => event.stopPropagation()}
              autoFocus
            />
            <button type="button" className="p-0.5 hover:text-foreground" onClick={(event) => { event.stopPropagation(); commitEdit(); }}>
              <Check className="h-3 w-3" />
            </button>
            <button type="button" className="p-0.5 hover:text-foreground" onClick={(event) => { event.stopPropagation(); cancelEdit(); }}>
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <span className="min-w-0 flex-1 truncate text-xs">
            {group.name}
            <span className="text-muted-foreground"> ({group.childNodeIds.length})</span>
          </span>
        )}
        {!isReadOnly && !isEditing && (
          <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              title={t('editor.nodeList.rename')}
              onClick={(event) => { event.stopPropagation(); startEdit(group); }}
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              type="button"
              className="rounded p-1 text-destructive hover:bg-accent"
              title={t('editor.nodeList.ungroup')}
              disabled={group.locked}
              onClick={(event) => { event.stopPropagation(); onUngroup?.(group.id); }}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
    );
  };

  const confirmDelete = () => {
    if (deleteTarget) onDeleteGroup?.(deleteTarget.nodeIds);
    setDeleteTarget(null);
  };

  return (
    <div className="flex h-full flex-col p-3">
      <div className="mb-2 flex items-center justify-between gap-2 border-b pb-2">
        <Select value={viewMode} onValueChange={(value) => setViewMode(value as GroupViewMode)}>
          <SelectTrigger className="h-7 w-[150px] gap-1 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="connected">{t('editor.nodeList.modeConnected')}</SelectItem>
            <SelectItem value="named">{t('editor.nodeList.modeNamed')}</SelectItem>
          </SelectContent>
        </Select>
        <span className="shrink-0 text-xs text-muted-foreground">
          {viewMode === 'connected'
            ? (
              <>
                {nodes.length} {t('editor.nodeList.nodes')} · {connectedGroups.length} {t('editor.nodeList.groups')}
              </>
            )
            : <>{namedGroups.length} {t('editor.nodeList.groups')}</>
          }
        </span>
      </div>

      {viewMode === 'connected' && (
        <div className="min-h-0 flex-1 space-y-2 overflow-auto">
          {connectedGroups.map((group, index) => {
            const color = GROUP_PALETTE[index % GROUP_PALETTE.length];
            return (
              <div key={group.join('|')} className={cn('group rounded', color.bg)}>
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <span className={cn('h-3 w-1 rounded-full', color.bar)} />
                  <span className="text-xs font-medium">
                    {t('editor.nodeList.group')} {index + 1}
                  </span>
                  <span className="text-xs text-muted-foreground">({group.length})</span>
                  {(onExecuteWorkflow || onDeleteGroup) && (
                    <div className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      {onExecuteWorkflow && (
                        <button
                          type="button"
                          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-green-600 disabled:opacity-30"
                          title={t('editor.nodeList.run')}
                          disabled={isExecuting}
                          onClick={() => onExecuteWorkflow()}
                        >
                          <Play className="h-3 w-3" />
                        </button>
                      )}
                      {onDeleteGroup && (
                        <button
                          type="button"
                          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
                          title={t('editor.nodeList.deleteGroup')}
                          onClick={() =>
                            setDeleteTarget({
                              nodeIds: group,
                              label: `${t('editor.nodeList.group')} ${index + 1}`,
                            })
                          }
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div className="space-y-0.5 px-1 pb-1">{group.map(renderNode)}</div>
              </div>
            );
          })}

          {isolatedNodes.length > 0 && (
            <div className="rounded bg-muted/40">
              <div className="flex items-center gap-2 px-2 py-1.5">
                <span className="h-3 w-1 rounded-full bg-muted-foreground/40" />
                <span className="text-xs font-medium">{t('editor.nodeList.unconnected')}</span>
                <span className="text-xs text-muted-foreground">({isolatedNodes.length})</span>
              </div>
              <div className="space-y-0.5 px-1 pb-1">{isolatedNodes.map(renderNode)}</div>
            </div>
          )}

          {nodes.length === 0 && (
            <div className="py-8 text-center text-xs text-muted-foreground">
              {t('editor.nodeList.empty')}
            </div>
          )}
        </div>
      )}

      {viewMode === 'named' && (
        <div className="flex min-h-0 flex-1 flex-col">
          {selectedGroupIds.length > 0 && (
            <div className="mb-2 flex justify-end">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="h-6 px-2 text-xs"
                disabled={isReadOnly || removableSelectedGroupIds.length === 0}
                onClick={batchUngroup}
              >
                <Trash2 className="h-3 w-3" />
                {t('editor.nodeList.batchUngroup', { count: selectedGroupIds.length })}
              </Button>
            </div>
          )}
          <div className="min-h-0 flex-1 space-y-1 overflow-auto">
            {namedGroups.map(renderNamedGroup)}
            {namedGroups.length === 0 && (
              <div className="py-8 text-center text-xs text-muted-foreground">
                {t('editor.nodeList.noNamedGroups')}
              </div>
            )}
          </div>
        </div>
      )}

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('editor.nodeList.deleteTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t('editor.nodeList.deleteConfirm', {
              count: deleteTarget?.nodeIds.length ?? 0,
              group: deleteTarget?.label ?? '',
            })}
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>
              {t('editor.nodeList.cancel')}
            </Button>
            <Button variant="destructive" size="sm" onClick={confirmDelete}>
              {t('editor.nodeList.confirmDelete')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
