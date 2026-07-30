import {
  ContextMenu, ContextMenuTrigger, ContextMenuContent,
  ContextMenuGroup, ContextMenuItem, ContextMenuSub, ContextMenuSubTrigger, ContextMenuSubContent,
} from '@agent-spaces/ui';
import AddNodeMenuItems from './AddNodeMenuItems';

/**
 * 画布右键菜单。
 * 从 Canvas.jsx 抽出。结构：
 *   <ContextMenu>
 *     <ContextMenuTrigger render={<画布容器 div/>}>  ← children：ReactFlow 等
 *       {children}
 *     </ContextMenuTrigger>
 *     <ContextMenuContent>
 *       <AddNodeMenuItems/>  ← 节点类型列表
 *     </ContextMenuContent>
 *   </ContextMenu>
 *
 * ContextMenuTrigger 用 render prop 包裹画布容器（Base UI 的 render 自动合并 ref/props/children）。
 * onContextMenu 只记录右键处的画布坐标供建节点（浮层定位/关闭由 Base UI 管）。
 *
 * @param {object} props
 * @param {React.ReactElement} props.triggerElement  画布容器 div（带 ref/onDrop/onDragOver/onContextMenu）
 * @param {React.ReactNode} props.children           ReactFlow 等主体内容（放进 trigger 内）
 * @param {Function} props.onPick  (type, dataPatch?) => void  右键选中节点类型后在右键位置建节点
 */
export default function CanvasContextMenu({ triggerElement, children, onPick }) {
  const handleOpenChange = (open, eventDetails) => {
    if (open && eventDetails.event?.target?.closest?.('[data-slot="dialog-content"]')) {
      eventDetails.cancel();
    }
  };

  return (
    <ContextMenu onOpenChange={handleOpenChange}>
      <ContextMenuTrigger render={triggerElement}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuGroup>
          <AddNodeMenuItems
            onPick={onPick}
            renderItem={(inner, onClick, key) => (
              <ContextMenuItem key={key} onClick={onClick}>
                {inner}
              </ContextMenuItem>
            )}
            renderSub={(triggerLabel, subItems, key) => (
              <ContextMenuSub key={key}>
                <ContextMenuSubTrigger>{triggerLabel}</ContextMenuSubTrigger>
                <ContextMenuSubContent className="w-52">
                  {subItems.map((s) => (
                    s.type === 'label' ? (
                      <p key={s.id} className="px-2 py-0.5 text-[10px] text-muted-foreground">
                        {s.label}
                      </p>
                    ) : (
                      <ContextMenuItem key={s.id} title={s.desc} onClick={s.onClick}>
                        {s.label}
                      </ContextMenuItem>
                    )
                  ))}
                </ContextMenuSubContent>
              </ContextMenuSub>
            )}
          />
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  );
}
