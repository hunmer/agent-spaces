/**
 * 节点上传控件容器：为子 FileUpload 默认开启图片悬浮预览。
 */
export default function UploadSection({ children }) {
  return injectFileUploadProps(children);
}

// 递归注入节点上传控件参数（处理 Fragment/数组等情况）
function injectFileUploadProps(node) {
  if (node == null || typeof node !== 'object') return node;
  // FileUpload 类型（type 为函数且名为 FileUpload）直接注入
  const typeName =
    typeof node.type === 'function' ? node.type.displayName || node.type.name
    : typeof node.type === 'string' ? node.type : '';
  if (typeName === 'FileUpload') {
    const props = { ...node.props };
    if (!Object.prototype.hasOwnProperty.call(props, 'imageHoverPreview')) props.imageHoverPreview = true;
    return { ...node, props };
  }
  // Fragment 或其他容器：递归处理 children
  if (node.props && node.props.children) {
    return { ...node, props: { ...node.props, children: injectFileUploadProps(node.props.children) } };
  }
  return node;
}
