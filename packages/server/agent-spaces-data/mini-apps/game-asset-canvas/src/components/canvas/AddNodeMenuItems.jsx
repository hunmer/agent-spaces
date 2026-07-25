import {
  IMAGE_PROCESSOR_CATEGORIES,
  IMAGE_PROCESSORS,
  NODE_TYPES,
  defaultProcessorParams,
} from '../../utils/constants';
import { ADD_NODE_ITEMS } from '../../utils/canvas-constants';
import { NODE_META } from '../../utils/constants';

/**
 * 添加节点的菜单项列表（右键菜单 / 拖拽落空菜单共用同一份内容）。
 * 从 Canvas.jsx 抽出。用 render-prop 注入对应组件族，使一份逻辑同时适配
 * ContextMenu 与 DropdownMenu。
 *
 * @param {object} props
 * @param {Function} props.onPick        (type, dataPatch?) => void
 * @param {Function} props.renderItem    普通 item 渲染函数：(children, onClick, key) => JSX
 * @param {Function} props.renderSub     子菜单 item 渲染函数：(triggerLabel, items[], key) => JSX，
 *                                       items 为 [{ id, type:'label'|'item', label, desc?, onClick? }]
 */
export default function AddNodeMenuItems({ onPick, renderItem, renderSub }) {
  return ADD_NODE_ITEMS.map((it) => {
    const meta = NODE_META[it.type];
    if (it.type === NODE_TYPES.imageProcess) {
      const subItems = [];
      IMAGE_PROCESSOR_CATEGORIES.forEach((cat) => {
        const items = IMAGE_PROCESSORS.filter((p) => p.category === cat.id);
        if (items.length) {
          subItems.push({
            id: `cat-${cat.id}`,
            type: 'label',
            label: `${cat.icon} ${cat.label}`,
          });
          items.forEach((p) => subItems.push({
            id: p.id,
            type: 'item',
            label: p.label,
            desc: p.desc,
            onClick: () => onPick(it.type, {
              params: { processor: p.id, processorParams: defaultProcessorParams(p.id) },
            }),
          }));
        }
      });
      return renderSub(
        <><span>{meta.icon}</span><span>{meta.label}</span></>,
        subItems,
        it.type,
      );
    }
    return renderItem(
      <><span>{meta.icon}</span><span>{meta.label}</span></>,
      () => onPick(it.type),
      it.type,
    );
  });
}
