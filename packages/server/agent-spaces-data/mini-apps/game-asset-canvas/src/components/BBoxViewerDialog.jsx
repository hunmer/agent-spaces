import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  Button, Label, ScrollArea, Loader, Switch, Input, NumberInput,
  Tooltip, TooltipTrigger, TooltipContent,
  HoverCard, HoverCardTrigger, HoverCardContent,
  ResizablePanelGroup, ResizablePanel, ResizableHandle,
  Tabs, TabsList, TabsTrigger, TabsContent,
  Markdown,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  InputGroup, InputGroupAddon, InputGroupButton,
  Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription,
} from '@agent-spaces/ui';
import {
  Undo2, Redo2, Eraser, Trash2, Download, Upload, FileJson, Crosshair, Sparkles,
  SquareMousePointer, Hand, ChevronDown, Copy, Check, Boxes, Square,
  Scissors, X,
} from '@agent-spaces/ui';
import { getFabric, getImageCompression } from '../utils/image-ops/cdn';
import { loadImageSource, exportBox } from '../utils/image-ops/sprite-splitter';
import { runCutout } from '../utils/cutout';
import {
  BUILTIN_PLUGIN,
} from '../utils/constants';
import CutoutDialog from './CutoutDialog';
import { useCanvasGallery } from '../utils/canvas-gallery';

// 12 色调色板（移植自 bbox_viewer.html）
const PALETTE = [
  '#f38ba8', '#fab387', '#f9e2af', '#a6e3a1',
  '#94e2d5', '#89dceb', '#89b4fa', '#cba6f7',
  '#f5c2e7', '#94c4f5', '#ffd580', '#b0f5c2',
];

// 交互模式
const MODE = { DRAW: 'draw', PAN: 'pan' };

// 从 AI/JSON 文本里提取 JSON 对象（兼容 ```json 代码块包裹、前后多余解释）
function extractJsonFromText(text) {
  if (!text || typeof text !== 'string') throw new Error('AI 未返回内容');
  // 1. 优先匹配 ```json ... ``` 或 ``` ... ``` 代码块
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m) {
    try { return JSON.parse(m[1]); } catch {}
  }
  // 2. 兜底找第一个 { 到最后一个 }
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  if (s >= 0 && e > s) {
    return JSON.parse(text.slice(s, e + 1));
  }
  throw new Error('AI 未返回有效 JSON');
}

// 把图片 URL 转 base64 data URL 传给视觉模型附件通道。
// 仅在原图体积超过阈值时做压缩，且只降质量不改尺寸（maxWidthOrHeight 不传 = 保持原尺寸），
// 这样 AI 看到的图与画布显示的原图坐标体系天然 1:1，无需替换画布背景图。
// browser-image-compression 走 Web Worker，大图不卡 UI；压缩失败降级用原图。
// 阈值/目标由设置页传入（agentConfig.compressThresholdMB / compressTargetMB），未配置时兜底 2MB/1MB。
const DEFAULT_COMPRESS_THRESHOLD_MB = 2;
const DEFAULT_COMPRESS_TARGET_MB = 1;
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('图片转 base64 失败'));
    reader.readAsDataURL(blob);
  });
}
async function compressToDataUrl(url, opts = {}) {
  const thresholdMB = Number(opts.thresholdMB) || DEFAULT_COMPRESS_THRESHOLD_MB;
  const targetMB = Number(opts.targetMB) || DEFAULT_COMPRESS_TARGET_MB;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`读取图片失败(${resp.status})`);
  const blob = await resp.blob();
  const sizeMB = blob.size / (1024 * 1024);
  // 小图（≤ 阈值）直接转 dataUrl，无需压缩
  if (sizeMB <= thresholdMB) {
    return await blobToDataUrl(blob);
  }
  const file = new File([blob], 'image', { type: blob.type || 'image/png' });
  try {
    const compress = await getImageCompression();
    // 仅传 maxSizeMB + useWebWorker，不传 maxWidthOrHeight → 尺寸不变，仅按体积降质量
    const compressed = await compress(file, {
      maxSizeMB: targetMB,
      useWebWorker: true,
    });
    return await blobToDataUrl(compressed);
  } catch (err) {
    console.warn('[bbox-viewer] 压缩失败，降级用原图:', err?.message || err);
    return await blobToDataUrl(blob);
  }
}

/**
 * BBox 查看器对话框：用 fabric.js 渲染图片背景 + bbox 框（来自 JSON 或手动拉框），
 * 支持递归 children、配色策略、图例 hover 联动、批量导出框区域到 ZIP 或画布。
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {string[]} props.inputImages 输入图（节点传入，取首张）
 * @param {{imageUrl:string, boxes:Array<object>}} [props.initialData] 节点持久化的 bbox 快照
 * @param {(data:{imageUrl:string, boxes:Array<object>}) => void} [props.onDataChange] bbox 变化时写回节点
 * @param {(urls: string[]) => void} props.onSave 导出图片上传完成后回调（写 output.images）
 * @param {() => void} props.onClose
 * @param {{id:string, userPrompt:string}} [props.agentConfig] AI 分析配置（Canvas 从 settings 注入；systemPrompt 归 agent preset）
 * @param {(mode:string, modeParams:object, urls:string[]) => Promise<string[]|null>} [props.onCutout]
 *   抠图执行回调（Canvas 注入：内部走 runCutout，返回产出 URL 数组，与 urls 顺序对齐，失败项 null）。
 *   用于「元素拆分」批量/单项抠图。
 */
export default function BBoxViewerDialog({ open, inputImages, initialData, onDataChange, onSave, onClose, agentConfig, onCutout }) {
  const stageRef = useRef(null);
  const fcRef = useRef(null);
  const fabricLibRef = useRef(null);
  const sourceRef = useRef(null);          // 当前图 source {image,canvas,ctx,imageData}
  const imageUrlRef = useRef('');
  const initialDataRef = useRef(initialData);
  initialDataRef.current = initialData;
  const onDataChangeRef = useRef(onDataChange);
  onDataChangeRef.current = onDataChange;
  const roRef = useRef(null);
  // 撤销/重做栈：存 box 数组（{x,y,width,height,meta:{id,label,depth,color}}）
  const undoRef = useRef([]);
  const redoRef = useRef([]);
  const applyingHistoryRef = useRef(false);

  // fabric 交互 ref
  const spaceDownRef = useRef(false);
  const panningRef = useRef(false);
  const lastPanRef = useRef(null);
  const drawingRef = useRef(false);
  const startRef = useRef(null);
  const draftRef = useRef(null);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const highlightedRef = useRef(null);     // 当前图例高亮的 bbox Rect
  // 交互模式：draw（框选） / pan（平移）；非持久 ref 给 fabric 闭包用
  const modeRef = useRef(MODE.DRAW);

  // 受控 UI 状态
  const [imageUrl, setImageUrl] = useState('');
  const [boxes, setBoxes] = useState([]);          // 同步 fabric 框（驱动图例/计数）
  const [lineWidth, setLineWidth] = useState(2);
  const [showChildren, setShowChildren] = useState(true);
  const [showLabel, setShowLabel] = useState(true);
  const [showId, setShowId] = useState(false);
  const [onlyExportSlice, setOnlyExportSlice] = useState(false);   // 导出时是否只取 exportSlice=true 的框
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [status, setStatus] = useState('滚轮缩放，空格拖拽，Alt 拉框新建。');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportedCount, setExportedCount] = useState(0);
  const [hoveredIdx, setHoveredIdx] = useState(null);   // 图例 hover 索引（驱动渲染）
  const [analyzing, setAnalyzing] = useState(false);
  // AI 分析的 AbortController：abort 后中断前端 fetch 等待，UI 立即恢复。
  // 注意：仅放弃等待，后端 agent 进程仍会跑完（当前 API 无真正中断能力）。
  const analyzeAbortRef = useRef(null);
  // 本次 AI 分析的 agent_run taskId（显式自管，避免与画布其他 agent_run 调用互相覆盖 host 的兜底 ref）。
  // 调用 callPluginTool 时传入，stopAgentRun 时用它精确停止本次任务。
  const analyzeTaskIdRef = useRef(null);
  const agentConfigRef = useRef(agentConfig);
  agentConfigRef.current = agentConfig;
  const [promptCopied, setPromptCopied] = useState(false);
  // 列表项缩略图（与 boxes 索引一一对应）：每个框对应画布区域的 dataURL
  const [thumbnails, setThumbnails] = useState([]);
  // 元素拆分 tab 的激活类型过滤器（Set，支持多选；空集合=不过滤显示全部）
  const [activeTypes, setActiveTypes] = useState(() => new Set());

  // 抠图对话框：cutoutTarget = { indexes: number[] } 表示对哪些框抠图（批量=筛选集，单项=[i]）
  const [cutoutTarget, setCutoutTarget] = useState(null);
  // 每个框的抠图产出 URL（按 boxes 索引对齐）；null 表示该框未抠图。优先用于列表缩略图/导出。
  const [cutoutUrls, setCutoutUrls] = useState({});
  const onCutoutRef = useRef(onCutout);
  onCutoutRef.current = onCutout;

  // 右侧面板 Tabs（顺序：选中信息 / 元素拆分 / AI思考）
  const [rightTab, setRightTab] = useState('selected');
  // AI 思考过程：累积 markdown 文本
  const [aiThought, setAiThought] = useState('');
  // 选中信息：当前选中 fabric Rect 索引（在 boxes 中），null 表示未选中
  const [selectedIdx, setSelectedIdx] = useState(null);
  // 选中表单的本地态（受控）
  const [selForm, setSelForm] = useState(null);

  const updateSelFormFromRect = useCallback((idx) => {
    const fc = fcRef.current;
    if (!fc) { setSelForm(null); return; }
    const all = fc.getObjects().filter((o) => o.kind === 'bbox');
    const r = all[idx];
    if (!r) { setSelForm(null); return; }
    const meta = r.__meta || {};
    setSelForm({
      id: meta.id || '',
      label: meta.label || '',
      type: meta.type || '',
      depth: meta.depth ?? 0,
      x: Math.round(r.left),
      y: Math.round(r.top),
      w: Math.round(r.width * (r.scaleX || 1)),
      h: Math.round(r.height * (r.scaleY || 1)),
      exportSlice: meta.exportSlice === true,
      ocrText: meta.ocrText || '',
      textRole: meta.textRole || '',
    });
  }, []);

  // 注：onFabricSelectionChange 已移到 highlightBox 之后，避免 TDZ（其依赖数组引用 highlightBox）。


  // ============ 工具函数 ============
  const rects = useCallback(() => {
    const fc = fcRef.current;
    if (!fc) return [];
    return fc.getObjects().filter((o) => o.kind === 'bbox');
  }, []);

  const realBox = useCallback((rect) => ({
    x: rect.left,
    y: rect.top,
    width: rect.width * (rect.scaleX || 1),
    height: rect.height * (rect.scaleY || 1),
  }), []);

  const snapshot = useCallback(() => rects().map((r) => ({
    ...realBox(r),
    meta: r.__meta ? { ...r.__meta } : null,
  })), [rects, realBox]);

  const updateHistoryButtons = useCallback(() => {
    setCanUndo(undoRef.current.length > 0);
    setCanRedo(redoRef.current.length > 0);
  }, []);

  const pushHistory = useCallback(() => {
    if (applyingHistoryRef.current) return;
    undoRef.current.push(snapshot());
    redoRef.current.length = 0;
    updateHistoryButtons();
  }, [snapshot, updateHistoryButtons]);

  // boxesRef：始终持有最新 boxes 数组（syncBoxesState 同步写入 + boxes state 变化时 effect 同步）。
  // 供 syncThumbnails 立即读取最新框，规避 setBoxes 异步导致的竞态。
  const boxesRef = useRef([]);
  useEffect(() => { boxesRef.current = boxes; }, [boxes]);

  const syncBoxesState = useCallback(() => {
    // 立即同步 boxesRef，让紧随其后调用的 syncThumbnails 能读到最新值（setBoxes 是异步的）
    const next = rects().map((r) => ({
      ...realBox(r),
      meta: r.__meta ? { ...r.__meta } : null,
    }));
    boxesRef.current = next;
    setBoxes(next);
    onDataChangeRef.current?.({ imageUrl: imageUrlRef.current, boxes: next });
  }, [rects, realBox]);

  // 用 sourceRef.imageData + exportBox 截取每个框对应区域，缩放后转 dataURL 缓存到 thumbnails。
  // 直接用 boxes state（与 ZIP 导出同源，保证坐标基准一致）。读 boxesRef.current 规避「syncBoxesState 后
  // boxes state 尚未更新就调 syncThumbnails」的竞态（手动调用紧挨 setBoxes 时闭包 boxes 是旧值）。
  // 防竞态：用 generation 计数，过时的异步结果丢弃。
  const thumbGenRef = useRef(0);
  const syncThumbnails = useCallback(() => {
    const src = sourceRef.current;
    const list = boxesRef.current;
    if (!src?.imageData || !list.length) { setThumbnails([]); return; }
    const gen = ++thumbGenRef.current;
    Promise.all(list.map((b) => {
      // 文本类型不截图（区域是纯文字，截图无视觉意义），返回 null 占位保持索引对齐
      if (b.meta?.type === 'Text') return null;
      try {
        const canvas = exportBox(src.imageData, b, { transparent: false });
        // 缩到最长边 40，避免大图渲染卡顿；dataURL 体积小
        const max = Math.max(canvas.width, canvas.height) || 1;
        const scale = Math.min(1, 40 / max);
        const w = Math.max(1, Math.round(canvas.width * scale));
        const h = Math.max(1, Math.round(canvas.height * scale));
        const tmp = document.createElement('canvas');
        tmp.width = w; tmp.height = h;
        tmp.getContext('2d').drawImage(canvas, 0, 0, w, h);
        return new Promise((res) => tmp.toBlob((blob) => {
          if (!blob) return res(null);
          const fr = new FileReader();
          fr.onload = () => res(fr.result);
          fr.onerror = () => res(null);
          fr.readAsDataURL(blob);
        }, 'image/png'));
      } catch {
        return null;
      }
    })).then((urls) => {
      // 过时的异步结果丢弃（boxes 已变化）
      if (thumbGenRef.current !== gen) return;
      setThumbnails(urls);
    }).catch(() => {
      if (thumbGenRef.current !== gen) return;
      setThumbnails([]);
    });
  }, []);

  // 把 fabric Rect 同步到最新配色/线宽/显示开关
  const restyleRects = useCallback(() => {
    const fc = fcRef.current;
    if (!fc) return;
    for (const r of rects()) {
      const lw = Number(lineWidth) || 1;
      r.set({ strokeWidth: lw });
    }
    fc.requestRenderAll();
  }, [rects, lineWidth]);

  // ============ 配色：按类型（meta.type）固定分配 PALETTE 色 ============
  // 同类型同色，空 type 归 '其它'。用类型字符串哈希取色，颜色稳定不随顺序变化。
  const typeColorCache = useRef({});
  const colorByType = useCallback((type) => {
    const key = type || '其它';
    if (typeColorCache.current[key]) return typeColorCache.current[key];
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    const c = PALETTE[h % PALETTE.length];
    typeColorCache.current[key] = c;
    return c;
  }, []);
  const getColor = useCallback((_depth, _parentColor, _idx, type) => colorByType(type), [colorByType]);

  // ============ JSON 解析：递归 children + 配色 ============
  // 支持：
  // 1) { title, elements:[{id,type,label,coords:[x,y,w,h],parentId,exportSlice,ocrText,textRole,children}] }
  // 2) { ui_elements:[{id,label,bbox_2d:[x1,y1,x2,y2],children}] }
  // 统一输出：{ box:{x,y,width,height}, meta:{id,label,depth,color,type,exportSlice,ocrText,textRole} }
  const flatten = useCallback((els, depth, parentColor, out) => {
    const toBox = (el) => {
      if (Array.isArray(el?.bbox_2d) && el.bbox_2d.length >= 4) {
        const [x1, y1, x2, y2] = el.bbox_2d.map(Number);
        return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
      }
      if (Array.isArray(el?.coords) && el.coords.length >= 4) {
        const [x, y, w, h] = el.coords.map(Number);
        return { x, y, width: w, height: h };
      }
      return null;
    };
    const walk = (list, d, pColor) => {
      for (const el of list) {
        const box = toBox(el);
        if (!box || !Number.isFinite(box.x) || !Number.isFinite(box.y) || box.width <= 0 || box.height <= 0) {
          // 无有效坐标但有 children：容器节点向下传递（保持父级色）
          if (el?.children) walk(el.children, d, pColor);
          continue;
        }
        const color = getColor(d, pColor, out.length, el.type || '');
        out.push({
          box,
          meta: {
            id: el.id || '',
            label: el.label || '',
            depth: d,
            color,
            type: el.type || '',
            exportSlice: el.exportSlice,
            ocrText: el.ocrText || '',
            textRole: el.textRole || '',
          },
        });
        if (el.children) walk(el.children, d + 1, color);
      }
    };
    walk(els, depth, parentColor);
    return out;
  }, [getColor]);

  // 计算 bbox 坐标系基准（1000 vs 像素）：扫所有 box 的 max(x+w, y+h)
  const getBBoxBasis = useCallback((all) => {
    let maxX = 0;
    let maxY = 0;
    for (const { box } of all) {
      maxX = Math.max(maxX, box.x + box.width);
      maxY = Math.max(maxY, box.y + box.height);
    }
    const nat = sourceRef.current;
    const natW = nat?.canvas?.width || 0;
    const natH = nat?.canvas?.height || 0;
    // bbox 值都 ≤1000 且图片 >1000px → 1000 坐标系，否则像素坐标系
    if (maxX <= 1000 && maxY <= 1000 && (natW > 1000 || natH > 1000)) {
      return { w: 1000, h: 1000, label: '1000坐标系' };
    }
    return { w: natW || maxX, h: natH || maxY, label: '像素坐标系' };
  }, []);

  // ============ 添加 bbox Rect（带标签/ID 子对象） ============
  // exportSlice=true 的框用半透明绿色填充 + 绿色描边，视觉区分「可导出资产」vs「容器面板」
  const addBBoxRect = useCallback((box, meta) => {
    const fc = fcRef.current;
    const fabric = fabricLibRef.current;
    if (!fc || !fabric) return;
    const isSlice = meta?.exportSlice === true;
    const color = meta?.color || PALETTE[0];
    const rect = new fabric.Rect({
      left: box.x,
      top: box.y,
      width: box.width,
      height: box.height,
      fill: isSlice ? 'rgba(34,197,94,0.12)' : 'rgba(0,0,0,0)',
      stroke: isSlice ? '#22c55e' : color,
      strokeWidth: Number(lineWidth) || 2,
      strokeDashArray: isSlice ? null : [4, 3],
      cornerColor: isSlice ? '#22c55e' : color,
      transparentCorners: false,
      objectCaching: false,
      borderColor: isSlice ? '#22c55e' : color,
      // 自由比例缩放：角点不锁定宽高比（默认 true 会等比例缩放）
      uniformScaling: false,
    });
    rect.kind = 'bbox';
    rect.__meta = meta ? { ...meta, color } : { color };
    fc.add(rect);
  }, [lineWidth]);

  // 切换标签/ID 子对象显示（每次 showLabel/showId 变化时重建装饰对象）
  const refreshLabels = useCallback(() => {
    const fc = fcRef.current;
    const fabric = fabricLibRef.current;
    if (!fc || !fabric) return;
    // 移除旧装饰对象
    for (const o of fc.getObjects().filter((x) => x.kind === 'bbox-deco')) fc.remove(o);
    // 重建
    for (const r of rects()) {
      const meta = r.__meta || {};
      if (showLabel && meta.label) {
        const text = new fabric.Text(String(meta.label), {
          fontSize: 12,
          fill: '#fff',
          backgroundColor: r.stroke,
          left: r.left,
          top: r.top - 16,
          selectable: false,
          evented: false,
          objectCaching: false,
        });
        text.kind = 'bbox-deco';
        fc.add(text);
      }
      if (showId && meta.id) {
        const idt = new fabric.Text(String(meta.id), {
          fontSize: 10,
          fill: 'rgba(255,255,255,0.85)',
          backgroundColor: 'rgba(0,0,0,0.5)',
          left: r.left + r.width * (r.scaleX || 1) - 40,
          top: r.top + r.height * (r.scaleY || 1) + 2,
          selectable: false,
          evented: false,
          objectCaching: false,
        });
        idt.kind = 'bbox-deco';
        fc.add(idt);
      }
    }
    // 保证 bbox Rect 在装饰之上（否则标签被框压住）
    for (const r of rects()) fc.bringObjectToFront?.(r);
    fc.requestRenderAll();
  }, [rects, showLabel, showId]);

  // ============ 加载 JSON ============
  // 保存最近一次解析的 flatten 结果 + 坐标系基准，供切 showChildren 开关时复用重新渲染
  const lastFlatRef = useRef(null);    // { all, basisLabel }
  // 按 showChildren 过滤渲染已 flatten 的 bbox 列表（清旧框→过滤→加框→刷新标签/缩略图）。
  // silent=true 时不 pushHistory（避免切开关刷爆撤销栈）；sx/sy 从 sourceRef + basis 实时重算。
  const renderFlattened = useCallback((all, basisLabel, { silent = false } = {}) => {
    const fc = fcRef.current;
    if (!fc) return 0;
    const natW = sourceRef.current?.canvas?.width || 0;
    const natH = sourceRef.current?.canvas?.height || 0;
    let sx = 1; let sy = 1;
    // 1000 坐标系判定与 getBBoxBasis 同源：basisLabel 标记时按 1000 缩放
    if (basisLabel === '1000坐标系') {
      sx = natW ? natW / 1000 : 1;
      sy = natH ? natH / 1000 : 1;
    }
    if (!silent) pushHistory();
    for (const r of rects()) fc.remove(r);
    let count = 0;
    all.forEach(({ box, meta }) => {
      if (meta.depth > 0 && !showChildren) return;
      addBBoxRect(
        { x: box.x * sx, y: box.y * sy, width: box.width * sx, height: box.height * sy },
        meta,
      );
      count += 1;
    });
    refreshLabels();
    syncBoxesState();
    syncThumbnails();
    return count;
  }, [pushHistory, rects, addBBoxRect, refreshLabels, syncBoxesState, syncThumbnails, showChildren]);

  const applyJsonData = useCallback((data) => {
    const fc = fcRef.current;
    if (!fc) return;
    const els = Array.isArray(data?.elements)
      ? data.elements
      : (Array.isArray(data?.ui_elements) ? data.ui_elements : (Array.isArray(data) ? data : []));
    if (!els.length) {
      setStatus(data?.title ? `已加载标题「${data.title}」但无 elements/ui_elements` : 'JSON 无 elements/ui_elements');
      return;
    }
    const all = flatten(els, 0, null, []);
    const basis = getBBoxBasis(all);
    // 缓存 flatten 结果 + 坐标系标签，供切 showChildren 时复用
    lastFlatRef.current = { all, basisLabel: basis.label };
    const count = renderFlattened(all, basis.label);
    const titleSuffix = data?.title ? `「${data.title}」` : '';
    setStatus(`已加载 ${count} 个 bbox${titleSuffix}（${basis.label}）`);
  }, [flatten, getBBoxBasis, renderFlattened]);

  const handleJsonFile = useCallback(async (file) => {
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      applyJsonData(data);
    } catch (err) {
      setError(`JSON 解析失败: ${err?.message || err}`);
    }
  }, [applyJsonData]);

  const jsonInputRef = useRef(null);

  // ============ 应用交互模式到 fabric ============
  const applyMode = useCallback(() => {
    const fc = fcRef.current;
    if (!fc) return;
    const isPan = modeRef.current === MODE.PAN;
    if (isPan) {
      fc.selection = false;
      fc.defaultCursor = 'grab';
      fc.hoverCursor = 'grab';
      fc.moveCursor = 'grabbing';
      for (const r of rects()) r.selectable = false;
    } else {
      fc.selection = true;
      fc.defaultCursor = 'crosshair';
      fc.hoverCursor = 'move';
      fc.moveCursor = 'move';
      // 隐藏的框（被类型过滤）不可选中
      for (const r of rects()) r.selectable = r.visible !== false;
    }
    fc.requestRenderAll();
  }, [rects]);

  const setMode = useCallback((m) => {
    modeRef.current = m;
    applyMode();
  }, [applyMode]);

  // ============ fitToStage（声明在 handleAiAnalyze 之前避免 TDZ）============
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

  // ============ 复制 AI 分析 prompt（systemPrompt + userPrompt + 图片地址）到剪贴板 ============
  const handleCopyPrompt = useCallback(async () => {
    const AS = window.AgentSpaces;
    const ac = agentConfigRef.current;
    const userPrompt = (ac?.userPrompt || '').replace(/\{imageUrl\}/g, imageUrl || '').trim();
    const url = imageUrl || '';
    // systemPrompt 归 agent preset，需调 list_agent_presets 实时拉取（host 层已扩展返回该字段）
    let systemPrompt = '';
    if (AS?.callPluginTool && ac?.id) {
      try {
        const ret = await AS.callPluginTool(BUILTIN_PLUGIN, 'list_agent_presets', {});
        const presets = ret?.presets || ret?.result?.presets || [];
        const p = presets.find((x) => x?.id === ac.id);
        systemPrompt = p?.systemPrompt || '';
      } catch (err) {
        console.warn('[bbox-viewer] 拉 systemPrompt 失败，仅复制 userPrompt:', err?.message || err);
      }
    }
    const text = [
      '# Agent 系统提示词 (systemPrompt)',
      systemPrompt || '(未配置或未读取到 systemPrompt)',
      '',
      '# 分析布局 Prompt (userPrompt)',
      userPrompt || '(未配置 userPrompt)',
    ].join('\n');
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // 兜底：用临时 textarea + execCommand
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setPromptCopied(true);
      setStatus('已复制 systemPrompt + userPrompt + 图片地址到剪贴板');
      setTimeout(() => setPromptCopied(false), 1500);
    } catch (err) {
      console.error('[bbox-viewer] copy prompt failed:', err);
      setError(`复制失败: ${err?.message || err}`);
    }
  }, [imageUrl]);

  // ============ AI 分析图片（agent_run）============
  const handleAiAnalyze = useCallback(async () => {
    const AS = window.AgentSpaces;
    const ac = agentConfigRef.current;
    if (!AS?.callPluginTool) { setError('宿主 callPluginTool 不可用'); return; }
    if (!imageUrl) { setError('图片未加载'); return; }
    if (!ac?.id) {
      setError('未配置 AI 模型，请先到「设置 → BBox AI 分析」配置');
      return;
    }
    setAnalyzing(true);
    setError('');
    // 新建 AbortController：用户点「停止」时 abort，中断前端 fetch 等待
    const abort = new AbortController();
    analyzeAbortRef.current = abort;
    // 显式生成 taskId 并自管，传给 callPluginTool 让 host 不走兜底 ref（多调用方并发互不覆盖）
    const taskId = (window.crypto?.randomUUID?.() || `task_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    analyzeTaskIdRef.current = taskId;
    // 切到「AI思考过程」tab
    setRightTab('ai');
    setAiThought('### AI 分析任务启动\n\n- **Agent**：`' + (ac?.id || '?') + '`');
    setStatus('✨ 准备图片中…');
    try {
      // 1. 原图 >2MB 才压缩（仅降体积、不改尺寸），否则直接用原图 dataUrl
      //    压缩不改尺寸 → AI 看到的图与画布显示的原图坐标 1:1 同源，画布背景图/sourceRef 保持原图不变
      setAiThought((t) => t + '\n\n⏳ 准备图片中（原图超过阈值时压缩体积，不改尺寸）…');
      const dataUrl = await compressToDataUrl(imageUrl, {
        thresholdMB: ac.compressThresholdMB,
        targetMB: ac.compressTargetMB,
      });
      if (abort.signal.aborted) return;
      setAiThought((t) => t + '\n✅ 图片已就绪，传给视觉模型（画布仍显示原图）。');
      // 2. 传图给 AI（坐标基于原图尺寸，与画布背景图同源，sx=1 零换算）
      setStatus('✨ AI 分析中（可能需要数十秒）…');
      setAiThought((t) => t + '\n\n🤖 调用视觉模型分析中（可能需要数十秒）…');
      const userPrompt = (ac.userPrompt || '').replace(/\{imageUrl\}/g, ''); // 兼容旧模板里的占位符
      const ret = await AS.callPluginTool(
        BUILTIN_PLUGIN,
        'agent_run',
        {
          prompt: userPrompt.trim(),
          agentConfigId: ac.id,
          permissionMode: 'bypassPermissions',
          images: [dataUrl],
        },
        { taskId, signal: abort.signal },
      );
      // host 层 executePluginTool 在 HTTP 错误时不抛异常而是返回错误 payload，
      // 这里显式判定错误响应（含 error/success===false/非 2xx status），转成异常走 catch
      if (ret && typeof ret === 'object' && (ret.error || ret.success === false)) {
        const errMsg = ret.error?.message || ret.error || ret.message || '调用失败';
        throw new Error(typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg));
      }
      // 3. 解析返回 JSON → 渲染框（AI 坐标基于原图尺寸，与画布同源，sx=1 零换算）
      const raw = ret?.result || ret?.output || (typeof ret === 'string' ? ret : '') || '';
      setAiThought((t) => t + '\n\n### AI 返回原文\n\n' + (raw || '(空)'));
      let data;
      try {
        data = extractJsonFromText(raw);
      } catch (parseErr) {
        // 解析失败时把 AI 原始返回也带进错误信息，方便用户排查
        const preview = (raw || '').slice(0, 200);
        const e = new Error(`AI 返回内容不是有效 JSON：${parseErr.message}；原文：${preview}${raw.length > 200 ? '…' : ''}`);
        e.raw = raw;
        throw e;
      }
      applyJsonData(data);
      setStatus(`✨ AI 分析完成，已渲染框`);
      // AI 分析完自动切回列表 tab
      setRightTab('list');
    } catch (err) {
      // 用户主动停止：abort 触发 fetch AbortError，不算失败
      if (abort.signal.aborted || err?.name === 'AbortError') {
        setStatus('已停止 AI 分析');
        setAiThought((t) => t + '\n\n⏹ **已停止**（已通知后端中断 agent 执行）');
        return;
      }
      console.error('[bbox-viewer] AI analyze failed:', err);
      const msg = err?.message || (typeof err === 'string' ? err : JSON.stringify(err));
      setError(`AI 分析失败：${msg}`);
      setStatus('❌ AI 分析失败');
      setAiThought((t) => t + `\n\n❌ **分析失败**：${msg}\n\n请检查：\n- AI 模型是否配置正确（设置 → BBox AI 分析）\n- 网络是否可达\n- 上方「AI 返回原文」是否有内容`);
      // 失败时停留在 AI思考 tab，让用户看到错误详情
    } finally {
      // 仅当本次 controller/taskId 仍是自己时清理（避免被新一轮调用覆盖后又清掉）
      if (analyzeAbortRef.current === abort) analyzeAbortRef.current = null;
      if (analyzeTaskIdRef.current === taskId) analyzeTaskIdRef.current = null;
      setAnalyzing(false);
    }
  }, [imageUrl, applyJsonData]);

  // 停止 AI 分析：用本次 taskId 精确停止后端 agent_run（不误伤画布其他并发任务）；
  // 同时 abort 前端 controller 让 fetch 立即结束等待（双保险，WS 不通时也能恢复 UI）。
  const handleStopAnalyze = useCallback(() => {
    const tid = analyzeTaskIdRef.current;
    try {
      if (tid) window.AgentSpaces?.stopAgentRun?.(tid);
    } catch (err) {
      console.warn('[bbox-viewer] stopAgentRun failed:', err?.message || err);
    }
    analyzeAbortRef.current?.abort();
  }, []);

  // ============ 切换图例高亮（含区域外黑色遮罩镂空）============
  // 实现：用 4 块黑色半透明 Rect 围住高亮框，形成「画布其它区域被压暗、框内亮」的聚光灯效果。
  // 4 块遮罩相对高亮框的位置：上 / 下 / 左 / 右（用 sourceRef 原图尺寸作为画布范围）。
  const highlightBox = useCallback((idx) => {
    const fc = fcRef.current;
    const fabric = fabricLibRef.current;
    if (!fc) return;
    const all = rects();
    // 先移除旧遮罩 + 复位框样式
    for (const o of fc.getObjects().filter((x) => x.kind === 'bbox-mask')) fc.remove(o);
    for (const r of all) {
      r.set({ opacity: 1, strokeWidth: Number(lineWidth) || 2 });
    }
    highlightedRef.current = null;
    const target = all[idx];
    if (target) {
      target.set({
        opacity: 1,
        strokeWidth: (Number(lineWidth) || 2) + 2,
        fill: 'rgba(255,255,0,0.15)',
      });
      highlightedRef.current = target;
      // 把其它框变暗
      for (const r of all) {
        if (r !== target) r.set({ opacity: 0.25, fill: 'rgba(0,0,0,0)' });
      }
      // 区域外黑色遮罩镂空（4 块围住高亮框）
      const src = sourceRef.current;
      const cw = src?.canvas?.width || fc.getWidth();
      const ch = src?.canvas?.height || fc.getHeight();
      const bx = target.left;
      const by = target.top;
      const bw = target.width * (target.scaleX || 1);
      const bh = target.height * (target.scaleY || 1);
      const maskFill = 'rgba(0,0,0,0.55)';
      const makeMask = (left, top, width, height) => {
        const m = new fabric.Rect({
          left, top, width, height,
          fill: maskFill,
          selectable: false, evented: false,
          objectCaching: false,
        });
        m.kind = 'bbox-mask';
        fc.add(m);
      };
      makeMask(0, 0, cw, Math.max(0, by));                       // 上
      makeMask(0, by + bh, cw, Math.max(0, ch - (by + bh)));     // 下
      makeMask(0, by, Math.max(0, bx), bh);                      // 左
      makeMask(bx + bw, by, Math.max(0, cw - (bx + bw)), bh);    // 右
      // 层级：遮罩应在框之下、背景图之上。fabric 5 对象方法为 sendToBack/bringToFront。
      for (const o of fc.getObjects().filter((x) => x.kind === 'bbox-mask')) {
        o.sendToBack?.();
      }
      // 遮罩已送到底层，只需把装饰标签置顶。不要对 bbox 调 bringToFront：
      // 列表通过 rects() 的稳定顺序按索引关联，重排会导致后续 hover 高亮到其它框。
      for (const o of fc.getObjects().filter((x) => x.kind === 'bbox-deco')) o.bringToFront?.();
    } else {
      for (const r of all) r.set({ fill: 'rgba(0,0,0,0)' });
    }
    fc.requestRenderAll();
  }, [rects, lineWidth]);

  // fabric 选中变化回调（绑定到 fc 上）。
  // 选中框时联动 highlightBox 显示遮罩（与列表 hover 等效），取消选中时清除遮罩。
  // 必须声明在 highlightBox 之后：其依赖数组引用 highlightBox，否则 TDZ。
  const onFabricSelectionChange = useCallback(() => {
    const fc = fcRef.current;
    if (!fc) return;
    const active = fc.getActiveObject();
    if (active && active.kind === 'bbox') {
      const all = fc.getObjects().filter((o) => o.kind === 'bbox');
      const idx = all.indexOf(active);
      if (idx >= 0) {
        setSelectedIdx(idx);
        updateSelFormFromRect(idx);
        highlightBox(idx);
        setRightTab('selected');
        return;
      }
    }
    setSelectedIdx(null);
    setSelForm(null);
    highlightBox(null);
  }, [updateSelFormFromRect, highlightBox]);

  const focusBox = useCallback((idx) => {
    const fc = fcRef.current;
    const src = sourceRef.current;
    if (!fc || !src) return;
    const b = boxes[idx];
    if (!b) return;
    const cw = fc.getWidth();
    const ch = fc.getHeight();
    const bw = Math.max(b.width, 1);
    const bh = Math.max(b.height, 1);
    // 缩放到框占画布 60%，留边距
    const zoom = Math.min(cw / bw, ch / bh) * 0.6;
    const cx = b.x + bw / 2;
    const cy = b.y + bh / 2;
    fc.setViewportTransform([zoom, 0, 0, zoom, cw / 2 - cx * zoom, ch / 2 - cy * zoom]);
    fc.requestRenderAll();
  }, [boxes]);

  // ============ 删除/清空 ============
  const deleteSelected = useCallback(() => {
    const fc = fcRef.current;
    if (!fc) return false;
    const active = fc.getActiveObject();
    const selected = rects().filter((r) => r.active || active === r);
    if (!selected.length) return false;
    pushHistory();
    for (const r of selected) fc.remove(r);
    fc.discardActiveObject();
    refreshLabels();
    syncBoxesState();
    syncThumbnails();
    setSelectedIdx(null);
    setSelForm(null);
    setStatus(`已删除 ${selected.length} 个框`);
    return true;
  }, [rects, pushHistory, refreshLabels, syncBoxesState]);

  const clearAll = useCallback(() => {
    const fc = fcRef.current;
    if (!fc) return;
    const all = rects();
    if (!all.length) return;
    pushHistory();
    for (const r of all) fc.remove(r);
    refreshLabels();
    syncBoxesState();
    syncThumbnails();
    setSelectedIdx(null);
    setSelForm(null);
    setStatus('已清空所有框');
  }, [rects, pushHistory, refreshLabels, syncBoxesState]);

  // ============ 撤销/重做 ============
  const applySnapshot = useCallback((snap) => {
    const fc = fcRef.current;
    if (!fc) return;
    applyingHistoryRef.current = true;
    for (const r of rects()) fc.remove(r);
    for (const b of snap) addBBoxRect(b, b.meta);
    applyingHistoryRef.current = false;
    refreshLabels();
    syncBoxesState();
    syncThumbnails();
    updateHistoryButtons();
  }, [rects, addBBoxRect, refreshLabels, syncBoxesState, updateHistoryButtons]);

  const undo = useCallback(() => {
    if (!undoRef.current.length) return;
    redoRef.current.push(snapshot());
    applySnapshot(undoRef.current.pop());
  }, [snapshot, applySnapshot]);

  const redo = useCallback(() => {
    if (!redoRef.current.length) return;
    undoRef.current.push(snapshot());
    applySnapshot(redoRef.current.pop());
  }, [snapshot, applySnapshot]);

  // ============ 选中信息表单：把 selForm 写回 fabric Rect ============
  const applySelForm = useCallback(() => {
    const fc = fcRef.current;
    if (!fc || !selForm || selectedIdx == null) return;
    const all = rects();
    const r = all[selectedIdx];
    if (!r) return;
    pushHistory();
    // 记录旧几何，用于判断是否需失效抠图结果（区域变了旧抠图不再匹配）
    const oldBox = realBox(r);
    r.set({
      left: Number(selForm.x) || 0,
      top: Number(selForm.y) || 0,
      scaleX: 1,
      scaleY: 1,
      width: Math.max(1, Number(selForm.w) || 1),
      height: Math.max(1, Number(selForm.h) || 1),
    });
    r.setCoords();
    // meta 回写：exportSlice 改变时同步 fill/stroke 风格
    const meta = r.__meta || {};
    meta.id = selForm.id || '';
    meta.label = selForm.label || '';
    meta.type = selForm.type || '';
    meta.exportSlice = selForm.exportSlice === true;
    if ('ocrText' in selForm) meta.ocrText = selForm.ocrText || '';
    if ('textRole' in selForm) meta.textRole = selForm.textRole || '';
    // 几何变化 → 失效该框抠图结果
    const geomChanged = oldBox.x !== r.left || oldBox.y !== r.top
      || Math.round(oldBox.width) !== Math.round(r.width * (r.scaleX || 1))
      || Math.round(oldBox.height) !== Math.round(r.height * (r.scaleY || 1));
    if (geomChanged && meta.cutoutUrl) {
      delete meta.cutoutUrl;
      setCutoutUrls((prev) => { if (!prev[selectedIdx]) return prev; const n = { ...prev }; delete n[selectedIdx]; return n; });
      setStatus(`框 ${meta.id || meta.label || selectedIdx + 1} 区域已变，抠图结果已失效`);
    }
    r.__meta = meta;
    const isSlice = meta.exportSlice === true;
    r.set({
      fill: isSlice ? 'rgba(34,197,94,0.12)' : 'rgba(0,0,0,0)',
      stroke: isSlice ? '#22c55e' : (meta.color || PALETTE[0]),
      strokeDashArray: isSlice ? null : [4, 3],
      borderColor: isSlice ? '#22c55e' : (meta.color || PALETTE[0]),
    });
    fc.discardActiveObject();
    refreshLabels();
    syncBoxesState();
    syncThumbnails();
    fc.requestRenderAll();
    setStatus(`已更新框 ${meta.id || meta.label || selectedIdx + 1}`);
  }, [rects, selectedIdx, selForm, pushHistory, refreshLabels, syncBoxesState]);

  const deleteSelectedFromForm = useCallback(() => {
    if (selectedIdx == null) return;
    const ok = deleteSelected();
    if (ok) setRightTab('list');
  }, [deleteSelected, selectedIdx]);

  // 列表项 checkbox：切换该框的 exportSlice（true=纳入 ZIP/画布导出）
  // 联动 fabric 框样式（绿实线 vs 配色虚线）+ syncBoxesState 让计数/底部按钮同步
  const toggleExportSlice = useCallback((idx) => {
    const fc = fcRef.current;
    if (!fc) return;
    const all = rects();
    const r = all[idx];
    if (!r) return;
    pushHistory();
    const meta = r.__meta || {};
    meta.exportSlice = meta.exportSlice !== true;
    r.__meta = meta;
    const isSlice = meta.exportSlice === true;
    r.set({
      fill: isSlice ? 'rgba(34,197,94,0.12)' : 'rgba(0,0,0,0)',
      stroke: isSlice ? '#22c55e' : (meta.color || PALETTE[0]),
      strokeDashArray: isSlice ? null : [4, 3],
      borderColor: isSlice ? '#22c55e' : (meta.color || PALETTE[0]),
    });
    refreshLabels();
    syncBoxesState();
    fc.requestRenderAll();
  }, [rects, pushHistory, refreshLabels, syncBoxesState]);

  // 元素拆分：按 meta.type 聚合统计（空 type 归为 '其它'），返回 [{type, count}] 按数量降序
  const typeStats = useMemo(() => {
    const counts = new Map();
    for (const b of boxes) {
      const t = b.meta?.type || '其它';
      counts.set(t, (counts.get(t) || 0) + 1);
    }
    return [...counts.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);
  }, [boxes]);

  // 切换某类型激活态（多选）：点击已激活则取消，未激活则加入；空集合表示不过滤
  const toggleTypeFilter = useCallback((type) => {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  // 过滤联动（核心）：activeTypes 非空时，画布里"非匹配类型"的框全部隐藏，
  // 且 exportSlice 强制为 false（checkbox 取消、不纳入 ZIP/画布导出）。
  // activeTypes 清空时全部恢复显示。整批改动 pushHistory 可撤销。
  const applyTypeFilter = useCallback(() => {
    const fc = fcRef.current;
    if (!fc) return;
    const all = rects();
    if (!all.length) return;
    const active = activeTypes.size > 0;
    let changed = false;
    for (const r of all) {
      const meta = r.__meta || {};
      const matched = !active || activeTypes.has(meta.type || '其它');
      // 非匹配类型：强制 exportSlice=false（取消 checkbox）
      if (!matched && meta.exportSlice === true) {
        if (!changed) { pushHistory(); changed = true; }
        meta.exportSlice = false;
        r.__meta = meta;
        r.set({
          fill: 'rgba(0,0,0,0)',
          stroke: meta.color || PALETTE[0],
          strokeDashArray: [4, 3],
          borderColor: meta.color || PALETTE[0],
        });
      }
      // 画布显示：非匹配类型隐藏
      if ((!!r.visible) !== matched) {
        if (!changed) { pushHistory(); changed = true; }
        r.set({ visible: matched, selectable: matched && modeRef.current === MODE.DRAW });
      }
    }
    if (changed) {
      refreshLabels();
      syncBoxesState();
      syncThumbnails();
      fc.discardActiveObject?.();
      fc.requestRenderAll();
    }
  }, [rects, activeTypes, pushHistory, refreshLabels, syncBoxesState]);

  // activeTypes 变化时联动画布显示 + checkbox/exportSlice
  useEffect(() => {
    if (!open) return;
    applyTypeFilter();
  }, [open, activeTypes, applyTypeFilter]);

  // ============ 抠图（元素拆分批量 / 单项）============
  // 打开抠图对话框前，先把目标框导出成临时图 URL（用 exportBox + uploadFile 上传），
  // 作为抠图输入。dialog 完成后回填 cutoutUrls[index]。
  // 导出输入图：复用 sourceRef.imageData + exportBox（与 ZIP/画布导出同源坐标）。
  const exportBoxesToUrls = useCallback(async (idxList) => {
    const AS = window.AgentSpaces;
    const src = sourceRef.current;
    if (!AS?.uploadFile) throw new Error('宿主 uploadFile 不可用');
    if (!src) throw new Error('图片未加载');
    const list = (idxList || []).filter((i) => boxes[i]).map((i) => ({ i, b: boxes[i] }));
    const out = {};
    await Promise.all(list.map(async ({ i, b }) => {
      try {
        // Text 类型无视觉意义，跳过
        if (b.meta?.type === 'Text') return;
        const canvas = exportBox(src.imageData, b, { transparent: false });
        const blob = await new Promise((res) => canvas.toBlob((bb) => res(bb), 'image/png'));
        const meta = b.meta || {};
        const name = `${meta.label || meta.id || `box_${i + 1}`}.png`.replace(/[\\/:*?"<>|]/g, '_');
        const file = new File([blob], name, { type: 'image/png' });
        const uploaded = await AS.uploadFile(file);
        const httpUrl = uploaded?.url || uploaded?.httpPath;
        if (httpUrl) out[i] = httpUrl;
      } catch (err) {
        console.warn('[bbox-viewer] export box for cutout failed:', i, err);
      }
    }));
    return out; // { [boxIndex]: url }
  }, [boxes]);

  // 批量抠图：对当前可见（过滤后）的框执行
  const handleBatchCutout = useCallback(async () => {
    const visibleIdx = boxes
      .map((b, i) => i)
      .filter((i) => activeTypes.size === 0 || activeTypes.has(boxes[i].meta?.type || '其它'));
    if (!visibleIdx.length) { setError('没有可抠图的元素'); return; }
    try {
      const inputs = await exportBoxesToUrls(visibleIdx);
      const idxWithUrl = visibleIdx.filter((i) => inputs[i]);
      if (!idxWithUrl.length) { setError('导出元素失败'); return; }
      setCutoutTarget({ indexes: idxWithUrl, inputs });
    } catch (err) {
      setError(err?.message || String(err));
    }
  }, [boxes, activeTypes, exportBoxesToUrls]);

  // 单项抠图
  const handleItemCutout = useCallback(async (i) => {
    const b = boxes[i];
    if (!b) return;
    if (b.meta?.type === 'Text') { setError('文本类型不支持抠图'); return; }
    try {
      const inputs = await exportBoxesToUrls([i]);
      if (!inputs[i]) { setError('导出元素失败'); return; }
      setCutoutTarget({ indexes: [i], inputs });
    } catch (err) {
      setError(err?.message || String(err));
    }
  }, [boxes, exportBoxesToUrls]);

  // 抠图对话框关闭/完成回调
  // 完成时把结果写回 fabric Rect 的 meta.cutoutUrl（随 syncBoxesState → onDataChange 持久化到节点 bboxData），
  // 同时更新 cutoutUrls state 驱动缩略图刷新。
  const handleCutoutDialogClose = useCallback(async (result) => {
    const target = cutoutTarget;
    // result = { ok:true, urls:string[] } 表示完成；undefined = 取消
    if (result?.ok && target) {
      const urls = result.urls || [];
      const indexes = target.indexes || [];
      // 写回 fabric Rect meta（持久化路径）
      const fc = fcRef.current;
      if (fc) {
        const all = fc.getObjects().filter((o) => o.kind === 'bbox');
        urls.forEach((u, k) => {
          const idx = indexes[k];
          if (u && idx != null && all[idx]) {
            const r = all[idx];
            const meta = r.__meta || {};
            meta.cutoutUrl = u;
            r.__meta = meta;
            // 记录本次抠图时的几何快照，后续几何变化据此判断失效
            r.__cutoutGeom = {
              x: r.left,
              y: r.top,
              w: r.width * (r.scaleX || 1),
              h: r.height * (r.scaleY || 1),
            };
          }
        });
      }
      // 更新 state（驱动缩略图）
      setCutoutUrls((prev) => {
        const next = { ...prev };
        urls.forEach((u, k) => {
          const idx = indexes[k];
          if (u && idx != null) next[idx] = u;
        });
        return next;
      });
      syncBoxesState(); // 触发 onDataChange 持久化
      setStatus(`✂️ 抠图完成，${urls.filter(Boolean).length} 张已更新`);
    }
    setCutoutTarget(null);
  }, [cutoutTarget, syncBoxesState]);

  // 删除某框的抠图结果（同步清 meta + 持久化）
  const removeCutoutUrl = useCallback((i) => {
    const fc = fcRef.current;
    if (fc) {
      const all = fc.getObjects().filter((o) => o.kind === 'bbox');
      if (all[i]) {
        const meta = all[i].__meta || {};
        delete meta.cutoutUrl;
        all[i].__meta = meta;
        delete all[i].__cutoutGeom;
      }
    }
    setCutoutUrls((prev) => {
      if (!prev[i]) return prev;
      const next = { ...prev };
      delete next[i];
      return next;
    });
    syncBoxesState();
  }, [syncBoxesState]);

  // 对话框关闭时清空抠图状态（避免下次复用）
  useEffect(() => {
    if (!open) {
      setCutoutTarget(null);
      setCutoutUrls({});
    }
  }, [open]);

  // ============ 打开对话框：加载 fabric + 图 ============
  useEffect(() => {
    if (!open) return;
    const urls = (inputImages || []).filter(Boolean);
    if (!urls.length) { setError('没有输入图片'); return; }
    const first = urls[0];
    setImageUrl(first);
    imageUrlRef.current = first;
    let disposed = false;
    setLoading(true);
    setError('');
    setStatus('正在加载编辑器…');
    undoRef.current = [];
    redoRef.current = [];
    modeRef.current = MODE.DRAW;
    setRightTab('list');
    setAiThought('');
    setSelectedIdx(null);
    setSelForm(null);

    (async () => {
      try {
        const fabric = await getFabric();
        if (disposed) return;
        fabricLibRef.current = fabric;
        const source = await loadImageSource(first);
        if (disposed) return;
        sourceRef.current = source;
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
        // 节点数据只在背景图一致时恢复，避免换图后沿用旧图坐标。
        const saved = initialDataRef.current;
        const savedBoxes = saved?.imageUrl === first && Array.isArray(saved?.boxes) ? saved.boxes : [];
        let restoredCount = 0;
        for (const savedBox of savedBoxes) {
          const box = {
            x: Number(savedBox?.x),
            y: Number(savedBox?.y),
            width: Number(savedBox?.width),
            height: Number(savedBox?.height),
          };
          if (!Number.isFinite(box.x) || !Number.isFinite(box.y) || box.width <= 0 || box.height <= 0) continue;
          addBBoxRect(box, savedBox?.meta || null);
          restoredCount += 1;
        }
        // 从持久化的 meta.cutoutUrl 重建抠图结果 state（按 fabric Rect 顺序对齐）
        // 同时用恢复的几何初始化 __cutoutGeom 快照（用于后续几何变化失效判断）
        const restoredCutout = {};
        const allRects = fc.getObjects().filter((o) => o.kind === 'bbox');
        savedBoxes.forEach((sb, k) => {
          if (sb?.meta?.cutoutUrl && allRects[k]) {
            restoredCutout[k] = sb.meta.cutoutUrl;
            allRects[k].__cutoutGeom = {
              x: Number(sb.x) || allRects[k].left,
              y: Number(sb.y) || allRects[k].top,
              w: Number(sb.width) || allRects[k].width,
              h: Number(sb.height) || allRects[k].height,
            };
          }
        });
        if (Object.keys(restoredCutout).length) setCutoutUrls(restoredCutout);
        fabric.Image.fromURL(source.canvas.toDataURL('image/png'), (img) => {
          if (disposed) return;
          img.selectable = false;
          img.evented = false;
          fc.setBackgroundImage(img, () => {
            if (disposed) return;
            fitToStage();
            fc.renderAll();
          });
        });
        // 初始应用交互模式（draw）
        applyMode();
        setLoading(false);
        setStatus(restoredCount > 0
          ? `已从节点恢复 ${restoredCount} 个 bbox。`
          : '编辑器就绪。选择框选/平移工具，Alt 也可强制拉框。可导入 JSON 或点「AI 分析」。');
        updateHistoryButtons();
        refreshLabels();
        syncBoxesState();
        syncThumbnails();
      } catch (err) {
        console.error('[bbox-viewer] init failed:', err);
        if (!disposed) {
          setLoading(false);
          setError(err?.message || String(err));
        }
      }
    })();

    return () => {
      disposed = true;
      try { roRef.current?.disconnect?.(); } catch {}
      roRef.current = null;
      try { fcRef.current?.dispose?.(); } catch {}
      fcRef.current = null;
      fabricLibRef.current = null;
      sourceRef.current = null;
      imageUrlRef.current = '';
      undoRef.current = [];
      redoRef.current = [];
      spaceDownRef.current = false;
      panningRef.current = false;
      drawingRef.current = false;
      setBoxes([]);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ============ fabric 事件绑定 ============
  const bindFabricEvents = useCallback((fc, fabric) => {
    const pointerPoint = (event) => {
      const p = fc.getPointer(event.e);
      return { x: Math.round(p.x), y: Math.round(p.y) };
    };

    fc.on('mouse:wheel', (event) => {
      if (!sourceRef.current) return;
      let zoom = fc.getZoom() * Math.pow(0.999, event.e.deltaY);
      zoom = Math.max(0.1, Math.min(8, zoom));
      fc.zoomToPoint({ x: event.e.offsetX, y: event.e.offsetY }, zoom);
      event.e.preventDefault();
      event.e.stopPropagation();
    });

    fc.on('mouse:down', (event) => {
      if (!sourceRef.current) return;
      if (spaceDownRef.current || modeRef.current === MODE.PAN) {
        panningRef.current = true;
        lastPanRef.current = { x: event.e.clientX, y: event.e.clientY };
        fc.defaultCursor = 'grabbing';
        return;
      }
      // 框选模式：点中空白拉新框；Alt 强制拉框；点中已有框则走默认选中
      const target = event.target;
      const wantDraw = !target && (modeRef.current === MODE.DRAW || event.e.altKey);
      if (!wantDraw) return;
      pushHistory();
      drawingRef.current = true;
      startRef.current = pointerPoint(event);
      draftRef.current = new fabric.Rect({
        left: startRef.current.x,
        top: startRef.current.y,
        width: 1,
        height: 1,
        fill: 'rgba(0,0,0,0)',
        stroke: '#f97316',
        strokeWidth: 2,
        objectCaching: false,
      });
      draftRef.current.kind = 'bbox';
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
        const isPan = spaceDownRef.current || modeRef.current === MODE.PAN;
        fc.defaultCursor = isPan ? 'grab' : (modeRef.current === MODE.PAN ? 'grab' : 'crosshair');
        return;
      }
      if (!drawingRef.current) return;
      drawingRef.current = false;
      const d = draftRef.current;
      draftRef.current = null;
      if (!d) return;
      if (d.width < 2 || d.height < 2) { fc.remove(d); return; }
      d.set({ stroke: PALETTE[0], strokeWidth: Number(lineWidth) || 2 });
      d.__meta = { id: '', label: '', depth: 0, color: PALETTE[0] };
      refreshLabels();
      syncBoxesState();
      syncThumbnails();
      fc.renderAll();
    });

    fc.on('object:moving', () => {
      if (!fc.__historyMoveStarted) { pushHistory(); fc.__historyMoveStarted = true; }
      // 移动中同步选中表单坐标
      const active = fc.getActiveObject();
      if (active && active.kind === 'bbox') {
        const all = fc.getObjects().filter((o) => o.kind === 'bbox');
        const idx = all.indexOf(active);
        if (idx >= 0) {
          setSelectedIdx(idx);
          updateSelFormFromRect(idx);
        }
      }
    });
    fc.on('object:scaling', () => {
      if (!fc.__historyScaleStarted) { pushHistory(); fc.__historyScaleStarted = true; }
      const active = fc.getActiveObject();
      if (active && active.kind === 'bbox') {
        const all = fc.getObjects().filter((o) => o.kind === 'bbox');
        const idx = all.indexOf(active);
        if (idx >= 0) {
          setSelectedIdx(idx);
          updateSelFormFromRect(idx);
        }
      }
    });
    fc.on('object:modified', () => {
      fc.__historyMoveStarted = false;
      fc.__historyScaleStarted = false;
      // 几何变化（拖拽/缩放）→ 失效受影响框的抠图结果（区域已变，旧抠图不再匹配）
      const all = fc.getObjects().filter((o) => o.kind === 'bbox');
      let invalidated = 0;
      for (const r of all) {
        const meta = r.__meta || {};
        if (!meta.cutoutUrl && !r.__cutoutGeom) continue;
        const cur = {
          x: r.left,
          y: r.top,
          w: r.width * (r.scaleX || 1),
          h: r.height * (r.scaleY || 1),
        };
        const snap = r.__cutoutGeom;
        if (snap && meta.cutoutUrl && (
          Math.round(snap.x) !== Math.round(cur.x)
          || Math.round(snap.y) !== Math.round(cur.y)
          || Math.round(snap.w) !== Math.round(cur.w)
          || Math.round(snap.h) !== Math.round(cur.h)
        )) {
          delete meta.cutoutUrl;
          r.__meta = meta;
          const idx = all.indexOf(r);
          setCutoutUrls((prev) => { if (!prev[idx]) return prev; const n = { ...prev }; delete n[idx]; return n; });
          invalidated += 1;
        }
        // 更新快照为当前几何（无论是否失效，下次以本次为基准）
        r.__cutoutGeom = cur;
      }
      if (invalidated > 0) setStatus(`区域已变，${invalidated} 个框抠图结果已失效`);
      refreshLabels();
      syncBoxesState();
      syncThumbnails();
    });
    fc.on('selection:cleared', () => { refreshLabels(); onFabricSelectionChange(); });
    fc.on('selection:updated', () => { refreshLabels(); onFabricSelectionChange(); });
    fc.on('selection:created', () => { refreshLabels(); onFabricSelectionChange(); });
  }, [pushHistory, refreshLabels, syncBoxesState, syncThumbnails, lineWidth, onFabricSelectionChange, updateSelFormFromRect]);

  // ============ 表单变化联动 ============
  useEffect(() => { if (open) restyleRects(); }, [open, lineWidth, restyleRects]);
  // 按 type 重着色所有框（getColor 现按 meta.type 分配）
  useEffect(() => {
    if (!open) return;
    const fc = fcRef.current;
    if (!fc) return;
    for (const r of rects()) {
      const meta = r.__meta || {};
      const color = colorByType(meta.type || '');
      r.set({ stroke: color, borderColor: color });
      if (meta) meta.color = color;
    }
    fc.requestRenderAll();
  }, [open, boxes]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (open) refreshLabels(); }, [open, showLabel, showId, refreshLabels]);
  // 切「子元素」开关：用最近一次解析的 flatten 结果实时重新渲染
  // （depth>0 的子元素框连同其 label 标题一并隐藏/显示，无需重新导入 JSON）。silent 避免刷爆撤销栈。
  useEffect(() => {
    if (!open) return;
    const last = lastFlatRef.current;
    if (!last?.all?.length) return;
    const count = renderFlattened(last.all, last.basisLabel, { silent: true });
    setStatus(`已${showChildren ? '显示' : '隐藏'}子元素，当前 ${count} 个 bbox`);
  }, [open, showChildren, renderFlattened]);

  // ============ 键盘 ============
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      const t = e.target;
      const tag = t?.tagName;
      const inField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable;
      if ((e.code === 'Delete' || e.code === 'Backspace') && !inField) {
        deleteSelected();
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
        for (const r of rects()) r.selectable = false;
        fc.defaultCursor = 'grab';
        stageRef.current?.classList.add('is-panning');
      }
    };
    const onKeyUp = (e) => {
      if (e.code !== 'Space') return;
      e.preventDefault();
      const fc = fcRef.current;
      if (fc) {
        fc.selection = modeRef.current === MODE.DRAW;
        for (const r of rects()) r.selectable = modeRef.current === MODE.DRAW;
        fc.defaultCursor = modeRef.current === MODE.PAN ? 'grab' : 'crosshair';
      }
      spaceDownRef.current = false;
      panningRef.current = false;
      lastPanRef.current = null;
      stageRef.current?.classList.remove('is-panning');
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [open, undo, redo, deleteSelected, rects]);

  // ============ 导出 ZIP（走宿主 downloadZip，避免本地 jszip polyfill 问题）============
  const handleDownloadZip = useCallback(async () => {
    const AS = window.AgentSpaces;
    const src = sourceRef.current;
    if (!AS?.downloadZip) { setError('宿主 downloadZip 不可用'); return; }
    if (!AS?.uploadFile) { setError('宿主 uploadFile 不可用'); return; }
    if (!src) { setError('图片未加载'); return; }
    // 导出范围（保留原始 index 以查抠图结果）：仅切片时只取 exportSlice=true；过滤激活时排除隐藏类型。
    const idxAll = boxes.map((b, i) => i);
    const idxVisible = idxAll.filter((i) => activeTypes.size === 0 || activeTypes.has(boxes[i].meta?.type || '其它'));
    const idxList = onlyExportSlice ? idxVisible.filter((i) => boxes[i].meta?.exportSlice === true) : idxVisible;
    if (!idxList.length) { setError(onlyExportSlice ? '没有 exportSlice=true 的框' : '没有框'); return; }
    setExporting(true);
    setExportedCount(0);
    setError('');
    try {
      const usedNames = new Set();
      const files = [];
      for (const i of idxList) {
        const b = boxes[i];
        const meta = b.meta || {};
        const base = meta.label || meta.id || `box_${i + 1}`;
        // 文件名去非法字符 + 防重
        let name = `${String(base).replace(/[\\/:*?"<>|]/g, '_')}.png`;
        let n = 1;
        while (usedNames.has(name)) { name = `${base}_${n}.png`; n += 1; }
        usedNames.add(name);
        // 优先用抠图结果（已是透明 PNG，直接抓 URL 转 File）
        const cutoutUrl = cutoutUrls[i];
        let file;
        if (cutoutUrl) {
          try {
            const resp = await fetch(cutoutUrl);
            const blob = await resp.blob();
            file = new File([blob], name, { type: 'image/png' });
          } catch {
            file = null; // 抓取失败跳过，下面 fallback
          }
        }
        if (!file) {
          const canvas = exportBox(src.imageData, b, { transparent: false });
          const blob = await new Promise((res) => canvas.toBlob((bb) => res(bb), 'image/png'));
          file = new File([blob], name, { type: 'image/png' });
        }
        const uploaded = await AS.uploadFile(file);
        const httpUrl = uploaded?.url || uploaded?.httpPath;
        if (httpUrl) { files.push({ url: httpUrl, filename: name }); setExportedCount(files.length); }
      }
      if (!files.length) throw new Error('全部区域上传失败');
      await AS.downloadZip(files, `bbox_export_${Date.now()}.zip`);
      setStatus(`已导出 ${files.length} 个区域到 ZIP`);
    } catch (err) {
      console.error('[bbox-viewer] zip failed:', err);
      setError(err?.message || String(err));
    } finally {
      setExporting(false);
    }
  }, [boxes, onlyExportSlice, activeTypes, cutoutUrls]);

  // ============ 导出多图到画布 ============
  const handleExportToCanvas = useCallback(async () => {
    const AS = window.AgentSpaces;
    const src = sourceRef.current;
    if (!AS?.uploadFile) { setError('宿主 uploadFile 不可用'); return; }
    if (!src) { setError('图片未加载'); return; }
    // 导出范围（保留原始 index）：仅切片时只取 exportSlice=true；过滤激活时排除隐藏类型。
    const idxAll = boxes.map((b, i) => i);
    const idxVisible = idxAll.filter((i) => activeTypes.size === 0 || activeTypes.has(boxes[i].meta?.type || '其它'));
    const idxList = onlyExportSlice ? idxVisible.filter((i) => boxes[i].meta?.exportSlice === true) : idxVisible;
    if (!idxList.length) { setError(onlyExportSlice ? '没有 exportSlice=true 的框' : '没有框'); return; }
    setExporting(true);
    setExportedCount(0);
    setError('');
    const urls = [];
    try {
      for (const i of idxList) {
        const b = boxes[i];
        const meta = b.meta || {};
        const name = `${meta.label || meta.id || `box_${i + 1}`}.png`.replace(/[\\/:*?"<>|]/g, '_');
        // 优先用抠图结果
        const cutoutUrl = cutoutUrls[i];
        let file;
        if (cutoutUrl) {
          try {
            const resp = await fetch(cutoutUrl);
            const blob = await resp.blob();
            file = new File([blob], name, { type: 'image/png' });
          } catch { file = null; }
        }
        if (!file) {
          const canvas = exportBox(src.imageData, b, { transparent: false });
          const blob = await new Promise((res) => canvas.toBlob((bb) => res(bb), 'image/png'));
          file = new File([blob], name, { type: 'image/png' });
        }
        const uploaded = await AS.uploadFile(file);
        const httpUrl = uploaded?.url || uploaded?.httpPath;
        if (httpUrl) { urls.push(httpUrl); setExportedCount(urls.length); }
      }
      if (!urls.length) throw new Error('全部区域上传失败');
      onSaveRef.current?.(urls);
      onClose?.();
    } catch (err) {
      console.error('[bbox-viewer] export failed:', err);
      setError(err?.message || String(err));
    } finally {
      setExporting(false);
    }
  }, [boxes, onClose, activeTypes]);

  const totalBoxes = boxes.length;
  // 类型过滤激活时，导出范围只算匹配类型的框（被过滤隐藏的不计）
  const visibleBoxes = activeTypes.size > 0 ? boxes.filter((b) => activeTypes.has(b.meta?.type || '其它')) : boxes;
  // 导出目标数量：开启「仅切片」时只算 exportSlice=true
  const exportBoxes = onlyExportSlice ? visibleBoxes.filter((b) => b.meta?.exportSlice === true) : visibleBoxes;
  const exportCount = exportBoxes.length;
  const sliceCount = visibleBoxes.filter((b) => b.meta?.exportSlice === true).length;
  const currentMode = modeRef.current;
  const [modeState, setModeState] = useState(MODE.DRAW);
  const switchMode = useCallback((m) => {
    setMode(m);
    setModeState(m);
  }, [setMode]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose?.(); }}>
      <DialogContent
        className="flex flex-col gap-0 overflow-hidden p-0"
        style={{ width: '94vw', maxWidth: '94vw', maxHeight: '94vh', height: '94vh' }}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
      >
        <DialogHeader className="flex-row items-center justify-between gap-3 border-b border-border px-4 py-2 !gap-0">
          <div className="flex items-center gap-2">
            <DialogTitle className="text-sm">📦 UI 拆分器</DialogTitle>
            <DialogDescription className="text-[11px] text-muted-foreground">
              JSON bbox 可视化 + 手动框选 · 批量导出 ZIP/画布
            </DialogDescription>
          </div>
          <input
            ref={jsonInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; handleJsonFile(f); e.target.value = ''; }}
          />
        </DialogHeader>

        {/* 工具条 */}
        <div className="flex flex-wrap items-end gap-2 border-b border-border bg-muted/30 px-4 py-2">
          {/* 最左侧：撤销 / 重做 / 清空 */}
          <div className="flex items-end gap-1.5">
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
            <Tooltip>
              <TooltipTrigger render={
                <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={clearAll} disabled={totalBoxes === 0} />
              }>
                <Eraser className="h-4 w-4" />
              </TooltipTrigger>
              <TooltipContent side="bottom">清空所有框</TooltipContent>
            </Tooltip>
          </div>

          <div className="mx-1 h-6 w-px self-center bg-border" />

          {/* 交互模式切换（框选 / 平移） */}
          <div className="flex items-end gap-1.5">
            <Tooltip>
              <TooltipTrigger render={
                <Button size="icon" variant={modeState === MODE.DRAW ? 'default' : 'outline'} className="h-8 w-8"
                  onClick={() => switchMode(MODE.DRAW)} />
              }>
                <SquareMousePointer className="h-4 w-4" />
              </TooltipTrigger>
              <TooltipContent side="bottom">框选模式（左键拉框，Alt 强制拉框）</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger render={
                <Button size="icon" variant={modeState === MODE.PAN ? 'default' : 'outline'} className="h-8 w-8"
                  onClick={() => switchMode(MODE.PAN)} />
              }>
                <Hand className="h-4 w-4" />
              </TooltipTrigger>
              <TooltipContent side="bottom">平移模式（左键拖拽画布）</TooltipContent>
            </Tooltip>
          </div>

          <div className="mx-1 h-6 w-px self-center bg-border" />

          <Field label={`线宽 ${lineWidth}`}>
            <input type="range" min={1} max={6} value={lineWidth}
              onChange={(e) => setLineWidth(Number(e.target.value))}
              className="h-8 w-24" />
          </Field>
          <label className="flex h-8 items-center gap-1 rounded-md border border-border bg-background px-2 text-[11px]">
            <Switch checked={showChildren} onCheckedChange={setShowChildren} className="scale-90" />
            子元素
          </label>
          <label className="flex h-8 items-center gap-1 rounded-md border border-border bg-background px-2 text-[11px]">
            <Switch checked={showLabel} onCheckedChange={setShowLabel} className="scale-90" />
            标签
          </label>
          <label className="flex h-8 items-center gap-1 rounded-md border border-border bg-background px-2 text-[11px]">
            <Switch checked={showId} onCheckedChange={setShowId} className="scale-90" />
            ID
          </label>
          {/* 右侧：JSON 导入 / AI 分析 */}
          <div className="ml-auto flex items-end gap-1.5">
            <Button size="sm" variant="outline" className="h-8 gap-1 text-[11px]"
              onClick={() => jsonInputRef.current?.click()}>
              <FileJson className="h-3.5 w-3.5" /> 导入 JSON
            </Button>
            {/* AI 分析 split-button（InputGroup）：主按钮 + 下拉按钮 */}
            <InputGroup className="h-8 w-auto gap-0 rounded-md p-0">
              <Tooltip>
                <TooltipTrigger render={
                  <Button size="sm" className="h-8 gap-1 rounded-md rounded-r-none border-0 text-[11px]"
                    onClick={handleAiAnalyze}
                    disabled={analyzing || !imageUrl} />
                }>
                    <Sparkles className="h-3.5 w-3.5" />
                    {analyzing ? '分析中…' : 'AI 分析'}
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {!agentConfig?.id ? '未配置 AI 模型，请到「设置 → BBox AI 分析」配置' : '用配置的 AI 分析当前图，返回 JSON 自动渲染框；过程实时展示'}
                </TooltipContent>
              </Tooltip>
              <InputGroupAddon align="inline-end" className="border-l border-input pr-0.5">
                <DropdownMenu>
                  <DropdownMenuTrigger render={
                    <InputGroupButton size="icon-xs" variant="ghost"
                      disabled={analyzing || !imageUrl} />
                  }>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={handleCopyPrompt}>
                      {promptCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {promptCopied ? '已复制' : '复制 Prompt'}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </InputGroupAddon>
            </InputGroup>
          </div>
        </div>

        {error && (
          <p className="border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-500">{error}</p>
        )}
        {status && (
          <p className="border-b border-border bg-muted/20 px-4 py-1.5 text-[11px] text-muted-foreground">{status}</p>
        )}

        {/* 主区 */}
        <ResizablePanelGroup direction="horizontal" className="min-h-0 flex-1">
          <ResizablePanel id="bbox-stage" order={1} minSize="40%">
            <div className="relative h-full min-h-0 overflow-hidden bg-muted/20">
              <div ref={stageRef} className="bbox-viewer-stage h-full w-full" style={{ position: 'relative' }}>
                <canvas />
              </div>
              <style>{`
                .bbox-viewer-stage .canvas-container {
                  position: absolute !important;
                  inset: 0 !important;
                  width: 100% !important;
                  height: 100% !important;
                }
                .bbox-viewer-stage .canvas-container canvas,
                .bbox-viewer-stage .canvas-container .lower-canvas,
                .bbox-viewer-stage .canvas-container .upper-canvas {
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
              {/* 当前模式标记（右上角） */}
              <div className="pointer-events-none absolute right-2 top-2 rounded-md bg-background/80 px-2 py-1 text-[10px] text-muted-foreground">
                {modeState === MODE.PAN ? '🖱 平移' : '⬚ 框选'}
              </div>
            </div>
          </ResizablePanel>

          <ResizableHandle />

          <ResizablePanel id="bbox-list" order={2} minSize="20%" maxSize="55%" defaultSize="30%">
            <aside className="flex h-full min-h-0 flex-col border-l border-border">
              <Tabs value={rightTab} onValueChange={setRightTab} className="flex h-full min-h-0 flex-col">
                <TabsList className="flex w-full flex-row flex-nowrap rounded-none border-b border-border">
                  <TabsTrigger value="selected" className="flex-1 text-[11px]">选中信息</TabsTrigger>
                  <TabsTrigger value="list" className="flex-1 text-[11px]">元素拆分</TabsTrigger>
                  <TabsTrigger value="ai" className="flex-1 text-[11px]">
                    AI思考{analyzing ? '…' : ''}
                  </TabsTrigger>
                </TabsList>

                {/* Tab 1：选中信息（表单） */}
                <TabsContent value="selected" className="mt-0 min-h-0 flex-1 overflow-hidden">
                  <div className="flex h-full flex-col">
                    <div className="flex items-center justify-between border-b border-border px-3 py-2">
                      <span className="text-xs font-medium">
                        选中信息{selectedIdx != null ? ` · 框 ${selectedIdx + 1}` : ''}
                      </span>
                    </div>
                    <ScrollArea className="min-h-0 flex-1">
                      <div className="p-3">
                        {!selForm || selectedIdx == null ? (
                          <Empty>
                            <EmptyHeader>
                              <EmptyMedia variant="icon"><Crosshair className="h-4 w-4" /></EmptyMedia>
                              <EmptyTitle>未选中框</EmptyTitle>
                              <EmptyDescription>
                                选中一个框（或手动拉框）后显示信息并可修改。<br />
                                切到「框选模式」后在画布空白处拖拽可新建框。
                              </EmptyDescription>
                            </EmptyHeader>
                          </Empty>
                        ) : (
                          <div className="flex flex-col gap-3">
                            <FormField label="ID">
                              <input type="text" value={selForm.id}
                                onChange={(e) => setSelForm({ ...selForm, id: e.target.value })}
                                placeholder="如 det-0"
                                className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary" />
                            </FormField>
                            <FormField label="类型 (type)">
                              <input type="text" value={selForm.type}
                                onChange={(e) => setSelForm({ ...selForm, type: e.target.value })}
                                placeholder="如 Button / Text / Icon"
                                list="bbox-type-list"
                                className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary" />
                            </FormField>
                            <datalist id="bbox-type-list">
                              <option value="Panel" />
                              <option value="Button" />
                              <option value="Text" />
                              <option value="Icon" />
                              <option value="Image" />
                              <option value="HealthBar" />
                            </datalist>
                            <FormField label="标签 (label)">
                              <input type="text" value={selForm.label}
                                onChange={(e) => setSelForm({ ...selForm, label: e.target.value })}
                                placeholder="如 attack button"
                                className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary" />
                            </FormField>
                            <div className="grid grid-cols-2 gap-2">
                              <FormField label="X">
                                <NumberInput value={selForm.x}
                                  onChange={(v) => setSelForm({ ...selForm, x: v ?? 0 })}
                                  className="h-8 w-full text-xs" />
                              </FormField>
                              <FormField label="Y">
                                <NumberInput value={selForm.y}
                                  onChange={(v) => setSelForm({ ...selForm, y: v ?? 0 })}
                                  className="h-8 w-full text-xs" />
                              </FormField>
                              <FormField label="宽 W">
                                <NumberInput min={1} value={selForm.w}
                                  onChange={(v) => setSelForm({ ...selForm, w: v ?? 1 })}
                                  className="h-8 w-full text-xs" />
                              </FormField>
                              <FormField label="高 H">
                                <NumberInput min={1} value={selForm.h}
                                  onChange={(v) => setSelForm({ ...selForm, h: v ?? 1 })}
                                  className="h-8 w-full text-xs" />
                              </FormField>
                            </div>
                            <FormField label="层级 depth">
                              <NumberInput min={0} value={selForm.depth}
                                onChange={(v) => setSelForm({ ...selForm, depth: v ?? 0 })}
                                className="h-8 w-full text-xs" />
                            </FormField>
                            <label className="flex items-center justify-between gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-[11px]">
                              <span>可导出切片 (exportSlice)</span>
                              <Switch checked={selForm.exportSlice === true}
                                onCheckedChange={(v) => setSelForm({ ...selForm, exportSlice: v })}
                                className="scale-90" />
                            </label>
                            <FormField label="OCR 文本 (ocrText)">
                              <input type="text" value={selForm.ocrText}
                                onChange={(e) => setSelForm({ ...selForm, ocrText: e.target.value })}
                                placeholder="可选"
                                className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary" />
                            </FormField>
                            <FormField label="文本角色 (textRole)">
                              <input type="text" value={selForm.textRole}
                                onChange={(e) => setSelForm({ ...selForm, textRole: e.target.value })}
                                placeholder="dynamic / decorative"
                                className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary" />
                            </FormField>
                            <div className="flex gap-2 pt-1">
                              <Button size="sm" className="h-8 flex-1 text-[11px]" onClick={applySelForm}>
                                应用修改
                              </Button>
                              <Button size="sm" variant="outline" className="h-8 text-[11px]"
                                onClick={() => updateSelFormFromRect(selectedIdx)}>
                                重置
                              </Button>
                              <Button size="sm" variant="ghost"
                                className="h-8 text-[11px] text-muted-foreground hover:text-destructive"
                                onClick={deleteSelectedFromForm}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                </TabsContent>

                {/* Tab 2：元素拆分列表 */}
                <TabsContent value="list" className="mt-0 min-h-0 flex-1 overflow-hidden">
                  <div className="flex h-full flex-col">
                    <div className="flex items-center justify-between border-b border-border px-3 py-2">
                      <span className="text-xs font-medium">
                        元素 {totalBoxes}
                        {activeTypes.size > 0 && (
                          <span className="ml-1 text-muted-foreground">
                            · 筛选 {boxes.filter((b) => activeTypes.has(b.meta?.type || '其它')).length}
                          </span>
                        )}
                      </span>
                      <div className="flex items-center gap-1">
                        <Tooltip>
                          <TooltipTrigger render={
                            <Button size="icon" variant="ghost"
                              className="h-7 w-7 text-primary hover:bg-primary/10"
                              onClick={handleBatchCutout} disabled={loading || totalBoxes === 0 || !onCutoutRef.current} />
                          }>
                            <Scissors className="h-3.5 w-3.5" />
                          </TooltipTrigger>
                          <TooltipContent side="bottom">
                            {activeTypes.size > 0 ? '批量抠图（当前筛选集）' : '批量抠图（全部元素）'}
                          </TooltipContent>
                        </Tooltip>
                        <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => { syncBoxesState(); refreshLabels(); }} disabled={loading}>
                          刷新
                        </Button>
                        <Tooltip>
                          <TooltipTrigger render={
                            <Button size="icon" variant="ghost"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={clearAll} disabled={loading || totalBoxes === 0} />
                          }>
                            <Trash2 className="h-3.5 w-3.5" />
                          </TooltipTrigger>
                          <TooltipContent side="bottom">清空所有框</TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                    {/* 类型 badge 行：按 meta.type 聚合，点击切换激活（多选），激活时列表只显示该类型 */}
                    {typeStats.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1 border-b border-border px-3 py-1.5">
                        {typeStats.map(({ type, count }) => {
                          const active = activeTypes.has(type);
                          return (
                            <button
                              key={type}
                              type="button"
                              onClick={() => toggleTypeFilter(type)}
                              className={
                                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] transition ' +
                                (active
                                  ? 'border-primary bg-primary text-primary-foreground'
                                  : 'border-border bg-background text-muted-foreground hover:bg-muted')
                              }
                              title={active ? `点击取消筛选「${type}」` : `点击筛选「${type}」`}
                            >
                              <span>{type}</span>
                              <span className={'rounded px-1 ' + (active ? 'bg-primary-foreground/20' : 'bg-muted')}>{count}</span>
                            </button>
                          );
                        })}
                        {activeTypes.size > 0 && (
                          <button
                            type="button"
                            onClick={() => setActiveTypes(new Set())}
                            className="ml-1 text-[10px] text-muted-foreground underline-offset-2 hover:underline"
                          >
                            清除筛选
                          </button>
                        )}
                      </div>
                    )}
                    <ScrollArea className="min-h-0 flex-1">
                      <div className="flex flex-col gap-0.5 p-2">
                        {boxes.length === 0 && (
                          <Empty>
                            <EmptyHeader>
                              <EmptyMedia variant="icon"><Boxes className="h-4 w-4" /></EmptyMedia>
                              <EmptyTitle>无 bbox</EmptyTitle>
                              <EmptyDescription>
                                {loading ? '加载中…' : '导入 JSON、Alt 拉框或点「AI 分析」生成'}
                              </EmptyDescription>
                            </EmptyHeader>
                          </Empty>
                        )}
                        {boxes.length > 0 && activeTypes.size > 0 && boxes.every((b) => !activeTypes.has((b.meta?.type) || '其它')) && (
                          <p className="px-2 py-3 text-center text-[11px] text-muted-foreground">
                            当前筛选无匹配元素，<button type="button" className="underline hover:text-foreground" onClick={() => setActiveTypes(new Set())}>清除筛选</button>
                          </p>
                        )}
                        {boxes.map((b, i) => {
                          const meta = b.meta || {};
                          // 类型过滤：有激活类型时，只显示激活类型的框（空 type 归为 '其它'）
                          if (activeTypes.size > 0 && !activeTypes.has(meta.type || '其它')) return null;
                          const label = meta.label || meta.id || `(框 ${i + 1})`;
                          const tipParts = [meta.type && `type: ${meta.type}`, meta.id && `id: ${meta.id}`].filter(Boolean);
                          if (meta.ocrText) tipParts.push(`ocr: ${meta.ocrText}`);
                          if (meta.exportSlice !== undefined && meta.exportSlice !== null) tipParts.push(`export: ${meta.exportSlice ? '是' : '否'}`);
                          const tip = tipParts.join('\n');
                          return (
                            <div
                              key={i}
                              className="group flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-muted"
                              style={{ paddingLeft: 6 + (meta.depth || 0) * 10 }}
                              onMouseEnter={() => { setHoveredIdx(i); highlightBox(i); }}
                              onMouseLeave={() => { setHoveredIdx(null); highlightBox(null); }}
                              onClick={() => focusBox(i)}
                            >
                              <input
                                type="checkbox"
                                checked={meta.exportSlice === true}
                                onClick={(e) => e.stopPropagation()}
                                onChange={() => toggleExportSlice(i)}
                                title={meta.exportSlice === true ? '已纳入导出（点击取消）' : '未纳入导出（点击勾选）'}
                                className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-green-600"
                              />
                              {/* 缩略图：抠图结果优先，其次画布截图；hover 弹卡片预览，点击 openMediaGallery 看大图 */}
                              {/* 文本类型（meta.type==='Text'）不截图，用文字图标占位 */}
                              {meta.type === 'Text' ? (
                                <span
                                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border text-[10px] font-medium text-muted-foreground"
                                  style={{ borderColor: meta.color || '#888' }}
                                  title="文本类型"
                                >T</span>
                              ) : cutoutUrls[i] ? (
                                <Thumb
                                  src={cutoutUrls[i]}
                                  isCutout
                                  onRemove={() => removeCutoutUrl(i)}
                                />
                              ) : thumbnails[i] ? (
                                <Thumb
                                  src={thumbnails[i]}
                                  borderColor={meta.color}
                                />
                              ) : (
                                <span className="h-7 w-7 shrink-0 rounded-sm border border-dashed border-white/20 bg-muted/40" />
                              )}
                              <span className="flex-1 truncate text-muted-foreground" title={tip || label}>
                                {meta.type && <span className="mr-1 rounded bg-muted px-1 text-[9px] text-foreground/70">{meta.type}</span>}
                                {label}
                                {meta.ocrText && <span className="ml-1 text-[10px] text-primary/80">「{meta.ocrText}」</span>}
                              </span>
                              {cutoutUrls[i] && (
                                <span className="shrink-0 rounded bg-primary/20 px-1 text-[9px] text-primary" title="已抠图">✂</span>
                              )}
                              {meta.exportSlice === true && (
                                <span className="shrink-0 rounded bg-green-500/20 px-1 text-[9px] text-green-600" title="可导出切片">⬇</span>
                              )}
                              {/* 单项抠图：打开对话框，目标=当前项 */}
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleItemCutout(i); }}
                                title="对该元素抠图"
                                disabled={meta.type === 'Text' || !onCutoutRef.current}
                                className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition hover:bg-primary/10 hover:text-primary disabled:cursor-not-allowed disabled:opacity-30 group-hover:opacity-100"
                              >
                                <Scissors className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const fc = fcRef.current;
                                  if (!fc) return;
                                  const all = rects();
                                  const r = all[i];
                                  if (!r) return;
                                  pushHistory();
                                  fc.remove(r);
                                  refreshLabels();
                                  syncBoxesState();
                                  syncThumbnails();
                                  if (selectedIdx === i) { setSelectedIdx(null); setSelForm(null); }
                                }}
                                title="删除该框"
                                className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  </div>
                </TabsContent>

                {/* Tab 3：AI 思考过程（Markdown 渲染） */}
                <TabsContent value="ai" className="mt-0 min-h-0 flex-1 overflow-hidden">
                  <div className="flex h-full flex-col">
                    <div className="flex items-center justify-between border-b border-border px-3 py-2">
                      <span className="text-xs font-medium">
                        AI 思考过程
                        {analyzing && <span className="ml-2 text-primary">分析中…</span>}
                      </span>
                      {analyzing && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 text-[11px]"
                          onClick={handleStopAnalyze}
                        >
                          <Square className="h-3 w-3" />
                          停止分析
                        </Button>
                      )}
                    </div>
                    <ScrollArea className="min-h-0 flex-1">
                      <div className="p-3 text-sm">
                        {aiThought ? (
                          <Markdown content={aiThought} />
                        ) : (
                          <Empty>
                            <EmptyHeader>
                              <EmptyMedia variant="icon"><Sparkles className="h-4 w-4" /></EmptyMedia>
                              <EmptyTitle>暂无 AI 思考</EmptyTitle>
                              <EmptyDescription>
                                点工具条上的「AI 分析」开始分析。AI 分析的过程与返回文本将在此处实时展示。
                              </EmptyDescription>
                            </EmptyHeader>
                          </Empty>
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                </TabsContent>
              </Tabs>

              {/* 底部：导出范围开关 + 两个导出按钮 */}
              <div className="flex flex-col gap-2 border-t border-border bg-muted/20 p-3">
                <label className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    仅导出切片
                    <span className="rounded bg-green-500/20 px-1 text-green-600">
                      {sliceCount}/{totalBoxes}
                    </span>
                  </span>
                  <Switch checked={onlyExportSlice} onCheckedChange={setOnlyExportSlice} className="scale-90" />
                </label>
                <Button size="sm" variant="outline" className="h-9 w-full gap-1.5"
                  onClick={handleDownloadZip} disabled={exporting || exportCount === 0}>
                  <Download className="h-4 w-4" />
                  {exporting ? `打包中 ${exportedCount}/${exportCount}` : `下载 ZIP（${exportCount}）`}
                </Button>
                <Button size="sm" className="h-9 w-full gap-1.5"
                  onClick={handleExportToCanvas} disabled={exporting || exportCount === 0}>
                  <Upload className="h-4 w-4" />
                  {exporting ? `上传中 ${exportedCount}/${exportCount}` : `导出到画布（${exportCount}）`}
                </Button>
              </div>
            </aside>
          </ResizablePanel>
        </ResizablePanelGroup>

        <div className="border-t border-border bg-muted/20 px-4 py-2 text-[11px] text-muted-foreground">
          滚轮缩放 · 按住 <kbd className="rounded border border-border bg-background px-1">空格</kbd> 临时平移 ·
          框选模式左键拉框 · 平移模式左键拖拽 ·
          <kbd className="rounded border border-border bg-background px-1">Alt</kbd> 强制拉框 ·
          <kbd className="rounded border border-border bg-background px-1">Delete</kbd> 删选中 ·
          <kbd className="rounded border border-border bg-background px-1">Ctrl+Z</kbd> 撤销 ·
          <Crosshair className="inline h-3 w-3 align-text-bottom" /> 点图例定位
        </div>

        {/* 抠图对话框（批量 / 单项共用） */}
        <CutoutDialog
          open={!!cutoutTarget}
          inputImages={cutoutTarget ? cutoutTarget.indexes.map((i) => cutoutTarget.inputs[i]).filter(Boolean) : []}
          onRun={onCutout}
          onClose={handleCutoutDialogClose}
        />
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

function FormField({ label, children }) {
  return (
    <Label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      {children}
    </Label>
  );
}

/**
 * 列表项缩略图：hover 弹卡片预览大图，点击 openMediaGallery 看大图（可翻页）。
 * @param {object} props
 * @param {string} props.src 图片 URL
 * @param {boolean} [props.isCutout] 是否为抠图结果（边框用 primary，加透明棋盘背景）
 * @param {string} [props.borderColor] 非抠图时的边框色
 * @param {() => void} [props.onRemove] 抠图结果删除回调（显示右上角 X）
 */
function Thumb({ src, isCutout, borderColor, onRemove }) {
  const openCanvasGallery = useCanvasGallery();
  return (
    <HoverCard>
      <HoverCardTrigger
        render={
          <div
            className={'group/thumb relative h-7 w-7 shrink-0 cursor-zoom-in'}
            onClick={(e) => { e.stopPropagation(); openCanvasGallery([{ src, type: 'image' }], 0); }}
          >
            <img
              src={src}
              alt=""
              className={
                'h-7 w-7 rounded-sm border object-cover ' +
                (isCutout ? 'border-primary/60' : '')
              }
              style={isCutout
                ? { background: 'repeating-conic-gradient(#888 0% 25%, #555 0% 50%) 50% / 8px 8px' }
                : { borderColor: borderColor || '#888' }}
            />
            {isCutout && onRemove && (
              <button
                type="button"
                title="删除抠图结果"
                onClick={(e) => { e.stopPropagation(); onRemove(); }}
                className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 transition group-hover/thumb:opacity-100"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            )}
          </div>
        }
      />
      <HoverCardContent side="left" className="w-auto p-1">
        <img
          src={src}
          alt=""
          className="max-h-[320px] max-w-[320px] rounded object-contain"
          style={isCutout
            ? { background: 'repeating-conic-gradient(#888 0% 25%, #555 0% 50%) 50% / 12px 12px' }
            : {}}
        />
      </HoverCardContent>
    </HoverCard>
  );
}
