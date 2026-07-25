import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
} from '@agent-spaces/ui';
import AddNodeMenuItems from './AddNodeMenuItems';

/**
 * 拖拽连线到空白处放手的「添加节点」菜单。
 * 从 Canvas.jsx 抽出。复用 AddNodeMenuItems（与右键菜单同一份内容）。
 *
 * 用 DropdownMenu（Base UI Menu）受控打开，trigger 用 1x1 span 定位到放手坐标作锚点。
 * ContextMenu 无法程序化打开，故这里用 DropdownMenu 组件族。
 *
 * @param {object} props
 * @param {{clientX:number, clientY:number, source:string, sourceHandle?:string}|null} props.dropNodeMenu
 *        菜单状态（null 时返回 null 不渲染）
 * @param {Function} props.onClose  () => void  关闭菜单（用户点外面或选完）
 * @param {Function} props.onPick   (type, dataPatch?) => void  选中节点类型
 */
export default function DropNodeMenu({ dropNodeMenu, onClose, onPick }) {
  if (!dropNodeMenu) return null;
  return (
    <DropdownMenu open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DropdownMenuTrigger
        render={<span style={{ position: 'fixed', left: dropNodeMenu.clientX, top: dropNodeMenu.clientY, width: 1, height: 1, pointerEvents: 'none' }} />}
      />
      <DropdownMenuContent align="start" sideOffset={0} className="w-52">
        <AddNodeMenuItems
          onPick={onPick}
          renderItem={(children, onClick, key) => (
            <DropdownMenuItem key={key} onClick={onClick}>
              {children}
            </DropdownMenuItem>
          )}
          renderSub={(triggerLabel, subItems, key) => (
            <DropdownMenuSub key={key}>
              <DropdownMenuSubTrigger>{triggerLabel}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-52">
                {subItems.map((s) => (
                  s.type === 'label' ? (
                    <p key={s.id} className="px-2 py-0.5 text-[10px] text-muted-foreground">
                      {s.label}
                    </p>
                  ) : (
                    <DropdownMenuItem key={s.id} title={s.desc} onClick={s.onClick}>
                      {s.label}
                    </DropdownMenuItem>
                  )
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
