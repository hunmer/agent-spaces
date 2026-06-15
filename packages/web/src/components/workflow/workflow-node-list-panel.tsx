'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Play, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getNodeDefinition } from '@/lib/workflow-nodes';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { WorkflowNodeDefinitionIcon } from './workflow-node-icon';

type NodeLike = { id: string; type?: string; label?: string };
type EdgeLike = { source: string; target: string };

type WorkflowNodeListPanelProps = {
  nodes: NodeLike[];
  edges: EdgeLike[];
  selectedNodeId?: string | null;
  onSelectNode: (nodeId: string) => void;
  onDeleteGroup?: (nodeIds: string[]) => void;
  onTestNode?: (nodeId: string) => void;
  onExecuteWorkflow?: () => void;
  isExecuting?: boolean;
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
  selectedNodeId,
  onSelectNode,
  onDeleteGroup,
  onTestNode,
  onExecuteWorkflow,
  isExecuting = false,
}: WorkflowNodeListPanelProps) {
  const t = useTranslations('workflows');
  const [deleteTarget, setDeleteTarget] = useState<{ nodeIds: string[]; label: string } | null>(null);

  const { connectedGroups, isolatedNodes, nodeMap } = useMemo(() => {
    const map = new Map<string, NodeLike>();
    for (const node of nodes) map.set(node.id, node);

    const components = connectedComponents(nodes, edges);
    // 大小为 1 的分量 = 没有任何 edge 相连的孤立节点
    const connected = components.filter(group => group.length > 1);
    const isolated = components.filter(group => group.length === 1).flat();
    return { connectedGroups: connected, isolatedNodes: isolated, nodeMap: map };
  }, [nodes, edges]);

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

  const confirmDelete = () => {
    if (deleteTarget) onDeleteGroup?.(deleteTarget.nodeIds);
    setDeleteTarget(null);
  };

  return (
    <div className="flex h-full flex-col p-3">
      <div className="mb-2 border-b pb-2 text-xs text-muted-foreground">
        {nodes.length} {t('editor.nodeList.nodes')} · {connectedGroups.length} {t('editor.nodeList.groups')}
      </div>

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
