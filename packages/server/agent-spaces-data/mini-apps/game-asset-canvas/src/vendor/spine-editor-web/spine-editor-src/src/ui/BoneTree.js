/**
 * 骨骼层级树（左侧第二个 tab）。
 *
 * 数据来自 getBoneTree(spine)，递归渲染。点击节点选中对应骨骼。
 * 顶部显示骨骼数量（如 7/58）。
 */
import { getBoneTree } from '../loaders/SpineLoader';

export class BoneTree {
  constructor(container, { onSelect }) {
    this.container = container;
    this.onSelect = onSelect || (() => {});
    this.tree = [];
    this.selectedName = null;
    this.expanded = new Set();
  }

  setSpine(spine) {
    this.tree = getBoneTree(spine);
    // 默认全部展开（骨骼数量不多时）
    this.expanded = new Set();
    const walk = (nodes) => {
      for (const n of nodes) {
        this.expanded.add(n.bone.data.name);
        if (n.children.length) walk(n.children);
      }
    };
    walk(this.tree);
    this._render();
  }

  selectByName(name) {
    this.selectedName = name;
    this._render();
  }

  _render() {
    const total = countNodes(this.tree);
    this.container.innerHTML = '';
    const count = el('div', 'bone-count', `骨骼 ${this.expanded.size}/${total}`);
    this.container.appendChild(count);
    const treeEl = el('div', 'bone-tree');
    this.container.appendChild(treeEl);
    for (const node of this.tree) {
      this._renderNode(node, treeEl);
    }
  }

  _renderNode(node, parent) {
    const name = node.bone.data.name;
    const isSelected = name === this.selectedName;
    const hasChildren = node.children.length > 0;
    const isExpanded = this.expanded.has(name);

    const row = el('div', `bone-node ${isSelected ? 'selected' : ''}`);
    row.style.paddingLeft = `${node.depth * 14 + 6}px`;

    // 展开/折叠按钮
    const toggle = el('span', 'bone-toggle', hasChildren ? (isExpanded ? '▼' : '▶') : '');
    if (hasChildren) {
      toggle.onclick = (e) => {
        e.stopPropagation();
        if (this.expanded.has(name)) this.expanded.delete(name);
        else this.expanded.add(name);
        this._render();
      };
      toggle.style.cursor = 'pointer';
    }
    row.appendChild(toggle);

    const nameEl = el('span', 'bone-name', name);
    row.appendChild(nameEl);

    row.onclick = () => {
      this.selectedName = name;
      this.onSelect(node.bone);
      this._render();
    };

    parent.appendChild(row);

    if (hasChildren && isExpanded) {
      for (const child of node.children) {
        this._renderNode(child, parent);
      }
    }
  }
}

function countNodes(nodes) {
  let n = 0;
  for (const node of nodes) {
    n += 1;
    n += countNodes(node.children);
  }
  return n;
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export default BoneTree;
