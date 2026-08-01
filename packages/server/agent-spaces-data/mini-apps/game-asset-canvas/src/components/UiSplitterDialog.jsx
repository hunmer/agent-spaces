import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  Button, Loader,
  ResizablePanelGroup, ResizablePanel, ResizableHandle,
} from '@agent-spaces/ui';
import { getFabric } from '../utils/image-ops/cdn';
import {
  loadImageSource, detect, cornerColor, toHex,
} from '../utils/image-ops/sprite-splitter';
import {
  hexToRgb, evenlySpacedGuides, resolveGridGuides, gridBoxesFromGuides, inputSignature,
} from '../utils/ui-splitter-helpers';
import InputImageList from './ui-splitter/InputImageList';
import SplitterToolbar from './ui-splitter/SplitterToolbar';
import SplitResultPanel from './ui-splitter/SplitResultPanel';
import useSplitterSlices from './ui-splitter/useSplitterSlices';
import useSplitterGrid from './ui-splitter/useSplitterGrid';
import useSplitterCrop from './ui-splitter/useSplitterCrop';
import useSplitterSave from './ui-splitter/useSplitterSave';
import bindSplitterFabricEvents from './ui-splitter/bindSplitterFabricEvents';
import bindSplitterKeyboard from './ui-splitter/splitterKeyboard';

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
 * @param {string} [props.defaultMethod='corner'] 无持久化数据时的默认抠图方式
 */
export default function UiSplitterDialog({
  open, inputImages, initialData, onDataChange, onSave, onClose, onReplaceImage,
  mode = 'full', defaultMethod = 'corner',
}) {
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
  const cropSizeLabelRef = useRef(null);   // 裁切拖拽中的宽高标签
  // 网格模式（fabric 闭包读最新值）
  const gridModeRef = useRef(false);       // 是否处于网格模式
  const gridColsRef = useRef(2);           // 网格列数
  const gridRowsRef = useRef(2);           // 网格行数
  const vGuidesRef = useRef([]);           // 垂直参考线 x 坐标（图片像素，已排序）
  const hGuidesRef = useRef([]);           // 水平参考线 y 坐标（图片像素，已排序）
  const gridSplitTimerRef = useRef(null);   // 实时拆分节流尾调用
  const lastGridSplitAtRef = useRef(0);
  // 持久化表单参数 ref（onDataChange 写回时读最新值，避免 setMethod 异步导致写回旧值）
  const methodRef = useRef(defaultMethod);
  const toleranceRef = useRef(70);
  const minAreaRef = useRef(500);
  const paddingRef = useRef(2);
  const pickedHexRef = useRef(toHex([239, 26, 239]));

  // 受控表单状态（仅驱动 UI 显示，fabric 逻辑直接读 ref/getter）
  const [activeUrl, setActiveUrl] = useState('');
  const [thumbUrls, setThumbUrls] = useState([]);
  const thumbUrlsRef = useRef([]);
  useEffect(() => { thumbUrlsRef.current = thumbUrls; }, [thumbUrls]);
  const [method, setMethod] = useState(defaultMethod);
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

  // 右侧预览列表
  const [previews, setPreviews] = useState([]); // [{ name, url }]

  // ===== 功能 hook 装配（顺序即原 useCallback 声明顺序，保持 TDZ 正确）=====
  // 切片框 CRUD + 撤销重做 + 预览渲染 + 自动检测 + 持久化写回（详见 useSplitterSlices.js）
  const sliceApi = useSplitterSlices({
    refs: {
      fcRef, fabricLibRef, sourceRef, imageStatesRef, activeUrlRef, thumbUrlsRef,
      exportEnabledRef, readyRef, drawModeRef, gridModeRef, cropModeRef, gridColsRef,
      gridRowsRef, vGuidesRef, hGuidesRef, gridSplitTimerRef, applyingHistoryRef,
      methodRef, toleranceRef, minAreaRef, paddingRef, pickedHexRef, onDataChangeRef,
    },
    state: { open, thumbUrls, method, tolerance, minArea, padding, pickedHex },
    setters: {
      setStatus, setPreviews, setCount, setTotalCount, setSliceCounts,
      setCanUndo, setCanRedo, setPickedHex,
    },
    callbacks: { curState, computeOptions },
  });
  // 解构切片 hook 接口，供 fitToStage/switchTo/fabric 初始化/其他 hook 使用
  const {
    rects, clearRects, realBox, snapshot, addRect, updateHistoryButtons, pushHistory,
    undo, redo, setColor, detectAll, renderList,
    deleteSelectedRects, clearAllRects, deleteRectAt,
  } = sliceApi;

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

  // 网格模式 hook（参考线 CRUD + 进入/退出网格 + 实时拆分），依赖 sliceApi 的渲染/历史接口
  const gridApi = useSplitterGrid({
    refs: {
      fcRef, fabricLibRef, sourceRef, gridModeRef, gridColsRef, gridRowsRef,
      vGuidesRef, hGuidesRef, gridSplitTimerRef, lastGridSplitAtRef,
      cropDraftRef, cropModeRef, drawModeRef,
    },
    state: { activeUrl, gridMode },
    setters: { setStatus, setGridCols, setGridRows, setGridMode, setCropMode, setCropBox },
    sliceApi: { curState, renderList, pushHistory, clearRects, addRect },
  });
  const {
    syncGuidesFromCanvas, clearGuides, renderGuideDistances, clearGuideDistances,
    renderGuides, restoreGridForCurrent, applyGridSplit, scheduleGridSplit,
    enterGridMode, exitGridMode, toggleGridMode, applyGridSize,
  } = gridApi;

  // 裁切 hook（应用裁切 / 模式切换 / 取消），依赖 fitToStage 与 gridApi.enterGridMode/syncGuidesFromCanvas
  const cropApi = useSplitterCrop({
    refs: {
      fcRef, fabricLibRef, sourceRef, imageStatesRef, activeUrlRef,
      onDataChangeRef, onReplaceImageRef, cropModeRef, cropDraftRef,
      gridModeRef, gridSplitTimerRef, drawModeRef,
    },
    state: { cropBox, gridOnly },
    setters: {
      setCropBusy, setError, setStatus, setThumbUrls, setActiveUrl,
      setCropMode, setCropBox, setPickedHex, setGridMode,
    },
    deps: { fitToStage, renderList, updateHistoryButtons, enterGridMode, syncGuidesFromCanvas },
  });
  const { applyCrop, toggleCropMode, cancelCrop } = cropApi;

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
          // 旧 grid-only 快照里的 corner 是隐藏控件自动写入的默认值，不视为用户选择。
          const restoredMethod = gridOnly && saved.cutoutMethodVersion !== 1
            ? defaultMethod
            : saved.method;
          if (typeof restoredMethod === 'string') { methodRef.current = restoredMethod; setMethod(restoredMethod); }
          if (saved.tolerance != null) { toleranceRef.current = saved.tolerance; setTolerance(saved.tolerance); }
          if (saved.minArea != null) { minAreaRef.current = saved.minArea; setMinArea(saved.minArea); }
          if (saved.padding != null) { paddingRef.current = saved.padding; setPadding(saved.padding); }
          if (typeof saved.pickedHex === 'string') { pickedHexRef.current = saved.pickedHex; setPickedHex(saved.pickedHex); }
        } else {
          methodRef.current = defaultMethod;
          setMethod(defaultMethod);
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

        bindSplitterFabricEvents(fc, fabric, {
          refs: {
            sourceRef, spaceDownRef, panningRef, lastPanRef, pickingRef, drawingRef, startRef,
            draftRef, stageRef, cropModeRef, croppingRef, cropStartRef, cropDraftRef, cropSizeLabelRef,
            gridModeRef, drawModeRef,
          },
          setters: { setMethod, setStatus, setCropBox },
          callbacks: {
            pushHistory, renderList, setColor, curState, scheduleGridSplit,
            renderGuideDistances, clearGuideDistances,
          },
        });
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
            } else if (opts0.method === 'none') {
              // 「不检测」模式且无持久化切片：留空，等用户手动框，不跑 detect()
              s0.rects = [];
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


  // ===== 键盘：空格平移 / Delete 删切片框 / Ctrl+Z 撤销 / Ctrl+Y(Ctrl+Shift+Z) 重做 =====
  useEffect(() => {
    if (!open) return;
    const cleanup = bindSplitterKeyboard({
      refs: { fcRef, spaceDownRef, panningRef, lastPanRef, stageRef, drawModeRef },
      callbacks: { undo, redo, deleteSelectedRects },
    });
    return cleanup;
  }, [open, undo, redo, deleteSelectedRects]);

  // ===== 保存 + 轻量 toggle（切片导出开关 / 吸色 / 绘制模式切换）=====
  const saveApi = useSplitterSave({
    refs: {
      fcRef, imageStatesRef, gridModeRef, exportEnabledRef, onSaveRef,
      drawModeRef, spaceDownRef, pickingRef,
    },
    state: { thumbUrls, method, tolerance, minArea, padding },
    setters: {
      setError, setSaving, setSavedCount, setMethod, setDrawMode, setExportEnabled, setStatus,
    },
    props: { onClose },
    deps: { curState, snapshot, setColor, renderList },
  });
  const { handleSave, togglePicking, handlePickColor, toggleDrawMode, toggleExport } = saveApi;

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
        <InputImageList
          thumbUrls={thumbUrls}
          activeUrl={activeUrl}
          sliceCounts={sliceCounts}
          exportEnabled={exportEnabled}
          onSwitchTo={switchTo}
        />

        {/* 工具条（单行 flex，宽度不够自动换行） */}
        <SplitterToolbar
          gridOnly={gridOnly}
          gridMode={gridMode}
          cropMode={cropMode}
          drawMode={drawMode}
          gridCols={gridCols}
          gridRows={gridRows}
          method={method}
          tolerance={tolerance}
          minArea={minArea}
          padding={padding}
          pickedHex={pickedHex}
          count={count}
          pickingRef={pickingRef}
          onApplyGridSize={applyGridSize}
          onSetMethod={setMethod}
          onSetTolerance={setTolerance}
          onSetMinArea={setMinArea}
          onSetPadding={setPadding}
          onHandlePickColor={handlePickColor}
          onTogglePicking={togglePicking}
          onToggleDrawMode={toggleDrawMode}
          onUndo={undo}
          onRedo={redo}
          canUndo={canUndo}
          canRedo={canRedo}
          onToggleCropMode={toggleCropMode}
          onToggleGridMode={toggleGridMode}
        />

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
            <SplitResultPanel
              gridOnly={gridOnly}
              gridMode={gridMode}
              loading={loading}
              count={count}
              previews={previews}
              gridCols={gridCols}
              gridRows={gridRows}
              thumbUrls={thumbUrls}
              activeUrl={activeUrl}
              exportEnabled={exportEnabled}
              totalCount={totalCount}
              saving={saving}
              savedCount={savedCount}
              onSaveSheets={(urls) => { onSaveRef.current?.(urls); onClose?.(); }}
              onDeleteRectAt={deleteRectAt}
              onClearAll={clearAllRects}
              onRenderList={renderList}
              onToggleExport={toggleExport}
              onSave={handleSave}
            />
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
