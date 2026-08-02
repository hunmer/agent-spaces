// 节点管理 tab：参考 packages/web/.../workflow-node-list-panel.tsx 重构。
//
// 核心能力：
// 1. 两种分组展示模式（顶部切换）：
//    - connection：按连线关系自动分组（Union-Find 连通分量），无连线归入「未连接」。
//    - group：按画布上的分组（groups[].childNodeIds）展示，无归属节点归入「未分组」。
// 2. 节点行升级：图标/标签/类型徽章 + 状态徽章（生成中/出错/产出张数）+ hover 显示定位/删除按钮 + 选中高亮。
//
// 搜索仍走 SearchBar（拼音匹配）；搜索态下跨分组扁平展示匹配节点（与两模式一致）。
// 分组算法见 constants.js 的 connectedComponents。
import { useMemo, useState } from 'react';
import { ScrollArea, Crosshair, Trash2 } from '@agent-spaces/ui';
import { NODE_META } from '../../utils/constants';
import { matchText, SearchBar } from './search';
import { GROUP_PALETTE, connectedComponents } from './constants';

const MODE_OPTIONS = [
  { id: 'connection', label: '连线' },
  { id: 'group', label: '分组' },
];

/**
 * @param {Object} props
 * @param {Array} props.nodes
 * @param {Array} props.edges            连线，用于连通分量计算
 * @param {Array} [props.groups]         画布分组列表（{id,name,childNodeIds,...}），分组模式用
 * @param {string|null} [props.selectedNodeId] 当前选中节点 id，用于高亮
 * @param {(id:string)=>void} props.onSelectNode
 * @param {(id:string)=>void} props.onLocateNode
 * @param {(id:string)=>void} props.onDeleteNode
 */
export default function NodeManageTab({
  nodes, edges, groups, selectedNodeId,
  onSelectNode, onLocateNode, onDeleteNode,
}) {
  const [query, setQuery] = useState('');
  // 分组展示模式：connection（连线连通分量）/ group（画布分组）。无分组数据时仍可切，会回退到连线视图。
  const [mode, setMode] = useState('connection');

  const nodeMap = useMemo(() => {
    const m = new Map();
    for (const n of nodes) m.set(n.id, n);
    return m;
  }, [nodes]);

  // 连线模式：连通分量，size>1 是「连线分组」，size==1 flatten 后是「未连接」孤立节点。
  const connectionView = useMemo(() => {
    const components = connectedComponents(nodes, edges || []);
    const connected = components.filter((g) => g.length > 1);
    const isolated = components.filter((g) => g.length === 1).flat();
    return { sections: connected, isolated };
  }, [nodes, edges]);

  // 分组模式：按 groups[].childNodeIds 切分；一个节点只属于一个分组（与画布一致）。
  // 已归组的节点从池子剔除，剩余进「未分组」。
  const groupView = useMemo(() => {
    const grouped = new Set();
    const sections = (groups || [])
      .map((g) => {
        const ids = (g.childNodeIds || []).filter((id) => nodeMap.has(id) && !grouped.has(id));
        ids.forEach((id) => grouped.add(id));
        return { id: g.id, name: g.name, ids };
      })
      .filter((g) => g.ids.length > 0);
    const isolated = nodes.filter((n) => !grouped.has(n.id)).map((n) => n.id);
    return { sections, isolated };
  }, [nodes, groups, nodeMap]);

  const hasQuery = query.trim().length > 0;
  const matchNode = (n) => matchText((NODE_META[n.type] || { label: n.type }).label, query);

  // 命中搜索时，跨分组扁平展示匹配节点（与 AddNodeTab/HistoryTab 的「搜索跨分类」策略一致）。
  const filteredNodes = useMemo(
    () => (hasQuery ? nodes.filter(matchNode) : null),
    [nodes, hasQuery, query],
  );

  const view = mode === 'group' ? groupView : connectionView;
  // 顶部统计：节点总数 · 分区数（连线模式=连通分量数，分组模式=画布分组数）
  const headerStat = `${nodes.length} 节点 · ${view.sections.length} ${mode === 'group' ? '分组' : '分组'}`;

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

  // 复用的分区渲染：色条 + 标题 + 计数 + 节点列表。section = { id, name, ids, colorOverride? }
  const renderSection = (section, index, colorOverride) => {
    const color = colorOverride || GROUP_PALETTE[index % GROUP_PALETTE.length];
    const ids = section.ids || section; // 兼容旧结构（数组直接是 id 列表）
    const name = section.name || labelForFirstNode(nodeMap, ids);
    return (
      <div key={section.id || ids.join('|')} className={`group rounded ${color.bg}`}>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <span className={`h-3 w-1 shrink-0 rounded-full ${color.bar}`} />
          <span className="truncate text-xs font-medium">{name}</span>
          <span className="shrink-0 text-xs text-muted-foreground">({ids.length})</span>
        </div>
        <div className="space-y-0.5 px-1 pb-1">{ids.map(renderNode)}</div>
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SearchBar value={query} onChange={setQuery} placeholder="搜索节点（支持拼音）" />
      {/* 模式切换 + 统计条 */}
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <div className="flex items-center gap-0.5">
          {MODE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setMode(opt.id)}
              className={
                'rounded px-2 py-0.5 text-xs transition ' +
                (mode === opt.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground')
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
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

        {/* 默认模式：按当前分组方式分区展示 */}
        {!hasQuery && (
          <div className="space-y-2 p-2">
            {view.sections.map((section, index) => renderSection(section, index))}

            {/* 未连接 / 未分组节点（中性灰） */}
            {view.isolated.length > 0 && (
              <div className="rounded bg-muted/40">
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <span className="h-3 w-1 shrink-0 rounded-full bg-muted-foreground/40" />
                  <span className="text-xs font-medium">{mode === 'group' ? '未分组' : '未连接'}</span>
                  <span className="text-xs text-muted-foreground">({view.isolated.length})</span>
                </div>
                <div className="space-y-0.5 px-1 pb-1">{view.isolated.map(renderNode)}</div>
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

// 连线模式没有分组名，取组内第一个节点的类型标签作为代表（与重构前行为一致）。
function labelForFirstNode(nodeMap, ids) {
  const startNode = ids[0] && nodeMap.get(ids[0]);
  return startNode ? (NODE_META[startNode.type] || { label: startNode.type }).label : (ids[0] || '');
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
