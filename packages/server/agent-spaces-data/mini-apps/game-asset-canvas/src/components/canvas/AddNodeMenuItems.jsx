import {
  IMAGE_PROCESSOR_CATEGORIES,
  IMAGE_PROCESSORS,
  NODE_TYPES,
  defaultProcessorParams,
} from '../../utils/constants';
import { ADD_NODE_ITEMS } from '../../utils/canvas-constants';
import { NODE_META } from '../../utils/constants';
import { ADD_ITEMS as PANEL_ADD_ITEMS, NODE_CATEGORIES } from '../right-panel/constants';

// 菜单与右侧节点列表共用的 Combobox 选项。图像处理器展开为独立选项，
// 选择后仍回传原 imageProcess 节点及处理器参数。
export function createNodePickerOptions(onPick) {
  const options = [];
  ADD_NODE_ITEMS.forEach((item) => {
    const meta = NODE_META[item.type];
    if (item.type === NODE_TYPES.imageProcess) {
      IMAGE_PROCESSOR_CATEGORIES.forEach((category) => {
        IMAGE_PROCESSORS.filter((processor) => processor.category === category.id).forEach((processor) => {
          options.push({
            value: `${item.type}:${processor.id}`,
            label: processor.label,
            description: processor.desc,
            group: `${meta?.icon || ''} ${meta?.label || '图像处理'} · ${category.label}`,
            keywords: [processor.id, processor.label, category.label],
            onSelect: () => onPick?.(item.type, {
              params: { processor: processor.id, processorParams: defaultProcessorParams(processor.id) },
            }),
          });
        });
      });
      return;
    }
    options.push({
      value: item.type,
      label: meta?.label || item.type,
      group: NODE_CATEGORIES.find((category) => category.id === PANEL_ADD_ITEMS.find((panelItem) => panelItem.type === item.type)?.category)?.label || '其他',
      keywords: [item.type, item.label, meta?.label].filter(Boolean),
      onSelect: () => onPick?.(item.type),
    });
  });
  return options;
}

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
