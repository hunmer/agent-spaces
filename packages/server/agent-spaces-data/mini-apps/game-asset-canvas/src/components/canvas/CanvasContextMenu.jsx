import { useState } from 'react';
import {
  ContextMenu, ContextMenuTrigger, ContextMenuContent,
  ContextMenuGroup, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator,
  ContextMenuSub, ContextMenuSubTrigger, ContextMenuSubContent,
} from '@agent-spaces/ui';
import { createNodePickerOptions } from './AddNodeMenuItems';
import ImageSelectionMenuItems from './ImageSelectionMenuItems';
import { groupContextMenuOptions } from '../../utils/canvas-context-menu';

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
 * @param {object} props.imageSelectionMenuProps 图片选择共享动作参数
 * @param {(nodeId:string,url:string)=>void} props.onSelectContextImage 确保右键图片进入选择集
 */
export default function CanvasContextMenu({
  triggerElement, children, onPick, imageSelectionMenuProps, onSelectContextImage,
  groupMenuProps,
}) {
  const [open, setOpen] = useState(false);
  const [showImageMenu, setShowImageMenu] = useState(false);

  const handleOpenChange = (nextOpen, eventDetails) => {
    if (!nextOpen) {
      setOpen(false);
      setShowImageMenu(false);
      return;
    }
    const target = eventDetails.event?.target;
    if (target?.closest?.('[data-slot="dialog-content"]')) {
      eventDetails.cancel();
      return;
    }
    // 右键落在 ReactFlow 节点上：放行给节点自有的右键菜单，避免画布菜单叠加弹出。
    if (target?.closest?.('.react-flow__node')) {
      eventDetails.cancel();
      return;
    }
    const imageTarget = target?.closest?.('[data-image-selection-url]');
    const nodeId = imageTarget?.dataset?.imageSelectionNodeId;
    const url = imageTarget?.dataset?.imageSelectionUrl;
    if (nodeId && url) {
      onSelectContextImage?.(nodeId, url);
      setShowImageMenu(true);
    } else {
      setShowImageMenu(false);
    }
    setOpen(true);
  };

  const nodeOptions = createNodePickerOptions(onPick);
  const nodeMenuGroups = groupContextMenuOptions(nodeOptions);

  return (
    <ContextMenu open={open} onOpenChange={handleOpenChange}>
      <ContextMenuTrigger render={triggerElement}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        {groupMenuProps?.group && (
          <>
            <ContextMenuSub>
              <ContextMenuSubTrigger>分组菜单</ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-44">
                <ContextMenuItem
                  onClick={() => {
                    groupMenuProps.onUngroup?.(groupMenuProps.group.id);
                    setOpen(false);
                  }}
                >
                  解除分组
                </ContextMenuItem>
                <ContextMenuItem
                  disabled={!groupMenuProps.assets?.length}
                  onClick={() => {
                    groupMenuProps.onAddToAssets?.();
                    setOpen(false);
                  }}
                >
                  添加到素材库
                </ContextMenuItem>
              </ContextMenuSubContent>
            </ContextMenuSub>
            <ContextMenuSeparator />
          </>
        )}
        {showImageMenu ? (
          <ContextMenuGroup>
            <ContextMenuLabel>已选 {imageSelectionMenuProps?.selectedCount || 0} 张</ContextMenuLabel>
            <ContextMenuSeparator />
            <ImageSelectionMenuItems
              {...imageSelectionMenuProps}
              renderSeparator={() => <ContextMenuSeparator />}
              renderItem={({ id, label, Icon, onClick, disabled, loading }) => (
                <ContextMenuItem key={id} onClick={onClick} disabled={disabled}>
                  <Icon className={loading ? 'animate-spin' : undefined} />
                  {label}
                </ContextMenuItem>
              )}
            />
          </ContextMenuGroup>
        ) : (
          <ContextMenuSub>
            <ContextMenuSubTrigger>选择节点</ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-52">
              {nodeMenuGroups.map((group) => (
                <ContextMenuSub key={group.label}>
                  <ContextMenuSubTrigger>{group.label}</ContextMenuSubTrigger>
                  <ContextMenuSubContent className="w-52">
                    {group.items.map((option) => (
                      <ContextMenuItem
                        key={option.value}
                        title={option.description}
                        onClick={() => {
                          option.onSelect?.();
                          setOpen(false);
                        }}
                      >
                        {option.label}
                      </ContextMenuItem>
                    ))}
                  </ContextMenuSubContent>
                </ContextMenuSub>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
