import { useCallback, useEffect, useRef, useState } from 'react';
import { copyNodes, hasClipboard, pasteNodes, serializeClipboard } from '../utils/clipboard';
import { genId } from '../utils/canvas-id';
import { computeAlignment } from '../utils/align-distribute';
import { IMAGE_TAGS } from '../utils/constants';
import { readClipboardImageFiles } from '../utils/clipboard-images';

/**
 * 节点选中状态 + 多选对齐分布 + 批量删除 + 复制粘贴。
 * 从 Canvas.jsx 抽出（原 B3 选中部分 + B9 对齐 + B10 删除/复制粘贴）。
 *
 * selectionCount 驱动底部多选 toolbar 显示和 NodeShell 隐藏单节点 toolbar。
 *
 * 多个 callback（handleCopy/alignDistribute/deleteSelectedNodes/keydown）只需读 nodes 当前值
 * 判断选中态，不需响应式重建，故用 nodesRef 持有最新值，deps 去掉 nodes → 稳定 callback。
 *
 * @param {object} deps
 * @param {Array} deps.nodes
 * @param {Array} deps.edges
 * @param {Function} deps.setNodes
 * @param {Function} deps.setEdges
 * @param {Function} deps.setGroups
 * @param {Function} deps.setSelectedId  外部 selectedId 的 setter
 * @param {Function} deps.addImageNodesFromUrls  生成记录「用作输入」复用
 * @param {Function} deps.onPasteImageFiles 系统剪贴板图片上传到视口中心
 */
export default function useSelectionClipboard({
  nodes, edges, setNodes, setEdges, setGroups, setSelectedId,
  addImageNodesFromUrls, onPasteImageFiles,
}) {
  const [selectionCount, setSelectionCount] = useState(0);

  // nodes/edges 的 ref 镜像：让「读最新选中态」的 callback 去掉对 nodes/edges 的依赖
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;

  // 选中变化：单选时记录 selectedId，多选时只更新 selectionCount
  const onSelectionChange = useCallback(({ nodes: selNodes }) => {
    setSelectedId(selNodes.length === 1 ? selNodes[0].id : null);
    setSelectionCount(selNodes.length);
  }, [setSelectedId]);

  // 对齐分布选中节点（底部 toolbar 触发）：纯算法 + setNodes 应用
  const alignDistribute = useCallback((mode) => {
    const sel = nodesRef.current.filter((n) => n.selected);
    if (sel.length < 2) return;
    const newPositions = computeAlignment(sel, mode);
    if (!newPositions.size) return;
    setNodes((prev) => prev.map((n) => {
      const pos = newPositions.get(n.id);
      if (!pos) return n;
      return { ...n, position: { ...n.position, ...pos } };
    }));
  }, [setNodes]);

  // 批量删除选中节点（含相关边 + 清理 groups 悬空引用），删完清空选中
  const deleteSelectedNodes = useCallback(() => {
    const curNodes = nodesRef.current;
    const ids = new Set(curNodes.filter((n) => n.selected).map((n) => n.id));
    if (ids.size === 0) return;
    setNodes((prev) => prev.filter((n) => !ids.has(n.id)));
    setEdges((prev) => prev.filter((e) => !ids.has(e.source) && !ids.has(e.target)));
    setGroups((prev) => prev.map((g) => ({ ...g, childNodeIds: g.childNodeIds.filter((id) => !ids.has(id)) })));
    setSelectedId(null);
  }, [setNodes, setEdges, setGroups, setSelectedId]);

  // 生成记录「用作输入」
  const handleUseImage = useCallback((url) => {
    addImageNodesFromUrls([url], { tags: [IMAGE_TAGS.history] });
  }, [addImageNodesFromUrls]);

  // —— 复制粘贴节点（Ctrl+C / Ctrl+V）——
  // 剪贴板为模块级内存（utils/clipboard.js），切换工作区后仍可粘贴 → 跨工作区复制。
  // 焦点在 input/textarea/contenteditable 时不拦截，让浏览器走原生复制/粘贴。
  const handleCopy = useCallback(() => {
    const curNodes = nodesRef.current;
    const selected = curNodes.filter((n) => n.selected);
    if (!selected.length) return;
    copyNodes(selected, edgesRef.current);
    const text = serializeClipboard();
    if (text && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text).catch(() => {});
    }
  }, []);

  const handlePaste = useCallback(async () => {
    if (onPasteImageFiles && typeof navigator !== 'undefined' && navigator.clipboard?.read) {
      let imageFiles = [];
      try {
        imageFiles = await readClipboardImageFiles(navigator.clipboard);
      } catch {
        // 系统剪贴板图片读取是可选能力；失败时继续粘贴内部节点剪贴板。
      }
      if (imageFiles.length) {
        await onPasteImageFiles(imageFiles);
        return;
      }
    }

    if (!hasClipboard()) return;
    const result = pasteNodes({ genId });
    if (!result) return;
    setNodes((prev) => [...prev, ...result.nodes]);
    setEdges((prev) => [...prev, ...result.edges]);
  }, [onPasteImageFiles, setNodes, setEdges]);

  // 全选节点（Ctrl/Cmd+A）：selected 由 ReactFlow 自管，直接置 true。
  const handleSelectAll = useCallback(() => {
    setNodes((prev) => prev.map((n) => ({ ...n, selected: true })));
  }, [setNodes]);

  // 反选：selected 取反
  const handleInvertSelect = useCallback(() => {
    setNodes((prev) => prev.map((n) => ({ ...n, selected: !n.selected })));
  }, [setNodes]);

  // 取消选择：全部 selected 置 false
  const handleClearSelection = useCallback(() => {
    setNodes((prev) => prev.map((n) => ({ ...n, selected: false })));
  }, [setNodes]);

  // keydown：Ctrl/Cmd+A/C/V，跳过 input/textarea/contenteditable。
  // 用 nodesRef 读最新值，deps 不含 nodes → effect 只订阅一次（避免每次 nodes 变重新绑监听）。
  useEffect(() => {
    const onKeyDown = (e) => {
      const t = e.target;
      const tag = t?.tagName;
      const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
        || t?.isContentEditable;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || isEditable) return;
      if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        handleSelectAll();
      } else if (e.key === 'c' || e.key === 'C') {
        const selected = nodesRef.current.filter((n) => n.selected);
        if (selected.length) { e.preventDefault(); handleCopy(); }
      } else if (e.key === 'v' || e.key === 'V') {
        e.preventDefault();
        void handlePaste();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleCopy, handlePaste, handleSelectAll]);

  return {
    selectionCount, setSelectionCount,
    onSelectionChange,
    alignDistribute, deleteSelectedNodes, handleUseImage,
    handleCopy, handlePaste,
    handleSelectAll, handleInvertSelect, handleClearSelection,
  };
}
