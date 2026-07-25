import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  Button, Input, Label, ScrollArea, Loader, Switch,
  Tooltip, TooltipTrigger, TooltipContent,
  ResizablePanelGroup, ResizablePanel, ResizableHandle,
} from '@agent-spaces/ui';
import { Undo2, Redo2, Eraser, Trash2, Download, Upload, FileJson, Crosshair, Sparkles } from '@agent-spaces/ui';
import { getFabric, getJsZip, getImageCompression } from '../utils/image-ops/cdn';
import { loadImageSource, exportBox } from '../utils/image-ops/sprite-splitter';
import { BUILTIN_PLUGIN } from '../utils/constants';

// 12 色调色板（移植自 bbox_viewer.html）
const PALETTE = [
  '#f38ba8', '#fab387', '#f9e2af', '#a6e3a1',
  '#94e2d5', '#89dceb', '#89b4fa', '#cba6f7',
  '#f5c2e7', '#94c4f5', '#ffd580', '#b0f5c2',
];

// 示例数据（新 schema：title + elements[]，元素含 coords/type/parentId/exportSlice/ocrText/textRole/children）
const SAMPLE_DATA = {
  title: '战棋游戏战斗界面UI',
  elements: [
    {
      id: 'det-0', type: 'Panel', label: 'player info panel',
      coords: [10, 10, 260, 130], parentId: null, exportSlice: false,
      children: [
        { id: 'det-1', type: 'Image', label: 'avatar', coords: [10, 10, 95, 135], parentId: 'det-0', exportSlice: true },
        { id: 'det-2', type: 'Text', label: 'character name and level', coords: [110, 30, 130, 25], parentId: 'det-0', ocrText: '艾尔文 Lv. 24', textRole: 'dynamic', exportSlice: false },
        { id: 'det-3', type: 'HealthBar', label: 'hp bar', coords: [110, 75, 130, 25], parentId: 'det-0', ocrText: '1280/1280', textRole: 'dynamic', exportSlice: false },
        { id: 'det-4', type: 'HealthBar', label: 'mp bar', coords: [110, 100, 130, 25], parentId: 'det-0', ocrText: '640/640', textRole: 'dynamic', exportSlice: false },
        { id: 'det-5', type: 'Icon', label: 'class icon', coords: [240, 95, 30, 40], parentId: 'det-0', exportSlice: true },
      ],
    },
    {
      id: 'det-6', type: 'Panel', label: 'resource bar',
      coords: [300, 20, 450, 45], parentId: null, exportSlice: false,
      children: [
        { id: 'det-7', type: 'Icon', label: 'gold icon', coords: [300, 20, 40, 40], parentId: 'det-6', exportSlice: true },
        { id: 'det-8', type: 'Text', label: 'gold amount', coords: [345, 25, 70, 30], parentId: 'det-6', ocrText: '25680', textRole: 'dynamic', exportSlice: false },
        { id: 'det-9', type: 'Icon', label: 'crystal icon', coords: [420, 20, 40, 40], parentId: 'det-6', exportSlice: true },
        { id: 'det-10', type: 'Text', label: 'crystal amount', coords: [465, 25, 60, 30], parentId: 'det-6', ocrText: '1340', textRole: 'dynamic', exportSlice: false },
        { id: 'det-11', type: 'Icon', label: 'wood icon', coords: [535, 20, 40, 40], parentId: 'det-6', exportSlice: true },
        { id: 'det-12', type: 'Text', label: 'wood amount', coords: [580, 25, 60, 30], parentId: 'det-6', ocrText: '620', textRole: 'dynamic', exportSlice: false },
      ],
    },
    {
      id: 'det-13', type: 'Panel', label: 'stage info panel',
      coords: [790, 25, 200, 120], parentId: null, exportSlice: false,
      ocrText: '第8章 绿风之谷', textRole: 'decorative',
    },
    {
      id: 'det-14', type: 'Panel', label: 'action buttons panel',
      coords: [550, 810, 430, 160], parentId: null, exportSlice: false,
      children: [
        { id: 'det-15', type: 'Button', label: 'standby button', coords: [550, 830, 90, 120], parentId: 'det-14', ocrText: '待机', textRole: 'decorative', exportSlice: true },
        { id: 'det-16', type: 'Button', label: 'skill button', coords: [650, 830, 90, 120], parentId: 'det-14', ocrText: '技能', textRole: 'decorative', exportSlice: true },
        { id: 'det-17', type: 'Button', label: 'item button', coords: [750, 830, 90, 120], parentId: 'det-14', ocrText: '道具', textRole: 'decorative', exportSlice: true },
        { id: 'det-18', type: 'Button', label: 'attack button', coords: [850, 810, 130, 160], parentId: 'det-14', ocrText: '攻击', textRole: 'decorative', exportSlice: true },
      ],
    },
  ],
};

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

// 把图片 URL 压缩后转 base64 data URL（附件通道传给视觉模型 + 同步画布背景图保证坐标同源）
// browser-image-compression Web Worker 压缩，大图不卡 UI；失败时降级用原图
async function compressToDataUrl(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`读取图片失败(${resp.status})`);
  const blob = await resp.blob();
  const file = new File([blob], 'image', { type: blob.type || 'image/png' });
  try {
    const compress = await getImageCompression();
    const compressed = await compress(file, {
      maxSizeMB: 1,
      maxWidthOrHeight: 1920,
      useWebWorker: true,
    });
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('压缩图转 base64 失败'));
      reader.readAsDataURL(compressed);
    });
  } catch (err) {
    console.warn('[bbox-viewer] 压缩失败，降级用原图:', err?.message || err);
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('图片转 base64 失败'));
      reader.readAsDataURL(blob);
    });
  }
}

/**
 * BBox 查看器对话框：用 fabric.js 渲染图片背景 + bbox 框（来自 JSON 或手动拉框），
 * 支持递归 children、配色策略、图例 hover 联动、批量导出框区域到 ZIP 或画布。
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {string[]} props.inputImages 输入图（节点传入，取首张）
 * @param {(urls: string[]) => void} props.onSave 导出图片上传完成后回调（写 output.images）
 * @param {() => void} props.onClose
 * @param {{id:string, userPrompt:string}} [props.agentConfig] AI 分析配置（Canvas 从 settings 注入；systemPrompt 归 agent preset）
 */
export default function BBoxViewerDialog({ open, inputImages, onSave, onClose, agentConfig }) {
  const stageRef = useRef(null);
  const fcRef = useRef(null);
  const fabricLibRef = useRef(null);
  const sourceRef = useRef(null);          // 当前图 source {image,canvas,ctx,imageData}
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

  // 受控 UI 状态
  const [imageUrl, setImageUrl] = useState('');
  const [boxes, setBoxes] = useState([]);          // 同步 fabric 框（驱动图例/计数）
  const [colorMode, setColorMode] = useState('depth');
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
  const agentConfigRef = useRef(agentConfig);
  agentConfigRef.current = agentConfig;

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

  const syncBoxesState = useCallback(() => {
    setBoxes(rects().map((r) => ({ ...realBox(r), meta: r.__meta || null })));
  }, [rects, realBox]);

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

  // ============ 配色 ============
  const getColor = useCallback((depth, parentColor, idx) => {
    if (colorMode === 'depth') return PALETTE[depth % PALETTE.length];
    if (colorMode === 'parent') return parentColor || PALETTE[0];
    return PALETTE[idx % PALETTE.length];
  }, [colorMode]);

  // ============ JSON 解析：递归 children + 配色 ============
  // schema: { title, elements:[{id,type,label,coords:[x,y,w,h],parentId,exportSlice,ocrText,textRole,children}] }
  // 统一输出：{ box:{x,y,width,height}, meta:{id,label,depth,color,type,exportSlice,ocrText,textRole} }
  const flatten = useCallback((els, depth, parentColor, out) => {
    const walk = (list, d, pColor) => {
      for (const el of list) {
        const coords = Array.isArray(el?.coords) ? el.coords : null;
        if (!coords || coords.length < 4) {
          // 无 coords 但有 children：容器节点向下传递（保持父级色）
          if (el?.children) walk(el.children, d, pColor);
          continue;
        }
        const [x, y, w, h] = coords;
        const color = getColor(d, pColor, out.length);
        out.push({
          box: { x, y, width: w, height: h },
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
  const applyJsonData = useCallback((data) => {
    const fc = fcRef.current;
    if (!fc) return;
    const els = Array.isArray(data?.elements) ? data.elements : (Array.isArray(data) ? data : []);
    if (!els.length) {
      setStatus(data?.title ? `已加载标题「${data.title}」但无 elements` : 'JSON 无 elements');
      return;
    }
    const all = flatten(els, 0, null, []);
    const basis = getBBoxBasis(all);
    const sx = basis.w ? sourceRef.current?.canvas?.width / basis.w : 1;
    const sy = basis.h ? sourceRef.current?.canvas?.height / basis.h : 1;
    pushHistory();
    // 清掉旧框（applyJsonData 已 push 一次整批历史）
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
    const titleSuffix = data?.title ? `「${data.title}」` : '';
    setStatus(`已加载 ${count} 个 bbox${titleSuffix}（${basis.label}）`);
  }, [flatten, getBBoxBasis, pushHistory, rects, addBBoxRect, refreshLabels, syncBoxesState, showChildren]);

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

  // ============ AI 分析图片（agent_run）============
  const handleAiAnalyze = useCallback(async () => {
    const AS = window.AgentSpaces;
    const ac = agentConfigRef.current;
    const fc = fcRef.current;
    const fabric = fabricLibRef.current;
    if (!AS?.callPluginTool) { setError('宿主 callPluginTool 不可用'); return; }
    if (!imageUrl) { setError('图片未加载'); return; }
    if (!ac?.id) {
      setError('未配置 AI 模型，请先到「设置 → BBox AI 分析」配置');
      return;
    }
    setAnalyzing(true);
    setError('');
    setStatus('✨ 压缩图片中…');
    try {
      // 1. 压缩原图 → dataUrl（Web Worker，不卡 UI；失败降级用原图）
      const dataUrl = await compressToDataUrl(imageUrl);
      // 2. 用压缩图重建 sourceRef + 更新 fabric 背景图，保证 AI 坐标与画布严格 1:1 同源（修复错位 bug）
      const newSource = await loadImageSource(dataUrl);
      sourceRef.current = newSource;
      if (fc && fabric) {
        await new Promise((resolve) => {
          fabric.Image.fromURL(dataUrl, (img) => {
            img.selectable = false;
            img.evented = false;
            fc.setBackgroundImage(img, () => {
              fitToStage();
              fc.renderAll();
              resolve();
            });
          });
        });
      }
      // 3. 传压缩图给 AI（坐标基于压缩图，与画布背景图同源）
      setStatus('✨ AI 分析中（可能需要数十秒）…');
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
      );
      // 4. 解析返回 JSON → 渲染框（sourceRef 已是压缩图，sx=1 零换算）
      const raw = ret?.result || ret?.output || '';
      const data = extractJsonFromText(raw);
      applyJsonData(data);
      setStatus(`✨ AI 分析完成，已渲染框`);
    } catch (err) {
      console.error('[bbox-viewer] AI analyze failed:', err);
      setError(`AI 分析失败: ${err?.message || err}`);
      setStatus('AI 分析失败');
    } finally {
      setAnalyzing(false);
    }
  }, [imageUrl, applyJsonData, fitToStage]);

  // ============ 切换图例高亮 ============
  const highlightBox = useCallback((idx) => {
    const fc = fcRef.current;
    if (!fc) return;
    const all = rects();
    // 复位
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
    } else {
      for (const r of all) r.set({ fill: 'rgba(0,0,0,0)' });
    }
    fc.requestRenderAll();
  }, [rects, lineWidth]);

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
    fc.renderAll();
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

  // ============ 打开对话框：加载 fabric + 图 ============
  useEffect(() => {
    if (!open) return;
    const urls = (inputImages || []).filter(Boolean);
    if (!urls.length) { setError('没有输入图片'); return; }
    const first = urls[0];
    setImageUrl(first);
    let disposed = false;
    setLoading(true);
    setError('');
    setStatus('正在加载编辑器…');
    undoRef.current = [];
    redoRef.current = [];

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
        setLoading(false);
        setStatus('编辑器就绪。滚轮缩放，空格拖拽，Alt 拉框新建。可导入 JSON 或点「载入示例」。');
        updateHistoryButtons();
        syncBoxesState();
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
      if (spaceDownRef.current) {
        panningRef.current = true;
        lastPanRef.current = { x: event.e.clientX, y: event.e.clientY };
        fc.defaultCursor = 'grabbing';
        return;
      }
      // Alt 强制拉框（点中已有框时不拦截）
      const wantDraw = event.e.altKey && !event.target;
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
        fc.defaultCursor = spaceDownRef.current ? 'grab' : 'default';
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
      fc.renderAll();
    });

    fc.on('object:moving', () => {
      if (!fc.__historyMoveStarted) { pushHistory(); fc.__historyMoveStarted = true; }
    });
    fc.on('object:scaling', () => {
      if (!fc.__historyScaleStarted) { pushHistory(); fc.__historyScaleStarted = true; }
    });
    fc.on('object:modified', () => {
      fc.__historyMoveStarted = false;
      fc.__historyScaleStarted = false;
      refreshLabels();
      syncBoxesState();
    });
    fc.on('selection:cleared', () => { refreshLabels(); });
    fc.on('selection:updated', () => { refreshLabels(); });
    fc.on('selection:created', () => { refreshLabels(); });
  }, [pushHistory, refreshLabels, syncBoxesState, lineWidth]);

  // ============ 表单变化联动 ============
  useEffect(() => { if (open) restyleRects(); }, [open, colorMode, lineWidth, restyleRects]);
  // 配色变化时重新着色所有框（按 meta.depth + 当前 colorMode）
  useEffect(() => {
    if (!open) return;
    const fc = fcRef.current;
    if (!fc) return;
    for (const r of rects()) {
      const meta = r.__meta || {};
      const color = getColor(meta.depth || 0, meta.parentColor, rects().indexOf(r));
      r.set({ stroke: color, borderColor: color });
      if (meta) meta.color = color;
    }
    fc.requestRenderAll();
  }, [open, colorMode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (open) refreshLabels(); }, [open, showLabel, showId, refreshLabels]);
  useEffect(() => { if (open) { /* 重新应用 children 过滤需重新解析 JSON */ } }, [open, showChildren]);

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
        fc.selection = true;
        for (const r of rects()) r.selectable = true;
        fc.defaultCursor = 'default';
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

  // ============ 导出 ZIP ============
  const handleDownloadZip = useCallback(async () => {
    const src = sourceRef.current;
    if (!src) { setError('图片未加载'); return; }
    const list = onlyExportSlice ? boxes.filter((b) => b.meta?.exportSlice === true) : boxes;
    if (!list.length) { setError(onlyExportSlice ? '没有 exportSlice=true 的框' : '没有框'); return; }
    setExporting(true);
    setExportedCount(0);
    setError('');
    try {
      const JSZip = await getJsZip();
      const zip = new JSZip();
      const usedNames = new Set();
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        const meta = b.meta || {};
        const base = meta.label || meta.id || `box_${i + 1}`;
        // 文件名去非法字符 + 防重
        let name = `${String(base).replace(/[\\/:*?"<>|]/g, '_')}.png`;
        let n = 1;
        while (usedNames.has(name)) { name = `${base}_${n}.png`; n += 1; }
        usedNames.add(name);
        const canvas = exportBox(src.imageData, b, { transparent: false });
        const blob = await new Promise((res) => canvas.toBlob((bb) => res(bb), 'image/png'));
        zip.file(name, blob);
        setExportedCount(i + 1);
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bbox_export_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus(`已导出 ${list.length} 个区域到 ZIP`);
    } catch (err) {
      console.error('[bbox-viewer] zip failed:', err);
      setError(err?.message || String(err));
    } finally {
      setExporting(false);
    }
  }, [boxes, onlyExportSlice]);

  // ============ 导出多图到画布 ============
  const handleExportToCanvas = useCallback(async () => {
    const AS = window.AgentSpaces;
    const src = sourceRef.current;
    if (!AS?.uploadFile) { setError('宿主 uploadFile 不可用'); return; }
    if (!src) { setError('图片未加载'); return; }
    const list = onlyExportSlice ? boxes.filter((b) => b.meta?.exportSlice === true) : boxes;
    if (!list.length) { setError(onlyExportSlice ? '没有 exportSlice=true 的框' : '没有框'); return; }
    setExporting(true);
    setExportedCount(0);
    setError('');
    const urls = [];
    try {
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        const canvas = exportBox(src.imageData, b, { transparent: false });
        const blob = await new Promise((res) => canvas.toBlob((bb) => res(bb), 'image/png'));
        const meta = b.meta || {};
        const name = `${meta.label || meta.id || `box_${i + 1}`}.png`.replace(/[\\/:*?"<>|]/g, '_');
        const file = new File([blob], name, { type: 'image/png' });
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
  }, [boxes, onClose]);

  const totalBoxes = boxes.length;
  // 导出目标数量：开启「仅切片」时只算 exportSlice=true
  const exportBoxes = onlyExportSlice ? boxes.filter((b) => b.meta?.exportSlice === true) : boxes;
  const exportCount = exportBoxes.length;
  const sliceCount = boxes.filter((b) => b.meta?.exportSlice === true).length;

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
          <Field label="配色">
            <select
              value={colorMode}
              onChange={(e) => setColorMode(e.target.value)}
              className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
            >
              <option value="depth">按层级</option>
              <option value="parent">父级同色</option>
              <option value="random">随机色</option>
            </select>
          </Field>
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
          {/* 右侧：JSON 导入 / 载入示例 / AI 分析 */}
          <div className="ml-auto flex items-end gap-1.5">
            <Button size="sm" variant="outline" className="h-8 gap-1 text-[11px]"
              onClick={() => jsonInputRef.current?.click()}>
              <FileJson className="h-3.5 w-3.5" /> 导入 JSON
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-[11px]"
              onClick={() => applyJsonData(SAMPLE_DATA)}>
              载入示例
            </Button>
            <Tooltip>
              <TooltipTrigger render={
                <Button size="sm" className="h-8 gap-1 text-[11px]"
                  onClick={handleAiAnalyze}
                  disabled={analyzing || !imageUrl} />
              }>
                <Sparkles className="h-3.5 w-3.5" />
                {analyzing ? '分析中…' : 'AI 分析'}
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {!agentConfig?.id ? '未配置 AI 模型，请到「设置 → BBox AI 分析」配置' : '用配置的 AI 分析当前图，返回 JSON 自动渲染框'}
              </TooltipContent>
            </Tooltip>
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
            </div>
          </ResizablePanel>

          <ResizableHandle />

          <ResizablePanel id="bbox-list" order={2} minSize="20%" maxSize="55%" defaultSize="28%">
            <aside className="flex h-full min-h-0 flex-col border-l border-border">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <span className="text-xs font-medium">元素 {totalBoxes}</span>
                <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => { syncBoxesState(); refreshLabels(); }} disabled={loading}>
                  刷新
                </Button>
              </div>
              <ScrollArea className="min-h-0 flex-1">
                <div className="flex flex-col gap-0.5 p-2">
                  {boxes.length === 0 && (
                    <p className="px-2 py-8 text-center text-xs text-muted-foreground">
                      {loading ? '加载中…' : '无 bbox。导入 JSON、点「载入示例」或 Alt 拉框新建'}
                    </p>
                  )}
                  {boxes.map((b, i) => {
                    const meta = b.meta || {};
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
                        <span className="h-3 w-3 shrink-0 rounded-sm border border-white/30"
                          style={{ backgroundColor: meta.color || '#888' }} />
                        <span className="flex-1 truncate text-muted-foreground" title={tip || label}>
                          {meta.type && <span className="mr-1 rounded bg-muted px-1 text-[9px] text-foreground/70">{meta.type}</span>}
                          {label}
                          {meta.ocrText && <span className="ml-1 text-[10px] text-primary/80">「{meta.ocrText}」</span>}
                        </span>
                        {meta.exportSlice === true && (
                          <span className="shrink-0 rounded bg-green-500/20 px-1 text-[9px] text-green-600" title="可导出切片">⬇</span>
                        )}
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
          滚轮缩放 · 按住 <kbd className="rounded border border-border bg-background px-1">空格</kbd> 拖拽平移 ·
          <kbd className="rounded border border-border bg-background px-1">Alt</kbd> + 左键拉框新建 ·
          <kbd className="rounded border border-border bg-background px-1">Delete</kbd> 删选中 ·
          <kbd className="rounded border border-border bg-background px-1">Ctrl+Z</kbd> 撤销 ·
          <Crosshair className="inline h-3 w-3 align-text-bottom" /> 点图例定位
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
