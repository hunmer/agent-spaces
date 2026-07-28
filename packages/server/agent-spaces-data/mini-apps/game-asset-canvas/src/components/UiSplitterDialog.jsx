import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  Button, Input, NumberInput, Label, ScrollArea, Loader, ColorPicker, Switch,
  Tooltip, TooltipTrigger, TooltipContent,
  ResizablePanelGroup, ResizablePanel, ResizableHandle,
} from '@agent-spaces/ui';
import { Undo2, Redo2, Pipette, SquarePen, MousePointer2, Trash2, Eraser, Scissors, LayoutGrid } from '@agent-spaces/ui';
import GridAnimationPreview from './GridAnimationPreview';
import { getFabric } from '../utils/image-ops/cdn';
import {
  loadImageSource, detect, exportBox, sampleColor, cornerColor, toHex,
} from '../utils/image-ops/sprite-splitter';

// hex(#rrggbb / #rgb) → [r,g,b]
const hexToRgb = (hex) => {
  let h = String(hex || '').replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

// 背景色预设（ColorPicker 色板）
const BG_PRESETS = ['#ffffff', '#000000', '#f5f5f5', '#1a1a1a', '#00b140', '#ff00ff'];

const normalizeGridCount = (value, fallback = 2) => Math.max(1, Math.min(20, Math.round(value) || fallback));
const gridSplitThrottleMs = (cols, rows) => Math.min(1000, 80 + normalizeGridCount(cols) * normalizeGridCount(rows) * 2);
const evenlySpacedGuides = (size, count) => {
  const guides = [];
  for (let i = 1; i < count; i++) guides.push(Math.round((size * i) / count));
  return guides;
};
const normalizeGuideAxis = (values, size, expectedCount) => {
  if (!Array.isArray(values)) return null;
  const guides = [...new Set(values
    .filter(Number.isFinite)
    .map((value) => Math.max(1, Math.min(size - 1, Math.round(value)))))]
    .sort((a, b) => a - b);
  return guides.length === expectedCount ? guides : null;
};
const resolveGridGuides = (saved, width, height, fallbackCols = 2, fallbackRows = 2) => {
  const cols = normalizeGridCount(saved?.cols, fallbackCols);
  const rows = normalizeGridCount(saved?.rows, fallbackRows);
  return {
    cols,
    rows,
    v: normalizeGuideAxis(saved?.v, width, cols - 1) || evenlySpacedGuides(width, cols),
    h: normalizeGuideAxis(saved?.h, height, rows - 1) || evenlySpacedGuides(height, rows),
  };
};
const gridBoxesFromGuides = (width, height, vertical, horizontal) => {
  const vx = [0, ...(vertical || []).filter((x) => x > 0 && x < width), width].sort((a, b) => a - b);
  const hy = [0, ...(horizontal || []).filter((y) => y > 0 && y < height), height].sort((a, b) => a - b);
  const boxes = [];
  for (let i = 0; i < vx.length - 1; i++) {
    const boxWidth = vx[i + 1] - vx[i];
    if (boxWidth < 2) continue;
    for (let j = 0; j < hy.length - 1; j++) {
      const boxHeight = hy[j + 1] - hy[j];
      if (boxHeight >= 2) boxes.push({ x: vx[i], y: hy[j], width: boxWidth, height: boxHeight });
    }
  }
  return boxes;
};

/**
 * UI 拆分对话框：用 fabric.js 在画布上框选区域 + 自动检测连通域，
 * 把每个框导出成一张切片图，上传后回传给节点。
 *
 * 支持多张输入图：顶部横向列表切换，每张图独立保留切片框/撤销重做/背景色。
 *
 * 节点对话框数据持久化（见 handoff.md「节点对话框数据持久化规范」）：
 * - 节点把持久化快照作为 initialData 传入；对话框每次有效业务变更后调 onDataChange 写回。
 * - 持久化内容：每图 rects/pickedColor/exportEnabled/gridGuides + 检测参数 + inputSignature（输入标识）。
 * - 恢复时机：fabric + 所有图 source 就绪后，仅当 inputSignature 与当前输入一致才灌回；
 *   输入变化（增删/换序/换 URL）时按仍存在的 URL 逐图恢复，不存在的丢弃。
 * - 不持久化运行时对象：source/imageData、undo/redo 栈、fabric 对象、activeUrl、loading 等。
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {string[]} props.inputImages 输入图 URL（节点传入，多张）
 * @param {object} [props.initialData] 节点持久化的拆分快照 { inputSignature, method, tolerance, minArea, padding, pickedHex, gridMode, perImage }
 * @param {(data:object)=>void} [props.onDataChange] 业务数据变化时写回节点
 * @param {(urls: string[]) => void} props.onSave 切片上传完成回调（保存当前激活图的切片）
 * @param {(oldUrl: string, newUrl: string) => boolean|void} [props.onReplaceImage] 裁切后替换原图回调（返回 false 表示原图只读，已改追加）
 * @param {() => void} props.onClose
 * @param {'full'|'grid-only'} [props.mode='full'] full=全功能（默认，UI 拆分用）；grid-only=锁定网格模式，
 *   禁用绘制/吸色/裁切/检测，右侧面板换成动画预览（Sheet 拆分用）
 */
export default function UiSplitterDialog({ open, inputImages, initialData, onDataChange, onSave, onClose, onReplaceImage, mode = 'full' }) {
  const gridOnly = mode === 'grid-only';
  const stageRef = useRef(null);            // fabric 容器 DOM
  const fcRef = useRef(null);               // fabric.Canvas 实例
  const fabricLibRef = useRef(null);        // fabric 命名空间
  // 每张图的独立状态：imageStatesRef.current[url] = { source, pickedColor, undo, redo, rects, gridGuides }
  const imageStatesRef = useRef({});
  const activeUrlRef = useRef('');          // 当前激活图 URL（回调闭包读最新值）
  const roRef = useRef(null);               // 容器尺寸观察器
  // 模式/状态用 ref（fabric 回调闭包读最新值）
  const spaceDownRef = useRef(false);
  const panningRef = useRef(false);
  const lastPanRef = useRef(null);
  const pickingRef = useRef(false);
  const drawingRef = useRef(false);
  const startRef = useRef(null);
  const draftRef = useRef(null);
  const applyingHistoryRef = useRef(false);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const onDataChangeRef = useRef(onDataChange);
  onDataChangeRef.current = onDataChange;
  const onReplaceImageRef = useRef(onReplaceImage);
  onReplaceImageRef.current = onReplaceImage;
  // 持久化快照 ref：恢复时读、写回时读，规避闭包读旧值
  const initialDataRef = useRef(initialData);
  initialDataRef.current = initialData;
  const readyRef = useRef(false);          // fabric + 所有图 source 就绪标记（控制表单变化自动检测的首触发）
  const drawModeRef = useRef(true);        // true=框选绘制模式，false=选择/移动模式（fabric 闭包读最新值）
  // 裁切模式（fabric 闭包读最新值）
  const cropModeRef = useRef(false);       // 是否处于裁切拉框模式
  const croppingRef = useRef(false);       // 正在拖拽裁切框
  const cropStartRef = useRef(null);       // 裁切起点 {x,y}
  const cropDraftRef = useRef(null);       // 裁切范围临时 fabric.Rect（橙色虚线框）
  // 网格模式（fabric 闭包读最新值）
  const gridModeRef = useRef(false);       // 是否处于网格模式
  const gridColsRef = useRef(2);           // 网格列数
  const gridRowsRef = useRef(2);           // 网格行数
  const vGuidesRef = useRef([]);           // 垂直参考线 x 坐标（图片像素，已排序）
  const hGuidesRef = useRef([]);           // 水平参考线 y 坐标（图片像素，已排序）
  const gridSplitTimerRef = useRef(null);   // 实时拆分节流尾调用
  const lastGridSplitAtRef = useRef(0);
  // 持久化表单参数 ref（onDataChange 写回时读最新值，避免 setMethod 异步导致写回旧值）
  const methodRef = useRef('corner');
  const toleranceRef = useRef(70);
  const minAreaRef = useRef(500);
  const paddingRef = useRef(2);
  const pickedHexRef = useRef(toHex([239, 26, 239]));

  // 受控表单状态（仅驱动 UI 显示，fabric 逻辑直接读 ref/getter）
  const [activeUrl, setActiveUrl] = useState('');
  const [thumbUrls, setThumbUrls] = useState([]);
  const thumbUrlsRef = useRef([]);
  useEffect(() => { thumbUrlsRef.current = thumbUrls; }, [thumbUrls]);
  const [method, setMethod] = useState('corner');
  const [tolerance, setTolerance] = useState(70);
  const [minArea, setMinArea] = useState(500);
  const [padding, setPadding] = useState(2);
  const [pickedHex, setPickedHex] = useState(toHex([239, 26, 239]));
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [count, setCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);   // 所有启用导出图的切片框总和（驱动保存按钮）
  const [sliceCounts, setSliceCounts] = useState({}); // { [url]: number } 每图切片数（驱动缩略图 badge）
  const [exportEnabled, setExportEnabled] = useState({}); // { [url]: boolean } 每图是否导出（默认全 true）
  const exportEnabledRef = useRef({});     // 同步 ref，供 fabric/renderList 闭包读最新值
  exportEnabledRef.current = exportEnabled;
  const [drawMode, setDrawMode] = useState(true);    // 绘制模式（驱动工具条 toggle 图标）
  // 裁切 / 网格 UI 状态
  const [cropMode, setCropMode] = useState(false);   // 裁切模式（驱动按钮高亮）
  const [cropBox, setCropBox] = useState(null);      // {x,y,width,height} | null，松开鼠标后保留，驱动确认条
  const [gridMode, setGridMode] = useState(false);   // 网格模式（驱动右面板切换 + 工具条高亮）
  const [gridCols, setGridCols] = useState(2);
  const [gridRows, setGridRows] = useState(2);
  const [cropBusy, setCropBusy] = useState(false);
  useEffect(() => { gridColsRef.current = gridCols; }, [gridCols]);
  useEffect(() => { gridRowsRef.current = gridRows; }, [gridRows]);
  const [status, setStatus] = useState('选择图片开始。滚轮缩放，空格拖拽，Alt 拉框。');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  // 表单参数同步到 ref（onDataChange 写回时读最新值）
  useEffect(() => { methodRef.current = method; }, [method]);
  useEffect(() => { toleranceRef.current = tolerance; }, [tolerance]);
  useEffect(() => { minAreaRef.current = minArea; }, [minArea]);
  useEffect(() => { paddingRef.current = padding; }, [padding]);
  useEffect(() => { pickedHexRef.current = pickedHex; }, [pickedHex]);

  // 当前激活图的 state 对象（读最新 activeUrlRef）
  const curState = useCallback(() => imageStatesRef.current[activeUrlRef.current], []);
  // 当前激活图的 source（fabric 闭包统一入口）
  const sourceRef = useRef(null);
  const syncSourceRef = useCallback(() => { sourceRef.current = curState()?.source || null; }, [curState]);

  // 当前选项快照（fabric 闭包用）
  const optionsRef = useRef({});
  const computeOptions = useCallback(() => {
    const opts = {
      method,
      tolerance: Number(tolerance) || 0,
      minArea: Number(minArea) || 0,
      padding: Number(padding) || 0,
    };
    if (method === 'picked') opts.backgroundColor = curState()?.pickedColor || hexToRgb(pickedHex);
    optionsRef.current = opts;
    return opts;
  }, [method, tolerance, minArea, padding, pickedHex, curState]);
  useEffect(() => { computeOptions(); }, [computeOptions]);

  // ===== fabric 切片框辅助 =====
  const rects = useCallback(() => {
    const fc = fcRef.current;
    if (!fc) return [];
    return fc.getObjects().filter((o) => o.kind === 'slice');
  }, []);

  const clearRects = useCallback(() => {
    const fc = fcRef.current;
    if (!fc) return;
    for (const r of rects()) fc.remove(r);
  }, [rects]);

  const realBox = useCallback((rect) => ({
    x: rect.left,
    y: rect.top,
    width: rect.width * rect.scaleX,
    height: rect.height * rect.scaleY,
  }), []);

  const snapshot = useCallback(() => rects().map(realBox), [rects, realBox]);

  const addRect = useCallback((box) => {
    const fc = fcRef.current;
    const fabric = fabricLibRef.current;
    if (!fc || !fabric) return;
    const rect = new fabric.Rect({
      left: box.x,
      top: box.y,
      width: box.width,
      height: box.height,
      fill: 'rgba(0,0,0,0)',
      stroke: '#0ea5e9',
      strokeWidth: 2,
      cornerColor: '#0ea5e9',
      transparentCorners: false,
      objectCaching: false,
    });
    rect.kind = 'slice';
    fc.add(rect);
  }, []);

  const updateHistoryButtons = useCallback(() => {
    const st = curState();
    setCanUndo((st?.undo?.length || 0) > 0);
    setCanRedo((st?.redo?.length || 0) > 0);
  }, [curState]);

  const pushHistory = useCallback(() => {
    if (applyingHistoryRef.current) return;
    const st = curState();
    if (!st) return;
    st.undo.push(snapshot());
    st.redo.length = 0;
    updateHistoryButtons();
  }, [snapshot, curState, updateHistoryButtons]);

  // 右侧预览列表
  const [previews, setPreviews] = useState([]); // [{ name, url }]

  // ===== 节点对话框数据持久化：统一写回函数 =====
  // 输入签名 = inputImages 用 '|' 拼接，用于判定恢复时输入是否一致。
  // 写回内容：每图 rects/pickedColor/exportEnabled + 检测参数 + 网格模式 + inputSignature。
  // 所有增删改入口（AI 检测/手工绘制/表单修改/删除/撤销重做/切换图）都汇总到 renderList → syncSplitData，
  // 避免某条路径漏写（持久化规范「所有增删改入口必须汇总到统一同步函数」）。
  const inputSignature = (urls) => (urls || []).filter(Boolean).join('|');
  const syncSplitData = useCallback(() => {
    const urls = thumbUrlsRef.current;
    if (!urls?.length) return;
    const states = imageStatesRef.current;
    const perImage = {};
    for (const url of urls) {
      const st = states[url];
      perImage[url] = {
        rects: (st?.rects || []).map((b) => ({ ...b })),
        pickedColor: st?.pickedColor ? [...st.pickedColor] : null,
        exportEnabled: exportEnabledRef.current[url] !== false,
        gridGuides: st?.gridGuides ? {
          cols: st.gridGuides.cols,
          rows: st.gridGuides.rows,
          v: [...(st.gridGuides.v || [])],
          h: [...(st.gridGuides.h || [])],
        } : null,
      };
    }
    onDataChangeRef.current?.({
      inputSignature: inputSignature(urls),
      method: methodRef.current,
      tolerance: toleranceRef.current,
      minArea: minAreaRef.current,
      padding: paddingRef.current,
      pickedHex: pickedHexRef.current,
      gridMode: gridModeRef.current,
      gridCols: gridColsRef.current,
      gridRows: gridRowsRef.current,
      perImage,
    });
  }, []);

  // 表单参数变化 → 写回节点持久化（detectAll 已会经 renderList 写回，
  // 此处兜底覆盖「改参数但未触发检测」的路径；syncSplitData 只读不写 state，无循环风险）。
  // 必须声明在 syncSplitData 之后（useEffect deps 在函数体同步执行时求值，引用未初始化的 const 会 TDZ）。
  useEffect(() => {
    if (!open || !readyRef.current) return;
    syncSplitData();
  }, [open, method, tolerance, minArea, padding, pickedHex, syncSplitData]);

  const renderList = useCallback(() => {
    const source = sourceRef.current;
    // 同步当前图切片框到 state（保证 totalCount 统计最新）
    const cur = curState();
    if (cur && !gridModeRef.current) cur.rects = rects().map(realBox);
    if (!source) { setPreviews([]); setCount(0); setTotalCount(0); return; }
    const boxes = cur?.rects || [];
    setCount(boxes.length);
    const items = boxes.map((box, i) => {
      const canvas = exportBox(source.imageData, box, computeOptions());
      const name = `element_${String(i + 1).padStart(2, '0')}_${Math.round(box.width)}x${Math.round(box.height)}.png`;
      return { name, url: canvas.toDataURL('image/png') };
    });
    setPreviews(items);
    // 统计每图切片数 + 启用导出图的切片总和（驱动保存按钮）
    let total = 0;
    const states = imageStatesRef.current;
    const counts = {};
    for (const url of thumbUrls) {
      const st = states[url];
      const n = st?.rects?.length || 0;
      counts[url] = n;
      // exportEnabled 是 state，renderList 闭包可能读到旧值，用 ref 兜底
      if (exportEnabledRef.current[url] !== false) total += n;
    }
    setSliceCounts(counts);
    setTotalCount(total);
    // 切片框变化 → 写回节点持久化（统一同步点）
    syncSplitData();
  }, [rects, realBox, computeOptions, curState, thumbUrls, syncSplitData]);

  // 删除当前画布上选中的切片框（带历史）
  const deleteSelectedRects = useCallback(() => {
    const fc = fcRef.current;
    if (!fc) return false;
    const selected = rects().filter((r) => r.active || fc.getActiveObject() === r);
    if (!selected.length) return false;
    pushHistory();
    for (const r of selected) fc.remove(r);
    fc.discardActiveObject();
    fc.renderAll();
    renderList();
    setStatus(`已删除 ${selected.length} 个切片框`);
    return true;
  }, [rects, pushHistory, renderList]);

  // 清空当前激活图的所有切片框（带历史）
  const clearAllRects = useCallback(() => {
    const fc = fcRef.current;
    if (!fc) return;
    const all = rects();
    if (!all.length) return;
    pushHistory();
    for (const r of all) fc.remove(r);
    fc.discardActiveObject();
    fc.renderAll();
    renderList();
    setStatus('已清空当前图的切片框');
  }, [rects, pushHistory, renderList]);

  // 按预览索引删除单个切片框（与 renderList 的顺序一致）
  const deleteRectAt = useCallback((index) => {
    const fc = fcRef.current;
    if (!fc) return;
    if (gridModeRef.current) {
      const st = curState();
      if (!st?.rects?.[index]) return;
      st.rects = st.rects.filter((_, i) => i !== index);
      renderList();
      setStatus('已删除该网格切片');
      return;
    }
    const all = rects();
    const r = all[index];
    if (!r) return;
    pushHistory();
    fc.remove(r);
    fc.renderAll();
    renderList();
    setStatus('已删除该切片框');
  }, [rects, pushHistory, renderList, curState]);

  const applySnapshot = useCallback((boxes) => {
    const fc = fcRef.current;
    if (!fc) return;
    applyingHistoryRef.current = true;
    clearRects();
    boxes.forEach((box) => addRect(box));
    applyingHistoryRef.current = false;
    fc.renderAll();
    renderList();
    updateHistoryButtons();
  }, [clearRects, addRect, renderList, updateHistoryButtons]);

  const undo = useCallback(() => {
    const st = curState();
    if (!st?.undo?.length) return;
    st.redo.push(snapshot());
    applySnapshot(st.undo.pop());
  }, [curState, snapshot, applySnapshot]);

  const redo = useCallback(() => {
    const st = curState();
    if (!st?.redo?.length) return;
    st.undo.push(snapshot());
    applySnapshot(st.redo.pop());
  }, [curState, snapshot, applySnapshot]);

  const setColor = useCallback((color) => {
    const st = curState();
    if (st) st.pickedColor = color;
    setPickedHex(toHex(color));
  }, [curState]);

  // ===== 自动检测 =====
  // 对指定图（url）做纯数据检测，返回 box 数组并写入该图 state。不操作 fabric 画布。
  // picked 模式下用该图自身的 pickedColor（每图独立背景色），其它参数取当前表单值。
  const detectFor = useCallback((url) => {
    const st = imageStatesRef.current[url];
    if (!st?.source) return [];
    const opts = computeOptions();
    if (opts.method === 'picked') opts.backgroundColor = st.pickedColor;
    const boxes = detect(st.source.imageData, opts);
    st.rects = boxes;
    return boxes;
  }, [computeOptions]);

  // 对所有图批量检测（非激活图只写数据不渲染；最后统一 renderList 刷新计数/预览）
  const detectAll = useCallback(() => {
    let total = 0;
    const active = activeUrlRef.current;
    for (const url of thumbUrls) {
      const boxes = detectFor(url);
      total += boxes.length;
      // 激活图把切片框同步到画布
      if (url === active) {
        const fc = fcRef.current;
        if (fc) {
          clearRects();
          boxes.forEach(addRect);
          // 重新应用当前绘制模式
          const inDraw = drawModeRef.current;
          for (const r of fc.getObjects().filter((o) => o.kind === 'slice')) r.selectable = !inDraw;
          fc.selection = !inDraw;
          fc.defaultCursor = inDraw ? 'crosshair' : 'default';
          fc.hoverCursor = inDraw ? 'crosshair' : 'move';
          fc.renderAll();
        }
      }
    }
    renderList();
    setStatus(`已对所有图检测，共 ${total} 个区域`);
    return total;
  }, [thumbUrls, detectFor, clearRects, addRect, renderList]);

  // 表单参数变化时自动重新检测所有图（编辑器就绪后才生效，避免加载阶段空跑）
  // 网格模式 / 裁切模式下跳过：detectAll 会重置切片框，破坏网格参考线状态
  useEffect(() => {
    if (!open || !readyRef.current || gridModeRef.current || cropModeRef.current) return;
    detectAll();
  }, [open, method, tolerance, minArea, padding, pickedHex, detectAll]);

  // 让 fabric 视口 contain 居中显示整张图片（坐标系仍是图片像素，仅改 viewportTransform）
  const fitToStage = useCallback(() => {
    const fc = fcRef.current;
    const src = sourceRef.current;
    if (!fc || !src) return;
    const cw = fc.getWidth();
    const ch = fc.getHeight();
    const iw = src.canvas.width;
    const ih = src.canvas.height;
    if (!cw || !ch || !iw || !ih) return;
    const zoom = Math.min(cw / iw, ch / ih);
    const left = (cw - iw * zoom) / 2;
    const top = (ch - ih * zoom) / 2;
    fc.setViewportTransform([zoom, 0, 0, zoom, left, top]);
    fc.requestRenderAll();
  }, []);

  // ===== 切换激活图：存回当前图切片框 → 换 source/背景 → 恢复目标图切片框/栈 =====
  const switchTo = useCallback((url) => {
    const fc = fcRef.current;
    const fabric = fabricLibRef.current;
    const next = imageStatesRef.current[url];
    if (!next || !fc) return;
    // 存回旧图切片框
    const prevUrl = activeUrlRef.current;
    if (prevUrl && prevUrl !== url && imageStatesRef.current[prevUrl]) {
      const prev = imageStatesRef.current[prevUrl];
      if (gridModeRef.current) {
        const vs = [];
        const hs = [];
        for (const o of fc.getObjects()) {
          if (o.kind !== 'guide') continue;
          if (o.axis === 'v') vs.push(Math.round(o.left));
          else if (o.axis === 'h') hs.push(Math.round(o.top));
        }
        prev.gridGuides = {
          cols: gridColsRef.current,
          rows: gridRowsRef.current,
          v: vs.sort((a, b) => a - b),
          h: hs.sort((a, b) => a - b),
        };
        if (gridSplitTimerRef.current) clearTimeout(gridSplitTimerRef.current);
        gridSplitTimerRef.current = null;
        prev.rects = gridBoxesFromGuides(
          prev.source.canvas.width,
          prev.source.canvas.height,
          prev.gridGuides.v,
          prev.gridGuides.h,
        );
      } else {
        prev.rects = snapshot();
      }
    }
    activeUrlRef.current = url;
    setActiveUrl(url);
    syncSourceRef();
    // 切背景图
    if (fabric && next.source) {
      fabric.Image.fromURL(next.source.canvas.toDataURL('image/png'), (img) => {
        img.selectable = false;
        img.evented = false;
        fc.setBackgroundImage(img, () => {
          fitToStage();
          fc.renderAll();
        });
      });
    }
    // 恢复目标图切片框
    applyingHistoryRef.current = true;
    clearRects();
    if (!gridModeRef.current) (next.rects || []).forEach((box) => addRect(box));
    applyingHistoryRef.current = false;
    // 应用当前绘制模式到新渲染的切片框
    const inDraw = drawModeRef.current;
    for (const r of fc.getObjects().filter((o) => o.kind === 'slice')) r.selectable = !inDraw;
    fc.selection = gridModeRef.current ? false : !inDraw;
    fc.defaultCursor = gridModeRef.current ? 'default' : inDraw ? 'crosshair' : 'default';
    fc.hoverCursor = gridModeRef.current ? 'default' : inDraw ? 'crosshair' : 'move';
    fc.renderAll();
    // 恢复背景色显示
    setPickedHex(toHex(next.pickedColor || [239, 26, 239]));
    updateHistoryButtons();
    renderList();
    setStatus(`已切换到图 ${thumbUrls.indexOf(url) + 1}。`);
  }, [snapshot, syncSourceRef, clearRects, addRect, fitToStage, updateHistoryButtons, renderList, thumbUrls]);

  // ===== 打开对话框：加载 fabric + 所有图 =====
  useEffect(() => {
    if (!open) return;
    const urls = (inputImages || []).filter(Boolean);
    setThumbUrls(urls);
    if (!urls.length) { setError('没有输入图片'); return; }
    let disposed = false;
    setLoading(true);
    setError('');
    setStatus('正在加载编辑器…');
    // 重置每图状态（新会话）
    imageStatesRef.current = {};

    (async () => {
      try {
        const fabric = await getFabric();
        if (disposed) return;
        fabricLibRef.current = fabric;
        // 节点对话框数据持久化：判定是否可恢复（输入签名一致才恢复，否则丢弃旧快照）
        const saved = initialDataRef.current;
        const canRestore = !!saved
          && Array.isArray(saved.perImage)
          ? false // 防御：perImage 必须是对象
          : !!saved
            && saved.inputSignature === inputSignature(urls)
            && saved.perImage && typeof saved.perImage === 'object';
        const savedPerImage = canRestore ? saved.perImage : null;
        const restoreGridMode = canRestore && saved.gridMode === true;
        const restoreGridCols = canRestore ? Math.max(1, Math.min(20, Math.round(saved.gridCols) || 2)) : 2;
        const restoreGridRows = canRestore ? Math.max(1, Math.min(20, Math.round(saved.gridRows) || 2)) : 2;
        // 预加载所有图 source；若可恢复则用持久化的 pickedColor 覆盖默认四角色
        for (const url of urls) {
          if (disposed) return;
          const source = await loadImageSource(url);
          if (disposed) return;
          const corner = cornerColor(source.imageData);
          const savedPi = savedPerImage?.[url];
          // 持久化的 pickedColor 是 [r,g,b]；防御性校验
          const pickedColor = savedPi?.pickedColor && Array.isArray(savedPi.pickedColor) && savedPi.pickedColor.length === 3
            ? [...savedPi.pickedColor]
            : corner;
          imageStatesRef.current[url] = {
            source,
            pickedColor,
            undo: [],
            redo: [],
            rects: [],
            gridGuides: savedPi?.gridGuides
              ? resolveGridGuides(savedPi.gridGuides, source.canvas.width, source.canvas.height)
              : null,
          };
        }
        // 恢复检测参数到表单 + ref（setState 异步，ref 立即生效保证 computeOptions 读到最新值）
        if (canRestore) {
          if (typeof saved.method === 'string') { methodRef.current = saved.method; setMethod(saved.method); }
          if (saved.tolerance != null) { toleranceRef.current = saved.tolerance; setTolerance(saved.tolerance); }
          if (saved.minArea != null) { minAreaRef.current = saved.minArea; setMinArea(saved.minArea); }
          if (saved.padding != null) { paddingRef.current = saved.padding; setPadding(saved.padding); }
          if (typeof saved.pickedHex === 'string') { pickedHexRef.current = saved.pickedHex; setPickedHex(saved.pickedHex); }
        }
        // grid-only：强制网格模式，忽略持久化的 gridMode=false
        const effectiveGridMode = gridOnly ? true : restoreGridMode;
        gridModeRef.current = effectiveGridMode;
        gridColsRef.current = restoreGridCols;
        gridRowsRef.current = restoreGridRows;
        setGridMode(effectiveGridMode);
        setGridCols(restoreGridCols);
        setGridRows(restoreGridRows);
        // 初始化 fabric.Canvas（挂到 stage 容器内的 <canvas>）
        const el = stageRef.current?.querySelector('canvas');
        if (!el) throw new Error('画布 DOM 未就绪');
        try { fcRef.current?.dispose?.(); } catch {}
        const fc = new fabric.Canvas(el, {
          selection: true,
          preserveObjectStacking: true,
          backgroundColor: '#0f172a',
        });
        fcRef.current = fc;
        const stageEl = stageRef.current;
        fc.setWidth(stageEl?.clientWidth || 0);
        fc.setHeight(stageEl?.clientHeight || 0);

        // 容器尺寸变化时同步 fabric 画布 DOM
        if (stageEl && typeof ResizeObserver !== 'undefined') {
          const ro = new ResizeObserver(() => {
            const f = fcRef.current;
            if (!f) return;
            f.setWidth(stageEl.clientWidth);
            f.setHeight(stageEl.clientHeight);
            f.calcOffset();
            f.requestRenderAll();
          });
          ro.observe(stageEl);
          roRef.current = ro;
        }

        bindFabricEvents(fc, fabric);
        // 激活第一张
        const first = urls[0];
        activeUrlRef.current = first;
        setActiveUrl(first);
        syncSourceRef();
        const firstState = imageStatesRef.current[first];
        setPickedHex(toHex(firstState.pickedColor));
        fabric.Image.fromURL(firstState.source.canvas.toDataURL('image/png'), (img) => {
          if (disposed) return;
          img.selectable = false;
          img.evented = false;
          fc.setBackgroundImage(img, () => {
            if (disposed) return;
            fitToStage();
            fc.renderAll();
          });
        });
        setLoading(false);
        setStatus('编辑器就绪。滚轮缩放，空格拖拽，Alt 拉框新建切片。');
        updateHistoryButtons();
        // 每图导出开关：优先用持久化值，否则默认全 true
        const enabledMap = {};
        urls.forEach((u) => {
          const savedPi = savedPerImage?.[u];
          enabledMap[u] = savedPi && typeof savedPi.exportEnabled === 'boolean' ? savedPi.exportEnabled : true;
        });
        setExportEnabled(enabledMap);
        exportEnabledRef.current = enabledMap;
        renderList();
        // 打开后对所有图初始化切片框：
        // - 可恢复且有持久化 rects 的图 → 直接灌回（保留用户上次编辑结果，跳过自动检测）
        // - 其余图 → 自动检测
        // 注意：readyRef 延迟到本 setTimeout 末尾才置 true，避免恢复参数（setMethod 等）
        // 触发「表单变化自动检测」effect 把刚恢复的 rects 又覆盖掉。
        setTimeout(() => {
          if (disposed) return;
          const opts0 = computeOptions();
          let total0 = 0;
          let detectedCount = 0;
          for (const u of urls) {
            const s0 = imageStatesRef.current[u];
            if (!s0?.source) continue;
            const savedPi = savedPerImage?.[u];
            const savedRects = Array.isArray(savedPi?.rects) ? savedPi.rects.filter((b) => b && Number.isFinite(b.x)) : null;
            if (effectiveGridMode) {
              // 网格模式（含 grid-only）：所有图都走网格参考线，切片由实时拆分计算，跳过检测
            } else if (savedRects && savedRects.length) {
              // 恢复持久化切片框（深拷贝防御后续运行时修改污染）
              s0.rects = savedRects.map((b) => ({ ...b }));
              total0 += s0.rects.length;
            } else {
              const o0 = { ...opts0 };
              if (o0.method === 'picked') o0.backgroundColor = s0.pickedColor;
              const b0 = detect(s0.source.imageData, o0);
              s0.rects = b0;
              total0 += b0.length;
              detectedCount += 1;
            }
            if (u === first) {
              clearRects();
              if (effectiveGridMode) {
                fc.selection = false;
                fc.defaultCursor = 'default';
                fc.hoverCursor = 'default';
              } else {
                s0.rects.forEach(addRect);
                // 首次默认绘制模式：切片框不可选，光标十字
                for (const r of fc.getObjects().filter((o) => o.kind === 'slice')) r.selectable = false;
                fc.selection = false;
                fc.defaultCursor = 'crosshair';
                fc.hoverCursor = 'crosshair';
              }
              fc.renderAll();
            }
          }
          renderList();
          setStatus(effectiveGridMode
            ? `已恢复网格模式：${restoreGridCols} 列 × ${restoreGridRows} 行`
            : canRestore && detectedCount === 0
              ? `已恢复上次编辑（共 ${total0} 个切片）`
              : `已对所有图检测，共 ${total0} 个区域`);
          // 恢复/检测完成后才标记就绪，允许后续表单变化触发自动检测
          readyRef.current = true;
        }, 80);
      } catch (err) {
        console.error('[ui-splitter] init failed:', err);
        if (!disposed) {
          setLoading(false);
          setError(err?.message || String(err));
        }
      }
    })();

    return () => {
      disposed = true;
      readyRef.current = false;
      try { roRef.current?.disconnect?.(); } catch {}
      roRef.current = null;
      try { fcRef.current?.dispose?.(); } catch {}
      fcRef.current = null;
      fabricLibRef.current = null;
      sourceRef.current = null;
      imageStatesRef.current = {};
      activeUrlRef.current = '';
      gridModeRef.current = false;
      setGridMode(false);
      if (gridSplitTimerRef.current) clearTimeout(gridSplitTimerRef.current);
      gridSplitTimerRef.current = null;
      lastGridSplitAtRef.current = 0;
      spaceDownRef.current = false;
      panningRef.current = false;
      drawingRef.current = false;
      pickingRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 重置预览/计数（打开时）
  useEffect(() => {
    if (open) {
      setPreviews([]);
      setCount(0);
      setTotalCount(0);
      setSavedCount(0);
      setCanUndo(false);
      setCanRedo(false);
    }
  }, [open]);

  // ===== 裁切 / 网格：核心函数（声明在 bindFabricEvents 之前，避免 TDZ） =====

  // 把画布上所有参考线坐标重排写回 ref（拖动结束、拆分前调用）
  const syncGuidesFromCanvas = useCallback(() => {
    const fc = fcRef.current;
    if (!fc) return;
    const vs = [];
    const hs = [];
    for (const o of fc.getObjects()) {
      if (o.kind !== 'guide') continue;
      if (o.axis === 'v') vs.push(Math.round(o.left));
      else if (o.axis === 'h') hs.push(Math.round(o.top));
    }
    vGuidesRef.current = vs.sort((a, b) => a - b);
    hGuidesRef.current = hs.sort((a, b) => a - b);
    const st = curState();
    if (st) {
      st.gridGuides = {
        cols: gridColsRef.current,
        rows: gridRowsRef.current,
        v: [...vGuidesRef.current],
        h: [...hGuidesRef.current],
      };
    }
  }, [curState]);

  // 清除画布上的网格覆盖层（不动切片框）；重绘时保留参考线坐标。
  const clearGuides = useCallback((resetPositions = true) => {
    const fc = fcRef.current;
    if (!fc) return;
    for (const o of fc.getObjects().filter((g) => g.kind === 'guide' || g.kind === 'grid-boundary')) fc.remove(o);
    if (resetPositions) {
      vGuidesRef.current = [];
      hGuidesRef.current = [];
    }
  }, []);

  // 在当前图片上渲染网格边界，并按 vGuidesRef/hGuidesRef 绘制内部参考线。
  const renderGuides = useCallback(() => {
    const fc = fcRef.current;
    const fabric = fabricLibRef.current;
    const src = sourceRef.current;
    if (!fc || !fabric || !src) return;
    clearGuides(false);
    const iw = src.canvas.width;
    const ih = src.canvas.height;
    const boundary = new fabric.Rect({
      left: 0, top: 0, width: iw, height: ih,
      fill: 'rgba(234,179,8,0.04)', stroke: '#eab308', strokeWidth: 2,
      strokeDashArray: [6, 4], selectable: false, evented: false,
      objectCaching: false,
    });
    boundary.kind = 'grid-boundary';
    fc.add(boundary);
    const mkLine = (x1, y1, x2, y2, axis) => {
      // fabric.Line 的 left/top 是包围盒左上角，构造时 x1==x2 的垂直线 left 即为 x1
      const line = new fabric.Line([x1, y1, x2, y2], {
        stroke: '#eab308', strokeWidth: 2, selectable: true, evented: true,
        hasControls: false, hasBorders: false, hoverCursor: axis === 'v' ? 'ew-resize' : 'ns-resize',
        objectCaching: false,
      });
      line.kind = 'guide';
      line.axis = axis;
      // 单轴锁定：垂直线只允许水平移动，水平线只允许垂直移动
      if (axis === 'v') {
        line.set({ lockMovementY: true, lockScalingY: true, lockScalingX: true, lockRotation: true });
      } else {
        line.set({ lockMovementX: true, lockScalingX: true, lockScalingY: true, lockRotation: true });
      }
      fc.add(line);
    };
    for (const x of vGuidesRef.current) mkLine(x, 0, x, ih, 'v');
    for (const y of hGuidesRef.current) mkLine(0, y, iw, y, 'h');
    fc.renderAll();
  }, [clearGuides]);

  const restoreGridForCurrent = useCallback(() => {
    const src = sourceRef.current;
    const st = curState();
    if (!src || !st) return null;
    const guides = resolveGridGuides(
      st.gridGuides,
      src.canvas.width,
      src.canvas.height,
      gridColsRef.current,
      gridRowsRef.current,
    );
    gridColsRef.current = guides.cols;
    gridRowsRef.current = guides.rows;
    vGuidesRef.current = [...guides.v];
    hGuidesRef.current = [...guides.h];
    st.gridGuides = { ...guides, v: [...guides.v], h: [...guides.h] };
    setGridCols(guides.cols);
    setGridRows(guides.rows);
    renderGuides();
    return guides;
  }, [curState, renderGuides]);

  const buildGridBoxes = useCallback(() => {
    const src = sourceRef.current;
    if (!src) return [];
    return gridBoxesFromGuides(src.canvas.width, src.canvas.height, vGuidesRef.current, hGuidesRef.current);
  }, []);

  const applyGridSplit = useCallback(() => {
    if (!gridModeRef.current) return [];
    syncGuidesFromCanvas();
    const boxes = buildGridBoxes();
    const st = curState();
    if (st) st.rects = boxes;
    renderList();
    setStatus(`网格实时拆分：${boxes.length} 个切片`);
    return boxes;
  }, [syncGuidesFromCanvas, buildGridBoxes, curState, renderList]);

  const scheduleGridSplit = useCallback((immediate = false) => {
    const run = () => {
      gridSplitTimerRef.current = null;
      lastGridSplitAtRef.current = Date.now();
      applyGridSplit();
    };
    const throttleMs = gridSplitThrottleMs(gridColsRef.current, gridRowsRef.current);
    const remaining = throttleMs - (Date.now() - lastGridSplitAtRef.current);
    if (immediate || remaining <= 0) {
      if (gridSplitTimerRef.current) clearTimeout(gridSplitTimerRef.current);
      run();
    } else if (!gridSplitTimerRef.current) {
      gridSplitTimerRef.current = setTimeout(run, remaining);
    }
  }, [applyGridSplit]);

  // 网格态切换图片或恢复对话框时，优先恢复该图片最后一次参考线位置。
  useEffect(() => {
    if (!gridMode || !sourceRef.current) return;
    restoreGridForCurrent();
    scheduleGridSplit(true);
  }, [activeUrl, gridMode, restoreGridForCurrent, scheduleGridSplit]);

  // 进入网格模式：优先恢复当前图片上次参考线，没有快照时按行列均分。
  const enterGridMode = useCallback(() => {
    const fc = fcRef.current;
    const src = sourceRef.current;
    if (!fc || !src) return;
    pushHistory();
    clearRects();
    clearGuides();
    fc.selection = false;
    fc.defaultCursor = 'default';
    fc.hoverCursor = 'default';
    if (cropDraftRef.current) { fc.remove(cropDraftRef.current); cropDraftRef.current = null; }
    cropModeRef.current = false;
    setCropMode(false);
    setCropBox(null);
    gridModeRef.current = true;
    setGridMode(true);
    restoreGridForCurrent();
    scheduleGridSplit(true);
  }, [pushHistory, clearRects, clearGuides, restoreGridForCurrent, scheduleGridSplit]);

  // 退出网格模式：固化最后一次实时拆分结果为普通切片框。
  const exitGridMode = useCallback(() => {
    const fc = fcRef.current;
    if (!fc) return;
    if (gridSplitTimerRef.current) clearTimeout(gridSplitTimerRef.current);
    gridSplitTimerRef.current = null;
    const boxes = applyGridSplit();
    clearGuides();
    clearRects();
    for (const box of boxes) addRect(box);
    gridModeRef.current = false;
    setGridMode(false);
    // 恢复绘制模式的光标/选择态
    const inDraw = drawModeRef.current;
    for (const r of fc.getObjects().filter((o) => o.kind === 'slice')) r.selectable = !inDraw;
    fc.selection = !inDraw;
    fc.defaultCursor = inDraw ? 'crosshair' : 'default';
    fc.hoverCursor = inDraw ? 'crosshair' : 'move';
    fc.renderAll();
    renderList();
    setStatus(`已退出网格模式，保留 ${boxes.length} 个切片`);
  }, [applyGridSplit, clearGuides, clearRects, addRect, renderList]);

  // 应用裁切：导出裁切区域 → 上传 → 替换/追加原图 → 重建 source
  const applyCrop = useCallback(async () => {
    const AS = window.AgentSpaces;
    const box = cropBox;
    const src = sourceRef.current;
    if (!AS?.uploadFile || !box || !src) return;
    const url = activeUrlRef.current;
    if (!url) return;
    setCropBusy(true);
    setError('');
    setStatus('正在裁切并上传…');
    try {
      // 导出裁切区域（不透明背景，避免被 exportBox 的背景色替换逻辑影响）
      const canvas = exportBox(src.imageData, box, { transparent: false });
      const blob = await new Promise((res) => canvas.toBlob((b) => res(b), 'image/png'));
      if (!blob) throw new Error('裁切导出失败');
      const file = new File([blob], `crop_${Date.now()}.png`, { type: 'image/png' });
      const uploaded = await AS.uploadFile(file);
      const httpUrl = uploaded?.url || uploaded?.httpPath;
      if (!httpUrl) throw new Error('裁切结果上传失败');
      // 通知节点替换原图（uploadedImages 原地替换；若为上游只读图则节点内追加为上传图）
      const replaced = onReplaceImageRef.current?.(url, httpUrl);
      // 重建该图 source（含新 imageData/canvas），用新 URL 作为 imageStates 的键以保持一致性
      const newSource = await loadImageSource(httpUrl);
      // 更新 imageStates：旧 key 删除，新 key 写入（URL 变了，键也要换）
      const oldSt = imageStatesRef.current[url];
      delete imageStatesRef.current[url];
      imageStatesRef.current[httpUrl] = {
        source: newSource,
        pickedColor: cornerColor(newSource.imageData),
        undo: [],
        redo: [],
        rects: [],
      };
      // 同步 thumbUrls / activeUrl 到新 URL
      setThumbUrls((prev) => prev.map((u) => (u === url ? httpUrl : u)));
      activeUrlRef.current = httpUrl;
      setActiveUrl(httpUrl);
      sourceRef.current = newSource;
      // 刷新 fabric 背景图
      const fabric = fabricLibRef.current;
      const fc = fcRef.current;
      if (fabric && fc) {
        fabric.Image.fromURL(newSource.canvas.toDataURL('image/png'), (img) => {
          img.selectable = false;
          img.evented = false;
          fc.setBackgroundImage(img, () => {
            fitToStage();
            fc.renderAll();
          });
        });
      }
      // 清裁切框 + 退出裁切模式
      if (cropDraftRef.current && fc) { fc.remove(cropDraftRef.current); cropDraftRef.current = null; }
      cropModeRef.current = false;
      setCropMode(false);
      setCropBox(null);
      updateHistoryButtons();
      renderList();
      setPickedHex(toHex(cornerColor(newSource.imageData)));
      // grid-only：裁切完成后自动回到网格模式（裁切会改图，重进网格按新图尺寸重建参考线）
      if (gridOnly) {
        enterGridMode();
      }
      // 裁切后输入图集合变化，清旧 splitData（遵守持久化规范）
      onDataChangeRef.current?.(null);
      setStatus(replaced === false ? '已裁切（上游只读图，结果已追加为新上传图）' : '已裁切并替换原图');
    } catch (err) {
      console.error('[ui-splitter] crop failed:', err);
      setError(err?.message || String(err));
    } finally {
      setCropBusy(false);
    }
  }, [cropBox, fitToStage, renderList, updateHistoryButtons, gridOnly, enterGridMode]);

  // ===== fabric 事件绑定（单独函数，避免重建 fc 时回调读旧闭包） =====
  const bindFabricEvents = useCallback((fc, fabric) => {
    const pointerPoint = (event) => {
      const p = fc.getPointer(event.e);
      return { x: Math.round(p.x), y: Math.round(p.y) };
    };

    const setPanMode = (enabled) => {
      spaceDownRef.current = enabled;
      stageRef.current?.classList.toggle('is-panning', enabled);
      fc.selection = !enabled;
      for (const r of fc.getObjects().filter((o) => o.kind === 'slice')) r.selectable = !enabled;
      fc.defaultCursor = enabled ? 'grab' : 'default';
    };

    fc.on('mouse:wheel', (event) => {
      if (!sourceRef.current) return;
      let zoom = fc.getZoom() * Math.pow(0.999, event.e.deltaY);
      zoom = Math.max(0.1, Math.min(6, zoom));
      fc.zoomToPoint({ x: event.e.offsetX, y: event.e.offsetY }, zoom);
      event.e.preventDefault();
      event.e.stopPropagation();
    });

    fc.on('mouse:down', (event) => {
      if (!sourceRef.current) return;
      if (spaceDownRef.current) {
        panningRef.current = true;
        lastPanRef.current = { x: event.e.clientX, y: event.e.clientY };
        fc.defaultCursor = 'grabbing';
        return;
      }
      const p = pointerPoint(event);
      if (pickingRef.current) {
        setColor(sampleColor(sourceRef.current.imageData, p.x, p.y));
        setMethod('picked');
        pickingRef.current = false;
        setStatus(`已吸取背景色 ${toHex(curState()?.pickedColor)}`);
        return;
      }
      // 裁切模式：左键点空白启动裁切拉框（不进切片 undo 栈）。点中已有对象（参考线/切片框）放行给 fabric。
      if (cropModeRef.current && !event.target) {
        croppingRef.current = true;
        cropStartRef.current = p;
        // 清除上一个未应用的裁切框
        if (cropDraftRef.current) { fc.remove(cropDraftRef.current); cropDraftRef.current = null; }
        cropDraftRef.current = new fabric.Rect({
          left: p.x, top: p.y, width: 1, height: 1,
          fill: 'rgba(234,179,8,0.08)', stroke: '#eab308', strokeWidth: 2,
          strokeDashArray: [6, 4], objectCaching: false,
          selectable: false, evented: false,
        });
        cropDraftRef.current.kind = 'crop';
        fc.add(cropDraftRef.current);
        setCropBox(null);
        return;
      }
      // 网格模式下禁止切片拉框（参考线独占交互）
      if (gridModeRef.current) return;
      // 绘制模式：左键点空白 或 任意模式下 Alt+左键 都拉框新建。
      // 点中已有切片框（event.target 存在）时不拦截，交给 fabric 选择/移动。
      const wantDraw = (drawModeRef.current && !event.target) || event.e.altKey;
      if (!wantDraw) return;
      pushHistory();
      drawingRef.current = true;
      startRef.current = p;
      draftRef.current = new fabric.Rect({
        left: p.x, top: p.y, width: 1, height: 1,
        fill: 'rgba(0,0,0,0)', stroke: '#f97316', strokeWidth: 2, objectCaching: false,
      });
      draftRef.current.kind = 'slice';
      fc.add(draftRef.current);
    });

    fc.on('mouse:move', (event) => {
      if (panningRef.current && lastPanRef.current) {
        const vpt = fc.viewportTransform;
        vpt[4] += event.e.clientX - lastPanRef.current.x;
        vpt[5] += event.e.clientY - lastPanRef.current.y;
        lastPanRef.current = { x: event.e.clientX, y: event.e.clientY };
        fc.requestRenderAll();
        return;
      }
      // 裁切框尺寸更新
      if (croppingRef.current && cropDraftRef.current) {
        const p = pointerPoint(event);
        const s = cropStartRef.current;
        cropDraftRef.current.set({
          left: Math.min(s.x, p.x),
          top: Math.min(s.y, p.y),
          width: Math.abs(p.x - s.x),
          height: Math.abs(p.y - s.y),
        });
        fc.renderAll();
        return;
      }
      if (!drawingRef.current || !draftRef.current) return;
      const p = pointerPoint(event);
      const s = startRef.current;
      draftRef.current.set({
        left: Math.min(s.x, p.x),
        top: Math.min(s.y, p.y),
        width: Math.abs(p.x - s.x),
        height: Math.abs(p.y - s.y),
      });
      fc.renderAll();
    });

    fc.on('mouse:up', () => {
      if (panningRef.current) {
        panningRef.current = false;
        lastPanRef.current = null;
        fc.defaultCursor = spaceDownRef.current ? 'grab' : 'default';
        return;
      }
      // 裁切框松开：太小则丢弃，否则保留并驱动确认条
      if (croppingRef.current) {
        croppingRef.current = false;
        const d = cropDraftRef.current;
        if (!d) return;
        if (d.width < 2 || d.height < 2) {
          fc.remove(d); cropDraftRef.current = null; setCropBox(null); fc.renderAll(); return;
        }
        setCropBox({ x: d.left, y: d.top, width: d.width, height: d.height });
        setStatus(`已选择裁切范围 ${Math.round(d.width)}×${Math.round(d.height)}，点【应用裁切】确认`);
        return;
      }
      if (!drawingRef.current) return;
      drawingRef.current = false;
      const d = draftRef.current;
      draftRef.current = null;
      if (!d) return;
      if (d.width < 2 || d.height < 2) { fc.remove(d); return; }
      d.set({ stroke: '#0ea5e9' });
      renderList();
    });

    // 拖动/缩放切片框时记录历史（一次操作一条）
    // 参考线拖动时 clamp 到图片范围并实时同步到 vGuidesRef/hGuidesRef
    fc.on('object:moving', (event) => {
      const t = event?.target;
      if (t?.kind === 'guide' && sourceRef.current) {
        const iw = sourceRef.current.canvas.width;
        const ih = sourceRef.current.canvas.height;
        if (t.axis === 'v') {
          // 垂直线，只能左右移：left 是线中心，fabric.Line 用 [x1,y1,x2,y2] 构造，移动后 left 表征中心
          const inset = iw > 2 ? 1 : 0;
          const clamped = Math.max(inset, Math.min(iw - inset, t.left));
          t.set({ left: clamped });
        } else if (t.axis === 'h') {
          const inset = ih > 2 ? 1 : 0;
          const clamped = Math.max(inset, Math.min(ih - inset, t.top));
          t.set({ top: clamped });
        }
        scheduleGridSplit();
        return;
      }
      if (!fc.__historyMoveStarted) { pushHistory(); fc.__historyMoveStarted = true; }
    });
    fc.on('object:scaling', () => {
      if (!fc.__historyScaleStarted) { pushHistory(); fc.__historyScaleStarted = true; }
    });
    fc.on('object:modified', (event) => {
      const t = event?.target;
      if (t?.kind === 'guide') {
        // 松手立即补最后一次，确保节流期间的最终位置不丢失。
        scheduleGridSplit(true);
        fc.__historyMoveStarted = false;
        fc.__historyScaleStarted = false;
        return;
      }
      fc.__historyMoveStarted = false;
      fc.__historyScaleStarted = false;
      renderList();
    });
  }, [pushHistory, renderList, setColor, curState, scheduleGridSplit]);

  // ===== 键盘：空格平移 / Delete 删切片框 / Ctrl+Z 撤销 / Ctrl+Y(Ctrl+Shift+Z) 重做 =====
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      const t = e.target;
      const tag = t?.tagName;
      const inField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable;
      // Delete/Backspace：对话框打开时一律阻止冒泡（避免触发 ReactFlow 删节点）；
      // 有选中切片框时顺带删除它们
      if ((e.code === 'Delete' || e.code === 'Backspace') && !inField) {
        deleteSelectedRects();
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (e.ctrlKey && (e.code === 'KeyY' || (e.shiftKey && e.code === 'KeyZ'))) {
        e.preventDefault(); e.stopPropagation(); redo(); return;
      }
      if (e.ctrlKey && e.code === 'KeyZ') {
        e.preventDefault(); e.stopPropagation(); undo(); return;
      }
      if (e.code !== 'Space' || inField) return;
      e.preventDefault();
      e.stopPropagation();
      const fc = fcRef.current;
      if (fc && !spaceDownRef.current) {
        spaceDownRef.current = true;
        fc.selection = false;
        for (const r of fc.getObjects().filter((o) => o.kind === 'slice')) r.selectable = false;
        fc.defaultCursor = 'grab';
        stageRef.current?.classList.add('is-panning');
      }
    };
    const onKeyUp = (e) => {
      if (e.code !== 'Space') return;
      e.preventDefault();
      const fc = fcRef.current;
      if (fc) {
        const inDraw = drawModeRef.current;
        fc.selection = !inDraw;
        for (const r of fc.getObjects().filter((o) => o.kind === 'slice')) r.selectable = !inDraw;
        fc.defaultCursor = inDraw ? 'crosshair' : 'default';
      }
      spaceDownRef.current = false;
      panningRef.current = false;
      lastPanRef.current = null;
      stageRef.current?.classList.remove('is-panning');
    };
    window.addEventListener('keydown', onKeyDown, true);  // capture 阶段，抢在 ReactFlow 之前
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [open, undo, redo, deleteSelectedRects]);

  // ===== 保存：把所有图的所有切片转 Blob 上传 =====
  const handleSave = useCallback(async () => {
    const AS = window.AgentSpaces;
    if (!AS?.uploadFile) { setError('宿主 uploadFile 不可用'); return; }
    // 先把当前画布上的切片框同步回当前图 state（保证最新）
    const cur = curState();
    if (cur && !gridModeRef.current) cur.rects = snapshot();
    // 收集每张图的切片（跳过无切片框的图）
    const states = imageStatesRef.current;
    const tasks = [];
    thumbUrls.forEach((url, idx) => {
      const st = states[url];
      if (!st?.source) return;
      if (exportEnabledRef.current[url] === false) return; // 跳过禁用导出的图
      // st.rects 已是 box 对象（{x,y,width,height}），无需再 realBox
      const boxes = (st.rects || []).slice();
      if (!boxes.length) return;
      boxes.forEach((box, i) => tasks.push({ st, box, imgIdx: idx, sliceIdx: i }));
    });
    if (!tasks.length) { setError('没有切片框，先自动检测或 Alt 拉框'); return; }
    setSaving(true);
    setSavedCount(0);
    setError('');
    const urls = [];
    // 保存时按每图各自记录的背景色导出（picked 模式才用，其它模式 backgroundColor 不生效）
    const optsBase = { method, tolerance: Number(tolerance) || 0, minArea: Number(minArea) || 0, padding: Number(padding) || 0 };
    try {
      for (let n = 0; n < tasks.length; n++) {
        const { st, box, imgIdx, sliceIdx } = tasks[n];
        const opts = { ...optsBase };
        if (opts.method === 'picked') opts.backgroundColor = st.pickedColor;
        const canvas = exportBox(st.source.imageData, box, opts);
        const blob = await new Promise((res) => canvas.toBlob((b) => res(b), 'image/png'));
        const file = new File(
          [blob],
          thumbUrls.length > 1
            ? `img${imgIdx + 1}_element_${String(sliceIdx + 1).padStart(2, '0')}.png`
            : `element_${String(sliceIdx + 1).padStart(2, '0')}.png`,
          { type: 'image/png' },
        );
        const uploaded = await AS.uploadFile(file);
        const httpUrl = uploaded?.url || uploaded?.httpPath;
        if (httpUrl) { urls.push(httpUrl); setSavedCount(urls.length); }
      }
      if (!urls.length) throw new Error('全部切片上传失败');
      onSaveRef.current?.(urls);
      onClose?.();
    } catch (err) {
      console.error('[ui-splitter] save failed:', err);
      setError(err?.message || String(err));
    } finally {
      setSaving(false);
    }
  }, [curState, snapshot, thumbUrls, method, tolerance, minArea, padding, onClose]);

  // 吸色 / 背景色选择
  const togglePicking = useCallback(() => {
    pickingRef.current = !pickingRef.current;
    setStatus(pickingRef.current ? '点击画布上的背景色' : '');
  }, []);
  const handlePickColor = useCallback((hex) => {
    setColor(hexToRgb(hex));
    setMethod('picked');
  }, [setColor]);

  // 切换绘制模式：true=左键拉框新建切片，false=左键选择/移动切片框
  const toggleDrawMode = useCallback(() => {
    const next = !drawModeRef.current;
    drawModeRef.current = next;
    setDrawMode(next);
    const fc = fcRef.current;
    if (fc && !spaceDownRef.current) {
      // 绘制模式：切片框不可选（避免点空白误选），光标十字；选择模式：切片框可选，光标默认
      for (const r of fc.getObjects().filter((o) => o.kind === 'slice')) r.selectable = !next;
      fc.selection = !next;
      fc.defaultCursor = next ? 'crosshair' : 'default';
      fc.hoverCursor = next ? 'crosshair' : 'move';
    }
  }, []);

  // 切换裁切模式：进入时退出网格；退出时清未应用的裁切框
  const toggleCropMode = useCallback(() => {
    const fc = fcRef.current;
    const next = !cropModeRef.current;
    if (next) {
      // 进入裁切：先清掉网格覆盖层（参考线+边界+切片框），让画布只剩背景图便于拉框。
      // grid-only 下不走 exitGridMode（它会把切片框画回去）；参考线坐标已固化在 st.gridGuides，
      // 退出裁切回网格时 restoreGridForCurrent 会按新图尺寸重建。
      if (gridModeRef.current) {
        if (gridSplitTimerRef.current) clearTimeout(gridSplitTimerRef.current);
        gridSplitTimerRef.current = null;
        syncGuidesFromCanvas();          // 固化当前参考线到 state（含 cols/rows/v/h）
        gridModeRef.current = false;
        setGridMode(false);
      }
      if (fc) {
        // 清掉所有网格/切片覆盖对象，只留背景图
        for (const o of fc.getObjects().filter((g) => g.kind === 'guide' || g.kind === 'grid-boundary' || g.kind === 'slice')) fc.remove(o);
        fc.selection = false;
        fc.defaultCursor = 'crosshair';
        fc.hoverCursor = 'crosshair';
        fc.renderAll();
      }
      // 清未应用裁切框
      if (cropDraftRef.current && fc) { fc.remove(cropDraftRef.current); cropDraftRef.current = null; }
      setCropBox(null);
      setStatus('裁切模式：在图上拉框选择范围，松开后点【应用裁切】');
    } else {
      // 退出裁切：grid-only 回网格；否则恢复绘制/选择态
      if (cropDraftRef.current && fc) { fc.remove(cropDraftRef.current); cropDraftRef.current = null; }
      setCropBox(null);
      if (gridOnly) {
        cropModeRef.current = false;
        setCropMode(false);
        enterGridMode();
        return;
      }
      if (fc) {
        const inDraw = drawModeRef.current;
        for (const r of fc.getObjects().filter((o) => o.kind === 'slice')) r.selectable = !inDraw;
        fc.selection = !inDraw;
        fc.defaultCursor = inDraw ? 'crosshair' : 'default';
        fc.hoverCursor = inDraw ? 'crosshair' : 'move';
      }
      setStatus('');
    }
    cropModeRef.current = next;
    setCropMode(next);
  }, [syncGuidesFromCanvas, gridOnly, enterGridMode]);

  // 顶部网格按钮直接切换模式。
  const toggleGridMode = useCallback((force) => {
    const target = typeof force === 'boolean' ? force : !gridModeRef.current;
    if (target === gridModeRef.current) return;
    if (target) {
      enterGridMode();
    } else {
      exitGridMode();
      setStatus('已退出网格模式');
    }
  }, [enterGridMode, exitGridMode]);

  // 网格参数变化：重置为均分位置并立即刷新实时切片。
  const applyGridSize = useCallback((cols, rows) => {
    const c = normalizeGridCount(cols, 1);
    const r = normalizeGridCount(rows, 1);
    setGridCols(c);
    setGridRows(r);
    gridColsRef.current = c;
    gridRowsRef.current = r;
    const src = sourceRef.current;
    if (!src) return;
    vGuidesRef.current = evenlySpacedGuides(src.canvas.width, c);
    hGuidesRef.current = evenlySpacedGuides(src.canvas.height, r);
    const st = curState();
    if (st) st.gridGuides = { cols: c, rows: r, v: [...vGuidesRef.current], h: [...hGuidesRef.current] };
    renderGuides();
    scheduleGridSplit(true);
  }, [curState, renderGuides, scheduleGridSplit]);

  // 取消裁切（确认条 ✖）
  const cancelCrop = useCallback(() => {
    const fc = fcRef.current;
    if (cropDraftRef.current && fc) { fc.remove(cropDraftRef.current); cropDraftRef.current = null; }
    setCropBox(null);
    cropModeRef.current = false;
    setCropMode(false);
    // grid-only：取消裁切后自动回到网格模式
    if (gridOnly) {
      enterGridMode();
      setStatus('已取消裁切');
      return;
    }
    if (fc) {
      const inDraw = drawModeRef.current;
      for (const r of fc.getObjects().filter((o) => o.kind === 'slice')) r.selectable = !inDraw;
      fc.selection = !inDraw;
      fc.defaultCursor = inDraw ? 'crosshair' : 'default';
      fc.hoverCursor = inDraw ? 'crosshair' : 'move';
    }
    setStatus('已取消裁切');
  }, [gridOnly, enterGridMode]);

  // 切换某图是否导出
  const toggleExport = useCallback((url, on) => {
    setExportEnabled((prev) => ({ ...prev, [url]: on }));
    // renderList 依赖 exportEnabledRef（下次渲染同步），这里手动触发一次计数刷新
    setTimeout(() => renderList(), 0);
  }, [renderList]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose?.(); }}>
      <DialogContent
        className="flex flex-col gap-0 overflow-hidden p-0"
        style={{ width: '94vw', maxWidth: '94vw', maxHeight: '94vh', height: '94vh' }}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
      >
        <DialogHeader className="flex-row items-center justify-between gap-3 border-b border-border px-4 py-2 !gap-0">
          <div className="flex items-center gap-2">
            <DialogTitle className="text-sm">{gridOnly ? '🔲 Sheet 拆分编辑器' : '🧩 雪碧图拆分编辑器'}</DialogTitle>
            <DialogDescription className="text-[11px] text-muted-foreground">
              {gridOnly ? '网格拆分模式 · 右侧动画预览' : '自动检测 + 手动框选切片 · 多图独立记录'}
            </DialogDescription>
          </div>
        </DialogHeader>

        {/* 输入图片横向列表（左上角 badge 显示该图切片数） */}
        {thumbUrls.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto border-b border-border bg-muted/20 px-3 py-2">
            {thumbUrls.map((url, i) => {
              const active = url === activeUrl;
              const n = sliceCounts[url] || 0;
              const enabled = exportEnabled[url] !== false;
              return (
                <button
                  key={url + i}
                  type="button"
                  onClick={() => switchTo(url)}
                  className={`group relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border-2 bg-background transition ${
                    active ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary/50'
                  } ${enabled ? '' : 'opacity-50 grayscale'}`}
                  title={`图 ${i + 1}${n ? ` · ${n} 个切片` : ''}${enabled ? '' : '（已禁用导出）'}`}
                >
                  <img src={url} alt={`图${i + 1}`} draggable={false}
                    className="pointer-events-none max-h-full max-w-full object-contain" />
                  {/* 左上角：切片数 badge（有切片时高亮；禁用导出时变灰） */}
                  <span className={`absolute left-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-br-md px-1 text-[9px] font-semibold leading-none ${
                    !enabled
                      ? 'bg-muted-foreground/40 text-background'
                      : n > 0 ? 'bg-primary text-primary-foreground' : 'bg-background/80 text-muted-foreground'
                  }`}>
                    {n || ''}
                  </span>
                  {/* 右下角：序号 */}
                  <span className="absolute bottom-0 right-0 bg-background/80 px-1 text-[9px] leading-tight text-muted-foreground">
                    {i + 1}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* 工具条（单行 flex，宽度不够自动换行） */}
        <div className="flex flex-wrap items-end gap-2 border-b border-border bg-muted/30 px-4 py-2">
          {gridOnly ? (
            <>
              <Field label="列数">
                <NumberInput min={1} max={20} value={gridCols}
                  onChange={(v) => applyGridSize(v ?? 1, gridRows)} className="h-8 w-20" />
              </Field>
              <Field label="行数">
                <NumberInput min={1} max={20} value={gridRows}
                  onChange={(v) => applyGridSize(gridCols, v ?? 1)} className="h-8 w-20" />
              </Field>
              <span className="pb-2 text-[11px] text-muted-foreground">实时切片 {count}</span>
            </>
          ) : null}
          {!gridOnly && !gridMode && (
            <>
              <Field label="检测方法">
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
                >
                  <option value="corner">四角背景色</option>
                  <option value="picked">吸取背景色</option>
                  <option value="alpha">Alpha 非透明</option>
                  <option value="brightness">暗色前景</option>
                </select>
              </Field>
              <Field label={`容差 ${tolerance}`}>
                <NumberInput min={0} max={765} value={tolerance}
                  onChange={(v) => setTolerance(v ?? 0)}
                  className="h-8 w-24" />
              </Field>
              <Field label={`最小面积 ${minArea}`}>
                <NumberInput min={1} value={minArea}
                  onChange={(v) => setMinArea(v ?? 1)}
                  className="h-8 w-28" />
              </Field>
              <Field label={`边距 ${padding}`}>
                <NumberInput min={0} value={padding}
                  onChange={(v) => setPadding(v ?? 0)}
                  className="h-8 w-24" />
              </Field>
              <Field label="背景色">
                <div className="flex h-8 items-center rounded-md border border-border bg-background px-2">
                  <ColorPicker colors={BG_PRESETS} value={pickedHex} onChange={handlePickColor} />
                </div>
              </Field>
              <div className="flex items-end gap-1.5">
                <Tooltip>
                  <TooltipTrigger render={
                    <Button size="icon" variant={drawMode ? 'default' : 'outline'}
                      className={`h-8 w-8 ${drawMode ? 'ring-2 ring-primary/40' : ''}`}
                      disabled={cropMode}
                      onClick={toggleDrawMode} />
                  }>
                    {drawMode ? <SquarePen className="h-4 w-4" /> : <MousePointer2 className="h-4 w-4" />}
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{drawMode ? '框选模式：左键拉框新建切片（当前）' : '选择模式：左键点选/移动切片框（当前）'}（Alt 强制拉框）</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger render={
                    <Button size="icon" variant={pickingRef.current ? 'default' : 'outline'}
                      className={`h-8 w-8 ${pickingRef.current ? 'ring-2 ring-primary/40' : ''}`}
                      disabled={cropMode}
                      onClick={togglePicking} />
                  }>
                    <Pipette className="h-4 w-4" />
                  </TooltipTrigger>
                  <TooltipContent side="bottom">💧 吸取背景色</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger render={
                    <Button size="icon" variant="outline" className="h-8 w-8" disabled={canUndo === false} onClick={undo} />
                  }>
                    <Undo2 className="h-4 w-4" />
                  </TooltipTrigger>
                  <TooltipContent side="bottom">撤销 (Ctrl+Z)</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger render={
                    <Button size="icon" variant="outline" className="h-8 w-8" disabled={canRedo === false} onClick={redo} />
                  }>
                    <Redo2 className="h-4 w-4" />
                  </TooltipTrigger>
                  <TooltipContent side="bottom">重做 (Ctrl+Y)</TooltipContent>
                </Tooltip>
              </div>
            </>
          )}
          {!gridOnly && gridMode && (
            <>
              <Field label="列数">
                <NumberInput min={1} max={20} value={gridCols}
                  onChange={(v) => applyGridSize(v ?? 1, gridRows)} className="h-8 w-20" />
              </Field>
              <Field label="行数">
                <NumberInput min={1} max={20} value={gridRows}
                  onChange={(v) => applyGridSize(gridCols, v ?? 1)} className="h-8 w-20" />
              </Field>
              <span className="pb-2 text-[11px] text-muted-foreground">实时切片 {count}</span>
            </>
          )}
          {/* 裁切 / 网格 模式组（与绘制模式互斥） */}
          {gridOnly ? (
            // grid-only：只显示裁切按钮（始终可用），不显示网格切换（禁止退出网格）
            <div className="flex items-end gap-1.5 border-l border-border pl-2">
              <Tooltip>
                <TooltipTrigger render={
                  <Button size="icon" variant={cropMode ? 'default' : 'outline'}
                    className={`h-8 w-8 ${cropMode ? 'ring-2 ring-primary/40' : ''}`}
                    onClick={toggleCropMode} />
                }>
                  <Scissors className="h-4 w-4" />
                </TooltipTrigger>
                <TooltipContent side="bottom">裁切：拉框选范围，替换原图</TooltipContent>
              </Tooltip>
            </div>
          ) : (
          <div className={`flex items-end gap-1.5 ${gridMode ? '' : 'border-l border-border pl-2'}`}>
            {!gridMode && (
              <Tooltip>
                <TooltipTrigger render={
                  <Button size="icon" variant={cropMode ? 'default' : 'outline'}
                    className={`h-8 w-8 ${cropMode ? 'ring-2 ring-primary/40' : ''}`}
                    onClick={toggleCropMode} />
                }>
                  <Scissors className="h-4 w-4" />
                </TooltipTrigger>
                <TooltipContent side="bottom">裁切：拉框选范围，替换原图</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger render={
                <Button size="icon" variant={gridMode ? 'default' : 'outline'}
                  className={`h-8 w-8 ${gridMode ? 'ring-2 ring-primary/40' : ''}`}
                  disabled={cropMode}
                  onClick={toggleGridMode} />
              }>
                <LayoutGrid className="h-4 w-4" />
              </TooltipTrigger>
              <TooltipContent side="bottom">{gridMode ? '退出网格模式' : '进入网格模式'}</TooltipContent>
            </Tooltip>
          </div>
          )}
        </div>

        {error && (
          <p className="border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-500">{error}</p>
        )}
        {status && (
          <p className="border-b border-border bg-muted/20 px-4 py-1.5 text-[11px] text-muted-foreground">{status}</p>
        )}

        {/* 主区：左侧 fabric 画布 + 右侧切片结果（可拖拽调宽） */}
        <ResizablePanelGroup direction="horizontal" className="min-h-0 flex-1">
          {/* 左：fabric 画布 */}
          <ResizablePanel id="split-stage" order={1} minSize="40%">
            <div className="relative h-full min-h-0 overflow-hidden bg-muted/20">
              <div
                ref={stageRef}
                className="ui-splitter-stage h-full w-full"
                style={{ position: 'relative' }}
              >
                <canvas />
                {/* 裁切确认条：cropBox 非空时浮在画布顶部居中 */}
                {cropBox && (
                  <div className="pointer-events-auto absolute left-1/2 top-2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-md border border-border bg-background/95 px-3 py-1.5 shadow-lg">
                    <span className="text-xs text-muted-foreground">
                      裁切 {Math.round(cropBox.width)}×{Math.round(cropBox.height)}
                    </span>
                    <Button size="sm" className="h-7" disabled={cropBusy} onClick={applyCrop}>
                      {cropBusy ? '处理中…' : '应用裁切'}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7" disabled={cropBusy} onClick={cancelCrop}>
                      取消
                    </Button>
                  </div>
                )}
              </div>
              <style>{`
                .ui-splitter-stage .canvas-container {
                  position: absolute !important;
                  inset: 0 !important;
                  width: 100% !important;
                  height: 100% !important;
                }
                .ui-splitter-stage .canvas-container canvas,
                .ui-splitter-stage .canvas-container .lower-canvas,
                .ui-splitter-stage .canvas-container .upper-canvas {
                  position: absolute !important;
                  top: 0 !important;
                  left: 0 !important;
                  width: 100% !important;
                  height: 100% !important;
                }
              `}</style>
              {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                  <Loader className="mr-2 h-4 w-4" />
                  <span className="text-sm text-muted-foreground">加载编辑器…</span>
                </div>
              )}
            </div>
          </ResizablePanel>

          <ResizableHandle />

          {/* 右：普通模式切片预览 / grid-only 模式动画预览。 */}
          <ResizablePanel id="split-result" order={2} minSize="20%" maxSize="55%" defaultSize="28%">
            <aside className="flex h-full min-h-0 flex-col border-l border-border">
              {gridOnly ? (
                <>
                  <div className="min-h-0 flex-1">
                    <GridAnimationPreview
                      previews={previews}
                      cols={gridCols}
                      rows={gridRows}
                      activeImgIdx={thumbUrls.length > 1 && activeUrl ? thumbUrls.indexOf(activeUrl) : undefined}
                      onSaveSheets={(urls) => { onSaveRef.current?.(urls); onClose?.(); }}
                    />
                  </div>
                </>
              ) : (
              <>
                  <div className="flex items-center justify-between border-b border-border px-3 py-2">
                    <span className="text-xs font-medium">
                      {gridMode ? '网格实时切片' : '切片'} {count}
                      {thumbUrls.length > 1 && activeUrl ? `（图 ${thumbUrls.indexOf(activeUrl) + 1}）` : ''}
                    </span>
                    {!gridMode && <div className="flex items-center gap-1">
                      <Tooltip>
                        <TooltipTrigger render={
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={clearAllRects} disabled={loading || count === 0} title="清空当前图所有切片" />
                        }>
                          <Eraser className="h-3.5 w-3.5" />
                        </TooltipTrigger>
                        <TooltipContent side="bottom">清空当前图切片</TooltipContent>
                      </Tooltip>
                      <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={renderList} disabled={loading}>
                        刷新预览
                      </Button>
                    </div>}
                  </div>
                  <ScrollArea className="min-h-0 flex-1">
                    <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2 lg:grid-cols-1">
                      {previews.length === 0 && (
                        <p className="px-2 py-8 text-center text-xs text-muted-foreground">
                          {loading ? '加载中…' : gridMode ? '正在计算网格切片…' : '无切片。表单变化自动检测或拉框新建'}
                        </p>
                      )}
                      {previews.map((it, i) => (
                        <div key={i} className="group relative overflow-hidden rounded-md border border-border bg-background">
                          <div className="flex min-h-[120px] items-center justify-center bg-[conic-gradient(#e2e8f0_25%,transparent_0_50%,#e2e8f0_0_75%,transparent_0)] [background-size:16px_16px] p-2">
                            <img src={it.url} alt={it.name} className="max-h-[110px] max-w-full object-contain" />
                          </div>
                          {/* 单项删除图标（hover 显示） */}
                          <button
                            type="button"
                            onClick={() => deleteRectAt(i)}
                            title="删除该切片"
                            className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-md bg-background/80 text-muted-foreground opacity-0 shadow-sm transition hover:bg-destructive hover:text-destructive-foreground group-hover:opacity-100"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                          <div className="flex items-center justify-between gap-1 px-2 py-1.5 text-[11px]">
                            <span className="truncate text-muted-foreground" title={it.name}>{it.name}</span>
                            <a href={it.url} download={it.name}
                              className="shrink-0 font-medium text-primary hover:underline">下载</a>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                  {/* 底部：当前图导出开关 + 保存全部按钮 */}
                  <div className="flex flex-col gap-2 border-t border-border bg-muted/20 p-3">
                    {activeUrl && (
                      <label className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                        <span>导出当前图（图 {thumbUrls.indexOf(activeUrl) + 1}）</span>
                        <Switch
                          checked={exportEnabled[activeUrl] !== false}
                          onCheckedChange={(on) => toggleExport(activeUrl, on)}
                        />
                      </label>
                    )}
                    <Button size="sm" className="h-9 w-full" onClick={handleSave}
                      disabled={saving || totalCount === 0}>
                      {saving
                        ? `保存中 ${savedCount}/${totalCount}`
                        : `💾 保存全部 ${totalCount} 张切片${thumbUrls.length > 1 ? `（${thumbUrls.length} 张图）` : ''}`}
                    </Button>
                  </div>
              </>
              )}
            </aside>
          </ResizablePanel>
        </ResizablePanelGroup>

        <div className="border-t border-border bg-muted/20 px-4 py-2 text-[11px] text-muted-foreground">
          {gridOnly ? (
            <>滚轮缩放 · 按住 <kbd className="rounded border border-border bg-background px-1">空格</kbd> 拖拽平移 · 拖动黄色参考线调整行列拆分 · <kbd className="rounded border border-border bg-background px-1">裁切</kbd> 拉框替换原图（裁切后自动回网格）· 右侧按行/列预览动画</>
          ) : (
            <>滚轮缩放 · 按住 <kbd className="rounded border border-border bg-background px-1">空格</kbd> 拖拽平移 ·
            工具栏切换 <kbd className="rounded border border-border bg-background px-1">框选/选择</kbd> 模式（Alt 强制拉框）·
            <kbd className="rounded border border-border bg-background px-1">裁切</kbd> 拉框替换原图 ·
            <kbd className="rounded border border-border bg-background px-1">网格</kbd> 拖动参考线实时拆分 ·
            <kbd className="rounded border border-border bg-background px-1">Ctrl+Z</kbd> 撤销</>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }) {
  return (
    <Label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      {children}
    </Label>
  );
}
