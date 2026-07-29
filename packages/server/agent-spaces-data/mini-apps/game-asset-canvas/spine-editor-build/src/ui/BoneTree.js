/**
 * 骨骼层级树（左侧第二个 tab）。
 *
 * 数据来自 getBoneTree(spine)，递归渲染。点击节点名选中对应骨骼。
 * 每行右侧有眼睛图标，点击切换该骨骼（及其子级）的显示/隐藏。
 * 顶部显示骨骼数量（如 7/58）。
 */
import { getBoneTree } from '../loaders/SpineLoader';

export class BoneTree {
  /**
   * @param {object} opts
   * @param {Function} opts.onSelect 选中骨骼回调
   * @param {object} opts.visibility BoneVisibility 实例（控制骨骼显隐）
   * @param {Function} opts.onToggleVisibility 切换显隐回调 (bone) => void
   */
  constructor(container, { onSelect, visibility, onToggleVisibility }) {
    this.container = container;
    this.onSelect = onSelect || (() => {});
    this.visibility = visibility;
    this.onToggleVisibility = onToggleVisibility || (() => {});
    this.tree = [];
    this.selectedName = null;
    this.expanded = new Set();
    this.spine = null;
  }

  setSpine(spine) {
    this.spine = spine;
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

  /** 显隐状态变化后刷新图标 */
  refresh() {
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
    const isHidden = this.visibility?.isHidden(node.bone) ?? false;

    const row = el('div', `bone-node ${isSelected ? 'selected' : ''} ${isHidden ? 'bone-hidden' : ''}`);
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

    // 眼睛图标（显隐切换）
    const eye = el('span', `bone-eye ${isHidden ? 'eye-off' : 'eye-on'}`, isHidden ? '🚫' : '👁');
    eye.title = isHidden ? '显示（当前已隐藏）' : '隐藏';
    eye.onclick = (e) => {
      e.stopPropagation();
      this.onToggleVisibility(node.bone);
    };
    row.appendChild(eye);

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
