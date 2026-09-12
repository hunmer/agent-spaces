// 右侧面板容器：新增节点 / 节点预设 / 节点管理 / 生成记录 / 素材库，以及可选的宿主 Chat tab。
// 各 tab 的实现拆到同目录独立文件，本文件只做 Tabs 装配。
// tab 栏样式参考 organic-notch-tabs：激活按钮自身充当白色 pill，按钮内渲染「有机缺口」SVG
// 向下延伸搭在内容卡片上；按钮行与卡片放在同一个 filter: drop-shadow 容器里，
// 阴影只沿「按钮+缺口+卡片」合并后的外轮廓投影，衔接处零阴影，形成连成一体的剪影。
import { useCallback, useEffect, useRef, useState } from 'react';
import { Tabs, TabsContent, Plus, Boxes, History, Images, Bookmark, MessageSquareText } from '@agent-spaces/ui';
import AddNodeTab from './AddNodeTab';
import PresetsTab from './PresetsTab';
import NodeManageTab from './NodeManageTab';
import HistoryTab from './HistoryTab';
import AssetLibrary from '../AssetLibrary';
import { FLOATING_RADIUS } from '../floatingStyles';

// tab 定义 + 各自强调色：激活态图标着色、图标下方小圆点同色（参考项目的 per-tab 配色）。
const TAB_ITEMS = [
  { value: 'add', label: '新增节点', color: '#2563eb', Icon: Plus },
  { value: 'presets', label: '节点预设', color: '#65a30d', Icon: Bookmark },
  { value: 'nodes', label: '节点管理', color: '#9333ea', Icon: Boxes },
  { value: 'history', label: '生成记录', color: '#0d9488', Icon: History },
  { value: 'assets', label: '素材库', color: '#d97706', Icon: Images },
  { value: 'chat', label: 'Agent Chat', color: '#e11d48', Icon: MessageSquareText },
];

/**
 * @param {Object} props
 * @param {Array} props.nodes
 * @param {Array} [props.edges]              连线，传给节点管理做连通分量分组
 * @param {Array} [props.groups]             分组列表，传给生成记录做分组过滤
 * @param {string|null} [props.selectedNodeId] 当前选中节点 id，节点管理用于高亮
 * @param {(id:string)=>void} props.onSelectNode
 * @param {(id:string)=>void} props.onLocateNode
 * @param {(id:string)=>void} props.onDeleteNode
 * @param {(type:string)=>void} props.onAdd
 * @param {(type:string,e:object)=>void} props.onDragStartNode
 * @param {(type:string)=>void} props.onExecute
 * @param {Array} [props.presets]                 节点预设列表（全局共享）
 * @param {(presetId:string)=>void} [props.onAddPreset]            点击「+」实例化预设到视口中心
 * @param {(presetId:string,e:object)=>void} [props.onDragStartPreset]  预设卡片拖拽起始
 * @param {(presetId:string)=>void} [props.onDeletePreset]         删除预设
 * @param {Array} props.history
 * @param {(id:string)=>void} props.onRemoveHistory
 * @param {()=>void} props.onClearHistory
 * @param {()=>void} [props.onRestoreFromNodes] 临时：从节点产出反向恢复历史记录
 * @param {string} [props.activeTab] 当前激活 tab（受控：add/nodes/history/assets），不传则非受控默认 add
 * @param {(tab:string)=>void} [props.onActiveTabChange] tab 切换回调
 * @param {string|null} [props.historyFocusNodeId] 要在历史记录中高亮定位的节点 id
 * @param {(url:string)=>void} props.onUseImage
 * @param {(item:object,opts:object)=>void} props.onInsertHistory
 * @param {(item:object,e:object)=>void} props.onDragStartHistory
 * @param {(urls:string[])=>void} props.onAddToAssets
 * @param {(urls:string[])=>void} props.onInsertImagesToCanvas
 * @param {string} props.workspaceId
 * @param {'dock'|'mini-app-slot'} [props.agentChatPlacement]
 */
export default function RightPanel({
  nodes, edges, groups, selectedNodeId,
  onSelectNode, onLocateNode, onDeleteNode,
  onAdd, onDragStartNode, onExecute,
  presets, onAddPreset, onDragStartPreset, onDeletePreset,
  history, onRemoveHistory, onClearHistory, onRestoreFromNodes, onUseImage,
  onInsertHistory, onDragStartHistory,
  onAddToAssets, onInsertImagesToCanvas,
  activeTab, onActiveTabChange, historyFocusNodeId, assetCategories,
  workspaceId, agentChatPlacement,
}) {
  const agentChatEmbedded = agentChatPlacement === 'mini-app-slot';
  const [agentChatSlotElement, setAgentChatSlotElement] = useState(null);
  const previousTabRef = useRef(activeTab && activeTab !== 'chat' ? activeTab : 'add');
  const currentTab = activeTab || 'add';

  const tabBadgeCount = (value) => {
    if (value === 'presets') return presets?.length || 0;
    if (value === 'nodes') return nodes.length;
    return 0;
  };

  const handleTabChange = useCallback((tab) => {
    if (tab !== 'chat') previousTabRef.current = tab;
    onActiveTabChange?.(tab);
    if (agentChatEmbedded) {
      window.AgentSpaces?.updateHostSlotState?.('agent-chat', { active: tab === 'chat' });
    }
  }, [agentChatEmbedded, onActiveTabChange]);

  useEffect(() => {
    if (!agentChatEmbedded || !agentChatSlotElement) return undefined;
    return window.AgentSpaces?.registerHostSlot?.('agent-chat', agentChatSlotElement, {
      onActiveChange: (active) => {
        onActiveTabChange?.(active ? 'chat' : previousTabRef.current);
      },
    });
  }, [agentChatEmbedded, agentChatSlotElement, onActiveTabChange]);

  useEffect(() => {
    if (!agentChatEmbedded) return;
    window.AgentSpaces?.updateHostSlotState?.('agent-chat', { active: activeTab === 'chat' });
  }, [activeTab, agentChatEmbedded]);

  return (
    <div className="flex h-full min-h-0 flex-col border-l border-border bg-background">
      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        defaultValue="add"
        className="flex h-full min-h-0 flex-col p-3"
      >
        {/*
          统一剪影容器：按钮行、激活按钮内的白色 pill 与有机缺口、内容卡片同处一个
          filter: drop-shadow 组内，阴影只沿合并后的外轮廓投影，衔接处零阴影。
          白色剪影在浅色底上靠阴影轮廓显形，不需要彩色背景。
        */}
        <div
          className="relative flex min-h-0 flex-1 flex-col"
          style={{ filter: 'drop-shadow(0 12px 28px rgba(0, 0, 0, 0.16)) drop-shadow(0 4px 10px rgba(0, 0, 0, 0.10))' }}
        >
          {/* 浮动 tab 按钮行：激活按钮自身就是白色 pill（bg-card），缺口 SVG 挂在按钮内部；
              外部间距由 Tabs 的 p-3 提供 */}
          <div role="tablist" className="relative z-30 mb-4 flex shrink-0 items-center justify-center gap-3">
            {TAB_ITEMS.filter((t) => t.value !== 'chat' || agentChatEmbedded).map((tab) => {
              const isActive = tab.value === currentTab;
              const count = tabBadgeCount(tab.value);
              return (
                <button
                  key={tab.value}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  title={tab.label}
                  aria-label={tab.label}
                  onClick={() => handleTabChange(tab.value)}
                  className={`relative flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-[20px] border transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95 ${
                    isActive
                      ? 'border-border bg-card'
                      : 'border-border bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                  style={isActive ? { color: tab.color } : undefined}
                >
                  <span className="relative z-10 flex flex-col items-center">
                    <tab.Icon className="h-6 w-6" />
                    <span
                      className="mt-0.5 h-1 w-1 rounded-full transition-opacity duration-200"
                      style={{ backgroundColor: tab.color, opacity: isActive ? 1 : 0 }}
                    />
                  </span>
                  {count > 0 && (
                    <span className="absolute -right-1 -top-1 z-20 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold leading-none text-primary-foreground">
                      {count > 99 ? '99+' : count}
                    </span>
                  )}
                  {isActive && (
                    /* 有机缺口：起点在按钮底边上方 2px（与 pill 重叠消除发丝缝），
                       高 20px，跨过 16px 行距后下缘叠卡片 2px，与卡片连成一体。
                       注意：fill 必须走内联 style——SVG presentation attribute 不支持 var() */
                    <svg
                      width="72"
                      height="20"
                      viewBox="0 0 72 20"
                      fill="none"
                      className="absolute block overflow-visible"
                      style={{ left: '50%', top: 'calc(100% - 2px)', transform: 'translateX(-50%)', fill: 'var(--card)' }}
                    >
                      <path d="M 0 18 C 16 18 22 5 27 1.5 C 31 0.2 41 0.2 45 1.5 C 50 5 56 18 72 18 L 72 20 L 0 20 Z" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>

          {/* 内容卡片：四角圆角；白底上圆角切角处透出同为白色的面板背景会「看起来是方角」，
              用细描边描出圆角轮廓；tab 内容面板（bg-card 同色）直接铺满，圆角由 overflow-hidden 统一裁出 */}
          <div
            className="relative flex min-h-0 flex-1 flex-col overflow-hidden border border-border bg-card"
            style={{ borderRadius: FLOATING_RADIUS }}
          >
            <TabsContent value="add" keepMounted className="mt-0 min-h-0 flex-1 overflow-hidden bg-card">
              <AddNodeTab onAdd={onAdd} onDragStartNode={onDragStartNode} onExecute={onExecute} />
            </TabsContent>

            <TabsContent value="presets" keepMounted className="mt-0 min-h-0 flex-1 overflow-hidden bg-card">
              <PresetsTab
                presets={presets || []}
                onAdd={onAddPreset}
                onDragStartPreset={onDragStartPreset}
                onDelete={onDeletePreset}
              />
            </TabsContent>

            <TabsContent value="nodes" keepMounted className="mt-0 min-h-0 flex-1 overflow-hidden bg-card">
              <NodeManageTab
                nodes={nodes}
                edges={edges}
                groups={groups}
                selectedNodeId={selectedNodeId}
                onSelectNode={onSelectNode}
                onLocateNode={onLocateNode}
                onDeleteNode={onDeleteNode}
              />
            </TabsContent>

            <TabsContent value="history" keepMounted className="mt-0 min-h-0 flex-1 overflow-hidden bg-card">
              <HistoryTab
                history={history}
                groups={groups}
                assetCategories={assetCategories}
                onRemoveHistory={onRemoveHistory}
                onClearHistory={onClearHistory}
                onRestoreFromNodes={onRestoreFromNodes}
                focusNodeId={historyFocusNodeId}
                onUseImage={onUseImage}
                onInsertHistory={onInsertHistory}
                onDragStartHistory={onDragStartHistory}
                onAddToAssets={onAddToAssets}
                onLocateNode={onLocateNode}
              />
            </TabsContent>

            <TabsContent value="assets" keepMounted className="mt-0 min-h-0 flex-1 overflow-hidden bg-card">
              <AssetLibrary workspaceId={workspaceId} onInsertImagesToCanvas={onInsertImagesToCanvas} />
            </TabsContent>

            {agentChatEmbedded && (
              <TabsContent value="chat" keepMounted className="mt-0 min-h-0 flex-1 overflow-hidden bg-card">
                <div ref={setAgentChatSlotElement} className="h-full min-h-0 w-full" />
              </TabsContent>
            )}
          </div>
        </div>
      </Tabs>
    </div>
  );
}
