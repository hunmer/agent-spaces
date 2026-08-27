import { SearchSelect } from '@agent-spaces/ui';
import { useEffect, useMemo, useRef } from 'react';
import { createNodePickerOptions } from './AddNodeMenuItems';

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
  const rootRef = useRef(null);
  const options = useMemo(() => createNodePickerOptions(onPick), [onPick]);
  useEffect(() => {
    const onPointerDown = (event) => {
      if (rootRef.current?.contains(event.target)) return;
      // SearchSelect 的 Popover 内容通过 portal 渲染到 body，不在 rootRef 内；
      // 点击选项时必须保留菜单状态，交给 onChange 完成创建。
      if (event.target?.closest?.('[data-slot="popover-content"], [data-slot="popover-popup"], [data-slot="popover-trigger"]')) return;
      onClose?.();
    };
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose?.(); };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown, true);
    return () => { window.removeEventListener('pointerdown', onPointerDown, true); window.removeEventListener('keydown', onKeyDown, true); };
  }, [onClose]);
  if (!dropNodeMenu) return null;
  return (
    <div ref={rootRef} className="fixed z-50 w-56 rounded-lg bg-popover p-1 shadow-lg" style={{ left: dropNodeMenu.clientX, top: dropNodeMenu.clientY }}>
        <SearchSelect
          value=""
          onChange={(value) => options.find((option) => option.value === value)?.onSelect?.()}
          options={options}
          placeholder="选择节点"
          searchPlaceholder="搜索节点（支持拼音）"
          allowCustom={false}
        />
    </div>
  );
}
