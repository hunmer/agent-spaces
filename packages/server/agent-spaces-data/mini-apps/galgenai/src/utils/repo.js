// 移植自原 utils/repoUtils.ts：解析 Eikanya Live2D 模型仓库 JSON。
import { EIKANYA_CDN_BASE } from './constants';

export function parseRepoData(data) {
  const items = [];
  const modelTree = data?.models;
  if (!modelTree) return items;

  const traverse = (node, path) => {
    if (node.children) {
      for (const child of node.children) traverse(child, [...path, node.name]);
    }
    if (node.files) {
      for (const file of node.files) {
        const isModelJson = file.endsWith('.model.json') || file.endsWith('.model3.json');
        if (!isModelJson) continue;
        const fullPath = [...path.slice(1), node.name, file].join('/');
        const finalUrl = EIKANYA_CDN_BASE + fullPath.split('/').map(encodeURIComponent).join('/');
        const filename = file.split('/').pop() || file;
        const displayName = filename.replace(/(\.model\.json|\.model3\.json)/g, '');
        items.push({
          name: `${displayName} (${node.name})`,
          category: path[1] || 'Uncategorized',
          url: finalUrl,
        });
      }
    }
  };

  traverse(modelTree, []);
  return items;
}
