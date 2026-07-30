import { createContext, useContext } from 'react';

/**
 * 上传控件折叠态 context。
 * NodeShell 提供（value=true 表示折叠），各节点的 <UploadSection> 消费。
 * 默认 false（不折叠），保证未包裹 Provider 时上传区正常显示。
 */
export const UploadCollapseContext = createContext(false);

/**
 * 上传控件区容器：被 NodeShell 的折叠态统一控制。
 *
 * 折叠语义：只隐藏 FileUpload 的「上传区域（dropzone）」，保留已上传文件列表展示。
 * 实现：从 context 读折叠态，通过 cloneElement 把 hideDropzone 注入到子 FileUpload。
 *
 * 用法：各节点把 <FileUpload .../> 放进 <UploadSection> 即可，无需手动传 hideDropzone。
 */
export default function UploadSection({ children }) {
  const collapsed = useContext(UploadCollapseContext);
  if (!collapsed) return children;
  // 折叠态：给子元素注入 hideDropzone（FileUpload 只隐藏 dropzone，保留文件列表）
  return injectHideDropzone(children);
}

// 递归注入 hideDropzone（处理 Fragment/数组等情况）
function injectHideDropzone(node) {
  if (node == null || typeof node !== 'object') return node;
  // 已显式传 hideDropzone 则不覆盖
  if (node.props && Object.prototype.hasOwnProperty.call(node.props, 'hideDropzone')) return node;
  // FileUpload 类型（type 为函数且名为 FileUpload）直接注入
  const typeName =
    typeof node.type === 'function' ? node.type.displayName || node.type.name
    : typeof node.type === 'string' ? node.type : '';
  if (typeName === 'FileUpload') {
    return { ...node, props: { ...node.props, hideDropzone: true } };
  }
  // Fragment 或其他容器：递归处理 children
  if (node.props && node.props.children) {
    return { ...node, props: { ...node.props, children: injectHideDropzone(node.props.children) } };
  }
  return node;
}
