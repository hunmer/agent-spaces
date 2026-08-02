// 右侧面板容器：新增节点 / 节点管理 / 生成记录 / 素材库 四个 tab。
// 各 tab 的实现拆到同目录独立文件，本文件只做 Tabs 装配。
import { Tabs, TabsList, TabsTrigger, TabsContent, Plus, Boxes, History, Images } from '@agent-spaces/ui';
import AddNodeTab from './AddNodeTab';
import NodeManageTab from './NodeManageTab';
import HistoryTab from './HistoryTab';
import AssetLibrary from '../AssetLibrary';

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
 */
export default function RightPanel({
  nodes, edges, groups, selectedNodeId,
  onSelectNode, onLocateNode, onDeleteNode,
  onAdd, onDragStartNode, onExecute,
  history, onRemoveHistory, onClearHistory, onRestoreFromNodes, onUseImage,
  onInsertHistory, onDragStartHistory,
  onAddToAssets, onInsertImagesToCanvas,
  activeTab, onActiveTabChange, historyFocusNodeId, assetCategories,
  workspaceId,
}) {
  return (
    <div className="flex h-full min-h-0 flex-col border-l border-border bg-card">
      <Tabs
        value={activeTab}
        onValueChange={onActiveTabChange}
        defaultValue="add"
        className="flex h-full min-h-0 flex-col"
      >
        <TabsList className="flex w-full flex-row flex-nowrap rounded-none border-b border-border">
          <TabsTrigger value="add" title="新增节点" aria-label="新增节点" className="flex-1">
            <Plus className="h-4 w-4" />
          </TabsTrigger>
          <TabsTrigger value="nodes" title="节点管理" aria-label="节点管理" className="group flex-1">
            <Boxes className="h-4 w-4" />
            {nodes.length > 0 && (
              <span className="ml-1 rounded-full bg-muted px-1.5 text-[10px] font-medium leading-none text-muted-foreground group-data-[state=active]:bg-primary-foreground/20 group-data-[state=active]:text-primary-foreground">
                {nodes.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" title="生成记录" aria-label="生成记录" className="flex-1">
            <History className="h-4 w-4" />
          </TabsTrigger>
          <TabsTrigger value="assets" title="素材库" aria-label="素材库" className="flex-1">
            <Images className="h-4 w-4" />
          </TabsTrigger>
        </TabsList>

        <TabsContent value="add" keepMounted className="mt-0 min-h-0 flex-1 overflow-hidden">
          <AddNodeTab onAdd={onAdd} onDragStartNode={onDragStartNode} onExecute={onExecute} />
        </TabsContent>

        <TabsContent value="nodes" keepMounted className="mt-0 min-h-0 flex-1 overflow-hidden">
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

        <TabsContent value="history" keepMounted className="mt-0 min-h-0 flex-1 overflow-hidden">
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

        <TabsContent value="assets" keepMounted className="mt-0 min-h-0 flex-1 overflow-hidden">
          <AssetLibrary workspaceId={workspaceId} onInsertImagesToCanvas={onInsertImagesToCanvas} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
