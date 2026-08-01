import { createContext } from 'react';

/**
 * 跨节点图片选中状态 Context。
 *
 * 解决问题：图片选中状态需在画布层（Canvas/ImageSelectionToolbar）与节点内部组件
 * （ImageResult/FileUpload/UpstreamImageList）之间共享，避免 NodeShell→NodeOutput→ImageResult
 * 三层 prop drilling。在 Canvas 层提供，被所有渲染图片缩略图的子组件消费。
 *
 * 提供的值（由 hooks/useImageSelection 实现）：
 * @property {(nodeId:string, url:string)=>boolean} isSelected 该图是否被选中
 * @property {(nodeId:string, url:string, ctrlKey?:boolean)=>void} toggle 增删切换（ctrl 或 checkbox 点击均累加多选）
 * @property {(nodeId:string, url:string)=>void} selectForContextMenu 右键目标未选中时切为该单图，已选中时保持选择集
 * @property {()=>void} clear 清空所有选中
 * @property {number} selectedCount 选中图片数
 * @property {string[]} selectedUrls 选中图片 url 去重数组（喂给编辑/抠图/放大操作）
 *
 * 默认值是 no-op，保证未包裹 Provider 时组件不报错（保持原单击预览行为）。
 */
const noop = () => {};
const noSelection = {
  isSelected: () => false,
  toggle: noop,
  selectForContextMenu: noop,
  clear: noop,
  selectedCount: 0,
  selectedUrls: [],
};

export const ImageSelectionContext = createContext(noSelection);
export default ImageSelectionContext;
