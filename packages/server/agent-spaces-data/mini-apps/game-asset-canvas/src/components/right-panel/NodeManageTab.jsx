// 节点管理 tab：参考 packages/web/.../workflow-node-list-panel.tsx 重构。
//
// 核心能力：
// 1. 连通分量自动分组（Union-Find）：有连线关系的节点归到同一色块分组，无连线的归入「未连接」。
// 2. 节点行升级：图标/标签/类型徽章 + 状态徽章（生成中/出错/产出张数）+ hover 显示定位/删除按钮 + 选中高亮。
//
// 搜索仍走 SearchBar（拼音匹配）。分组算法见 constants.js 的 connectedComponents。
import { useMemo, useState } from 'react';
import { ScrollArea, Crosshair, Trash2 } from '@agent-spaces/ui';
import { NODE_META } from '../../utils/constants';
import { matchText, SearchBar } from './search';
import { GROUP_PALETTE, connectedComponents } from './constants';

/**
 * @param {Object} props
 * @param {Array} props.nodes
 * @param {Array} props.edges            连线，用于连通分量计算
 * @param {string|null} [props.selectedNodeId] 当前选中节点 id，用于高亮
 * @param {(id:string)=>void} props.onSelectNode
 * @param {(id:string)=>void} props.onLocateNode
 * @param {(id:string)=>void} props.onDeleteNode
 */
export default function NodeManageTab({
  nodes, edges, selectedNodeId,
  onSelectNode, onLocateNode, onDeleteNode,
}) {
  const [query, setQuery] = useState('');

  const nodeMap = useMemo(() => {
    const m = new Map();
    for (const n of nodes) m.set(n.id, n);
    return m;
  }, [nodes]);

  // 连通分量：size>1 是「连线分组」，size==1 flatten 后是「未连接」孤立节点。
  const { connectedGroups, isolatedNodes } = useMemo(() => {
    const components = connectedComponents(nodes, edges || []);
    const connected = components.filter((g) => g.length > 1);
    const isolated = components.filter((g) => g.length === 1).flat();
    return { connectedGroups: connected, isolatedNodes: isolated };
  }, [nodes, edges]);

  const hasQuery = query.trim().length > 0;
  const matchNode = (n) => matchText((NODE_META[n.type] || { label: n.type }).label, query);

  // 命中搜索时，跨分组扁平展示匹配节点（与 AddNodeTab/HistoryTab 的「搜索跨分类」策略一致）。
  const filteredNodes = useMemo(
    () => (hasQuery ? nodes.filter(matchNode) : null),
    [nodes, hasQuery, query],
  );

  // 顶部统计：节点总数 · 连线分组数
  const headerStat = `${nodes.length} 节点 · ${connectedGroups.length} 分组`;

  const renderNode = (id) => {
    const node = nodeMap.get(id);
    if (!node) return null;
    return (
      <NodeRow
        key={id}
        node={node}
        active={selectedNodeId === id}
        onSelectNode={onSelectNode}
        onLocateNode={onLocateNode}
        onDeleteNode={onDeleteNode}
      />
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SearchBar value={query} onChange={setQuery} placeholder="搜索节点（支持拼音）" />
      {/* 顶部统计条 */}
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <span className="truncate text-xs text-muted-foreground">{headerStat}</span>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {/* 搜索模式：扁平展示匹配节点 */}
        {hasQuery && (
          <div className="space-y-0.5 p-2">
            {filteredNodes.map((n) => (
              <NodeRow
                key={n.id}
                node={n}
                active={selectedNodeId === n.id}
                onSelectNode={onSelectNode}
                onLocateNode={onLocateNode}
                onDeleteNode={onDeleteNode}
              />
            ))}
            {filteredNodes.length === 0 && (
              <p className="px-2 py-8 text-center text-xs text-muted-foreground">未找到匹配节点</p>
            )}
          </div>
        )}

        {/* 默认模式：按连通分量分组展示 */}
        {!hasQuery && (
          <div className="space-y-2 p-2">
            {connectedGroups.map((group, index) => {
              const color = GROUP_PALETTE[index % GROUP_PALETTE.length];
              // 分组标题：取组内第一个节点的标签作为代表
              const startNodeId = group[0];
              const startNode = nodeMap.get(startNodeId);
              const groupLabel = startNode
                ? (NODE_META[startNode.type] || { label: startNode.type }).label
                : startNodeId;
              return (
                <div key={group.join('|')} className={`group rounded ${color.bg}`}>
                  <div className="flex items-center gap-2 px-2 py-1.5">
                    <span className={`h-3 w-1 shrink-0 rounded-full ${color.bar}`} />
                    <span className="truncate text-xs font-medium">{groupLabel}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">({group.length})</span>
                  </div>
                  <div className="space-y-0.5 px-1 pb-1">{group.map(renderNode)}</div>
                </div>
              );
            })}

            {/* 未连接节点 */}
            {isolatedNodes.length > 0 && (
              <div className="rounded bg-muted/40">
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <span className="h-3 w-1 shrink-0 rounded-full bg-muted-foreground/40" />
                  <span className="text-xs font-medium">未连接</span>
                  <span className="text-xs text-muted-foreground">({isolatedNodes.length})</span>
                </div>
                <div className="space-y-0.5 px-1 pb-1">{isolatedNodes.map(renderNode)}</div>
              </div>
            )}

            {nodes.length === 0 && (
              <p className="px-2 py-8 text-center text-xs text-muted-foreground">画布暂无节点</p>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

/**
 * 单个节点行：参考 workflow-node-list-panel.tsx 的 NodeListItemRow。
 * 第一行：图标 / 标签 / 类型徽章 / hover 显示定位+删除按钮
 * 第二行（有内容时）：状态徽章（生成中/出错/产出张数）
 */
function NodeRow({ node, active, onSelectNode, onLocateNode, onDeleteNode }) {
  const meta = NODE_META[node.type] || { icon: '🔹', label: node.type };
  const status = node.data?.status;
  const imgCount = node.data?.output?.images?.length || node.data?.images?.length || 0;
  // 状态徽章文案与配色
  let statusBadge = null;
  if (status === 'running') {
    statusBadge = { text: '生成中', cls: 'bg-amber-500/15 text-amber-600' };
  } else if (status === 'error') {
    statusBadge = { text: '出错', cls: 'bg-red-500/15 text-red-600' };
  } else if (imgCount > 0) {
    statusBadge = { text: `${imgCount} 张图`, cls: 'bg-muted text-muted-foreground' };
  }

  return (
    <div
      className={
        'group/node nodrag nopan nowheel flex w-full cursor-pointer flex-col gap-1 rounded px-2 py-1.5 transition hover:bg-accent/60 ' +
        (active ? 'bg-accent' : '')
      }
      onClick={() => onSelectNode?.(node.id)}
    >
      {/* 第一行：图标 / 标签 / 类型徽章 / 操作 */}
      <div className="flex w-full items-center gap-2">
        <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-sm">{meta.icon}</span>
        <span className="min-w-0 flex-1 truncate text-xs">{meta.label}</span>
        {/* 跳转到节点（定位画布） */}
        <button
          type="button"
          className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition hover:bg-accent hover:text-primary group-hover/node:opacity-100"
          onClick={(e) => { e.stopPropagation(); onLocateNode?.(node.id); }}
          title="在画布定位"
        >
          <Crosshair className="h-3.5 w-3.5" />
        </button>
        {/* 删除节点 */}
        <button
          type="button"
          className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition hover:bg-accent hover:text-destructive group-hover/node:opacity-100"
          onClick={(e) => { e.stopPropagation(); onDeleteNode?.(node.id); }}
          title="删除节点"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {/* 第二行：状态徽章（仅有内容时显示） */}
      {statusBadge && (
        <div className="flex w-full items-center gap-1 pl-[22px]">
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${statusBadge.cls}`}>
            {statusBadge.text}
          </span>
        </div>
      )}
    </div>
  );
}
