import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Badge, Button, ChevronDown, Columns2, Dialog, DialogContent, DialogHeader, DialogTitle,
  Input, Label, Loader, Paintbrush, ScrollArea, ScrollText,
  openMediaGallery,
  ReactCompareSlider, ReactCompareSliderImage,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Switch, Tabs, TabsContent, TabsList, TabsTrigger, Textarea, Trash2, WandSparkles,
} from '@agent-spaces/ui';
import { runReskin, runInpaintSlot, DEFAULT_EROSION } from '../utils/reskin/reskinPipeline';
import { parseAtlas, safeFilename } from '../utils/reskin/atlasReader';
import { cropRegionRotated, loadImage } from '../utils/reskin/canvasUtils';
import { DEFAULT_EDIT_IMAGE_MODELS } from '../utils/settings';
import {
  getSpineAssetsSignature,
  normalizeReskinEditorData,
} from '../utils/reskin/reskinEditorData';
import useSpineReskinHistory from '../hooks/useSpineReskinHistory';
import { hasReskinLogImageOutput } from '../utils/reskin/reskinLogData';
import { resolveReskinComparison } from '../utils/reskin/reskinHistoryData';

const RESKIN_MODEL_STORAGE_KEY = 'spine-editor:processing-model';
const EROSION_STORAGE_KEY = 'spine-editor:erosion';
const SIZE_STORAGE_KEY = 'spine-editor:reskin-size';

const IMAGE_SIZES = [
  ['auto', 'Auto'],
  ['1k', '1K'],
  ['2k', '2K'],
  ['4k', '4K'],
];

const EROSION_FIELDS = [
  { key: 'pxSmall', label: '极小', hint: (s) => `边长 < ${s.smallThreshold}px` },
  { key: 'pxMedium', label: '小', hint: (s) => `边长 < ${s.mediumThreshold}px` },
  { key: 'pxLarge', label: '中', hint: (s) => `边长 < ${s.largeThreshold}px` },
  { key: 'pxXlarge', label: '大', hint: (s) => `边长 ≥ ${s.largeThreshold}px` },
];

export const reskinStepLabel = (step) => ({
  snapshot: '截图', load: '加载', pipeline: '换肤', parse: '解析', compose: '合成',
  upload: '上传', workflow: '工作流', split: '裁切', segment: '分割', repack: '打包',
  region_mask: '部件蒙版', skin: '皮肤', preview: '预览', apply: '应用',
  inpaint: '局部', done: '完成', error: '错误',
}[step] || step);

/** 从 localStorage 读 JSON，失败返回 fallback */
function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : { ...fallback };
  } catch { return { ...fallback }; }
}

async function uploadCanvas(canvas, fileName) {
  const AS = window.AgentSpaces;
  if (!AS?.uploadFile) throw new Error('宿主 uploadFile 不可用');
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((value) => (value ? resolve(value) : reject(new Error('Canvas 转 Blob 失败'))), 'image/png');
  });
  const uploaded = await AS.uploadFile(new File([blob], fileName, { type: 'image/png' }));
  const url = uploaded?.url || uploaded?.httpPath;
  if (!url) throw new Error('换肤历史图片上传失败');
  return url;
}

async function uploadImageSource(src, fileName) {
  if (!src || !String(src).startsWith('data:')) return src || '';
  const AS = window.AgentSpaces;
  if (!AS?.uploadFile) return '';
  const blob = await (await fetch(src)).blob();
  const uploaded = await AS.uploadFile(new File([blob], fileName, { type: blob.type || 'image/png' }));
  return uploaded?.url || uploaded?.httpPath || '';
}

/**
 * AI 换肤面板（内嵌在骨骼编辑器对话框）。
 *
 * 支持两种合成方法（atlas/exploded）、两种分割方法（sam/bg_components）、
 * 按部件尺寸分档的侵蚀去白边、per-slot 局部重绘。
 *
 * 处理模型、输出尺寸、侵蚀设置由本面板自行管理并持久化到 localStorage。
 *
 * @param {object} props
 * @param {object|null} props.assets 当前 spine 三件套 {skel, atlas, png, name}
 * @param {(pngDataUrl:string, name:string) => Promise<void>|void} props.replaceAtlas 热加载 atlas
 * @param {Promise<string|null>} props.requestSnapshot 请求画布截图
 * @param {Promise<object|null>} props.requestSpineJson 从当前编辑器实例导出 spine JSON（支持 .skel）
 * @param {(assets:{skel,atlas,png,spineJson}) => void} [props.onReskinComplete] 换肤完成
 */
export default function ReskinPanel({
  assets, workflowId, editImageModels, replaceAtlas, requestSnapshot, requestSpineJson,
  onReskinComplete, initialData, onDataChange, logs, setLogs,
}) {
  const initialStateRef = useRef(null);
  if (!initialStateRef.current) {
    let fallbackSize = '2k';
    let fallbackModel = '';
    try { fallbackSize = localStorage.getItem(SIZE_STORAGE_KEY) || fallbackSize; } catch { /* ignore */ }
    try { fallbackModel = localStorage.getItem(RESKIN_MODEL_STORAGE_KEY) || ''; } catch { /* ignore */ }
    initialStateRef.current = normalizeReskinEditorData(initialData, assets, {
      size: fallbackSize,
      processingModel: fallbackModel,
      erosion: loadJSON(EROSION_STORAGE_KEY, DEFAULT_EROSION),
    });
  }
  const initialState = initialStateRef.current;
  const [prompt, setPrompt] = useState(initialState.prompt);
  const [skinName, setSkinName] = useState(initialState.skinName);
  const [method, setMethod] = useState(initialState.method);         // 'atlas' | 'exploded'
  const [segMethod, setSegMethod] = useState(initialState.segMethod); // 'sam' | 'bg_components'
  const [size, setSize] = useState(initialState.size);               // 'auto'|'1k'|'2k'|'4k'
  const [erosion, setErosion] = useState(initialState.erosion);
  const [advancedOpen, setAdvancedOpen] = useState(false); // 侵蚀分档折叠
  const [running, setRunning] = useState(false);
  const [activeSkin, setActiveSkin] = useState(null);
  const [compareItem, setCompareItem] = useState(null);
  const [generatedImageUrl, setGeneratedImageUrl] = useState(initialState.generatedImageUrl);
  const [processingModel, setProcessingModel] = useState(initialState.processingModel);
  // per-slot 重绘
  const [slotMode, setSlotMode] = useState(initialState.slotMode); // 是否局部重绘模式
  const [selectedSlot, setSelectedSlot] = useState(initialState.selectedSlot);
  const [slots, setSlots] = useState([]);                // 可重绘的 slot 列表
  const onDataChangeRef = useRef(onDataChange);
  onDataChangeRef.current = onDataChange;
  const persistenceEnabledRef = useRef(false);
  const assetSignature = getSpineAssetsSignature(assets);
  const {
    history,
    saveHistory,
    deleteHistory: deletePersistedHistory,
  } = useSpineReskinHistory(assetSignature);
  const generatedImageSignatureRef = useRef(
    initialState.generatedImageUrl ? initialState.assetSignature : '',
  );
  const enablePersistence = useCallback(() => {
    persistenceEnabledRef.current = true;
  }, []);

  // 模型候选列表：由父组件（SpineEditorDialog）从全局设置传入，含用户自定义；兜底内置默认
  const processingModels = useMemo(() => {
    const values = Array.isArray(editImageModels)
      ? editImageModels.map((value) => String(value).trim()).filter(Boolean)
      : [];
    return values.length ? [...new Set(values)] : [...DEFAULT_EDIT_IMAGE_MODELS];
  }, [editImageModels]);

  useEffect(() => {
    if (processingModels.includes(processingModel)) return;
    setProcessingModel(processingModels[0] || 'gpt-image-1');
  }, [processingModel, processingModels]);

  const handleModelChange = useCallback((value) => {
    enablePersistence();
    setProcessingModel(value);
    try { localStorage.setItem(RESKIN_MODEL_STORAGE_KEY, value); } catch { /* ignore */ }
  }, [enablePersistence]);
  const handleSizeChange = useCallback((value) => {
    enablePersistence();
    setSize(value);
    try { localStorage.setItem(SIZE_STORAGE_KEY, value); } catch { /* ignore */ }
  }, [enablePersistence]);
  const updateErosion = useCallback((patch) => {
    enablePersistence();
    setErosion((cur) => {
      const next = { ...cur, ...patch };
      try { localStorage.setItem(EROSION_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [enablePersistence]);

  const spineName = assets?.name || 'spine';

  useEffect(() => {
    if (generatedImageSignatureRef.current === assetSignature) return;
    generatedImageSignatureRef.current = '';
    setGeneratedImageUrl('');
  }, [assetSignature]);

  useEffect(() => {
    persistenceEnabledRef.current = false;
  }, [assetSignature]);

  useEffect(() => {
    if (!persistenceEnabledRef.current) {
      console.debug('[SpineEditor] skipped initial reskin form persistence');
      return;
    }
    onDataChangeRef.current?.({
      assetSignature,
      assets: assets ? {
        skel: assets.skel || '',
        atlas: assets.atlas || '',
        png: assets.png || '',
        name: assets.name || '',
      } : null,
      prompt,
      skinName,
      method,
      segMethod,
      size,
      erosion: { ...erosion },
      processingModel,
      slotMode,
      selectedSlot,
      generatedImageUrl: generatedImageSignatureRef.current === assetSignature
        ? generatedImageUrl
        : '',
    });
  }, [assetSignature, prompt, skinName, method, segMethod, size, erosion,
    processingModel, slotMode, selectedSlot, generatedImageUrl]);

  const addLog = useCallback((step, msg, data) => {
    if (!hasReskinLogImageOutput(data)) return;
    setLogs((prev) => [...prev.slice(-499), { step, msg, data, ts: Date.now() }]);
  }, [setLogs]);

  const handleGeneratedImage = useCallback((url) => {
    enablePersistence();
    generatedImageSignatureRef.current = url ? assetSignature : '';
    setGeneratedImageUrl(url || '');
  }, [assetSignature, enablePersistence]);

  const slug = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32);
  const finalSkinName = skinName.trim() || slug(prompt) || 'reskin-1';

  // 切换到局部重绘模式时，加载可用 slot 列表（从 spine JSON 的 default skin 取）
  const loadSlots = useCallback(async () => {
    if (!assets) return;
    try {
      const AS = window.AgentSpaces;
      const proxy = (u) => (AS?.proxyImageUrl ? AS.proxyImageUrl(u) : u);
      let spineJson = null;
      if (assets.skel?.endsWith('.json')) {
        spineJson = await fetch(proxy(assets.skel)).then((r) => r.json()).catch(() => null);
      }
      if (!spineJson && requestSpineJson) spineJson = await requestSpineJson();
      if (!spineJson) return;
      const skins = spineJson.skins;
      let atts;
      if (Array.isArray(skins)) {
        const def = skins.find((s) => s && s.name === 'default');
        atts = (def || {}).attachments || {};
      } else {
        atts = (skins || {}).default || {};
      }
      const slotNames = Object.keys(atts || {});
      setSlots(slotNames);
      setSelectedSlot((current) => (slotNames.includes(current) ? current : (slotNames[0] || '')));
    } catch { /* ignore */ }
  }, [assets, requestSpineJson]);

  useEffect(() => {
    if (slotMode && assets) loadSlots();
  }, [slotMode, assets, loadSlots]);

  const applyHistory = useCallback(async (item) => {
    const previewUrl = item?.assets?.previewPngUrl
      || item?.assets?.previewPngDataUrl
      || item?.assets?.pngUrl
      || item?.assets?.pngDataUrl;
    if (!previewUrl) return;
    addLog('apply', `应用历史皮肤：${item.name}`, {
      images: item.stages || [],
      imageCount: item.stages?.length || 0,
    });
    await replaceAtlas?.(previewUrl, item.name);
    setActiveSkin(item.name);
  }, [replaceAtlas, addLog]);

  /** 全局换肤 */
  const handleRun = useCallback(async () => {
    if (!prompt.trim() || !assets) return;
    enablePersistence();
    const runId = `reskin-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setRunning(true);
    setActiveSkin(null);
    try {
      addLog('snapshot', '请求画布截图…');
      const snapshot = await requestSnapshot?.();
      if (!snapshot && method === 'atlas') throw new Error('atlas 方法需要画布截图');

      addLog('load', '加载原 atlas 与 spine JSON…');
      const AS = window.AgentSpaces;
      const proxy = (u) => (AS?.proxyImageUrl ? AS.proxyImageUrl(u) : u);
      const atlasText = await fetch(proxy(assets.atlas)).then((r) => r.text());

      let spineJson = null;
      if (assets.skel?.endsWith('.json')) {
        spineJson = await fetch(proxy(assets.skel)).then((r) => r.json()).catch(() => null);
      }
      if (!spineJson && requestSpineJson) {
        addLog('load', '从编辑器导出 spine JSON…');
        spineJson = await requestSpineJson();
      }
      if (!spineJson) throw new Error('无法获取 spine JSON');

      addLog('pipeline', `开始 AI 换肤（${method} / ${segMethod} / ${size}）…`);
      const result = await runReskin({
        snapshot, atlasSheetUrl: assets.png, atlasText, spineJson,
        skinName: finalSkinName, prompt, generatedImageUrl,
      }, {
        method, segMethod,
        size,
        erosion,
        workflowId,
        model: processingModel,
        onLog: (step, msg, data) => addLog(step, msg, { ...data, runId }),
        onGeneratedImage: handleGeneratedImage,
      });

      addLog('preview', '应用新皮肤到画布预览…');
      const pngDataUrl = result.newAtlasCanvas.toDataURL('image/png');
      const previewPngDataUrl = result.previewAtlasCanvas.toDataURL('image/png');
      setLogs((current) => current.map((log) => {
        if (log.step !== 'region_mask' || log.data?.runId !== runId) return log;
        const bbox = log.data?.params?.bbox;
        return {
          ...log,
          data: {
            ...log.data,
            editContext: bbox ? {
              runId,
              previewAtlasCanvas: result.previewAtlasCanvas,
              region: { ...bbox, rotate: log.data?.params?.rotate || 0 },
              spineAssets: {
                skel: assets.skel,
                atlas: atlasText,
                spineJson,
              },
            } : null,
          },
        };
      }));
      await replaceAtlas?.(previewPngDataUrl, finalSkinName);
      setActiveSkin(finalSkinName);
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const spineAfterSnapshot = await requestSnapshot?.();

      const persistedAssets = await onReskinComplete?.({
        skel: assets.skel,
        atlas: result.newAtlasText,
        png: pngDataUrl,
        spineJson: result.newSpineJson,
      });
      const timestamp = Date.now();
      const [pngUrl, previewPngUrl, spineBeforeUrl, spineAfterUrl] = await Promise.all([
        persistedAssets?.png
          ? Promise.resolve(persistedAssets.png)
          : uploadCanvas(result.newAtlasCanvas, `${finalSkinName}-atlas-${timestamp}.png`),
        uploadCanvas(result.previewAtlasCanvas, `${finalSkinName}-preview-${timestamp}.png`),
        uploadImageSource(snapshot, `${finalSkinName}-spine-before-${timestamp}.png`).catch(() => ''),
        uploadImageSource(spineAfterSnapshot, `${finalSkinName}-spine-after-${timestamp}.png`).catch(() => ''),
      ]);
      const stages = [
        { label: '原 Atlas', src: assets.png },
        { label: 'AI 生成', src: result.diagnostics?.generatedImageUrl },
        { label: 'SAM 分割源', src: result.diagnostics?.samSourceUrl },
        { label: '去背景', src: result.diagnostics?.cleanedSourceUrl },
        { label: '最终 Atlas', src: pngUrl },
      ].filter((stage) => stage.src);
      const logImages = [
        ...stages.slice(0, -1),
        ...(result.diagnostics?.samMasks || []).map((mask) => ({
          label: `SAM Mask · ${mask.slotId}`,
          src: mask.maskUrl,
        })),
        stages[stages.length - 1],
      ].filter((stage) => stage?.src);
      const historyItem = {
        id: `reskin-${timestamp}-${Math.random().toString(36).slice(2, 7)}`,
        name: finalSkinName, prompt, timestamp,
        thumbnailUrl: previewPngUrl, stages, stats: result.stats,
        compare: {
          materialBefore: assets.png,
          materialAfter: previewPngUrl,
          spineBefore: spineBeforeUrl,
          spineAfter: spineAfterUrl,
        },
        assets: {
          pngUrl,
          previewPngUrl,
          atlasUrl: persistedAssets?.atlas || '',
          spineJsonUrl: persistedAssets?.spineJson || '',
          skelUrl: persistedAssets?.skel || assets.skel,
        },
      };
      await saveHistory(historyItem);
      addLog('done', `✓ 换肤完成：${finalSkinName}`, {
        runId,
        images: logImages,
        imageCount: logImages.length,
        stats: result.stats,
      });
    } catch (err) {
      console.error('[reskin] failed:', err);
      addLog('error', `换肤失败：${err?.message || String(err)}`, { error: true });
    } finally {
      setRunning(false);
    }
  }, [prompt, assets, method, segMethod, size, erosion, finalSkinName, generatedImageUrl, requestSnapshot, requestSpineJson, replaceAtlas, onReskinComplete, addLog, workflowId, processingModel, handleGeneratedImage, saveHistory, setLogs, enablePersistence]);

  /** per-slot 局部重绘 */
  const handleInpaintSlot = useCallback(async () => {
    if (!prompt.trim() || !assets || !selectedSlot) return;
    setRunning(true);
    try {
      addLog('load', '加载原 atlas 与 spine JSON…');
      const AS = window.AgentSpaces;
      const proxy = (u) => (AS?.proxyImageUrl ? AS.proxyImageUrl(u) : u);
      const [atlasText, atlasSheetImg] = await Promise.all([
        fetch(proxy(assets.atlas)).then((r) => r.text()),
        loadImage(proxy(assets.png)),
      ]);
      let spineJson = null;
      if (assets.skel?.endsWith('.json')) {
        spineJson = await fetch(proxy(assets.skel)).then((r) => r.json()).catch(() => null);
      }
      if (!spineJson && requestSpineJson) spineJson = await requestSpineJson();
      if (!spineJson) throw new Error('无法获取 spine JSON');

      const atlas = parseAtlas(atlasText);
      const regions = atlas.regions;
      // 找到目标 slot 的 region
      const region2slot = {};
      const skins = spineJson.skins;
      let atts;
      if (Array.isArray(skins)) {
        const def = skins.find((s) => s && s.name === 'default');
        atts = (def || {}).attachments || {};
      } else atts = (skins || {}).default || {};
      for (const [slotName, slotAtts] of Object.entries(atts)) {
        if (!slotAtts) continue;
        const [attKey, attMeta] = Object.entries(slotAtts)[0];
        const region = (attMeta && attMeta.name) ? attMeta.name : attKey;
        region2slot[region] = slotName;
      }
      const targetRegion = regions.find((r) => region2slot[r.name] === selectedSlot);
      if (!targetRegion) throw new Error(`slot "${selectedSlot}" 无对应 region`);

      // 裁出目标 region 当前 PNG
      const regionCanvas = cropRegionRotated(atlasSheetImg, targetRegion.x, targetRegion.y, targetRegion.w, targetRegion.h, targetRegion.rotate);

      const result = await runInpaintSlot({
        slot: selectedSlot, skinName: finalSkinName, prompt,
        regionCanvas, spineJson, regions, atlasSheet: atlasSheetImg,
      }, {
        size,
        erosion,
        workflowId,
        model: processingModel,
        onLog: (step, msg, data) => addLog(step, msg, data),
      });

      const pngDataUrl = result.newAtlasCanvas.toDataURL('image/png');
      const previewPngDataUrl = result.previewAtlasCanvas.toDataURL('image/png');
      await replaceAtlas?.(previewPngDataUrl, finalSkinName);
      setActiveSkin(finalSkinName);
      onReskinComplete?.({ skel: assets.skel, atlas: result.newAtlasText, png: pngDataUrl, spineJson: result.newSpineJson });
      const logImages = [
        { label: `${selectedSlot} · 输入`, src: regionCanvas.toDataURL('image/png') },
        { label: '最终 Atlas', src: pngDataUrl },
      ];
      addLog('done', `✓ 局部重绘完成：${selectedSlot}`, {
        images: logImages,
        imageCount: logImages.length,
        stats: result.stats,
      });
    } catch (err) {
      console.error('[inpaint] failed:', err);
      addLog('error', `局部重绘失败：${err?.message || String(err)}`, { error: true });
    } finally {
      setRunning(false);
    }
  }, [prompt, assets, selectedSlot, size, erosion, finalSkinName, requestSpineJson, replaceAtlas, onReskinComplete, addLog, workflowId, processingModel]);

  const handleDeleteHistory = useCallback(async (item, e) => {
    e?.stopPropagation();
    try {
      await deletePersistedHistory(item.id);
      if (assets?.png) await replaceAtlas?.(assets.png, '默认皮肤');
      setActiveSkin(null);
      console.debug('[SpineEditor] restored default atlas after deleting reskin history');
    } catch (err) {
      addLog('error', `删除生成记录失败：${err?.message || err}`, { error: true });
    }
  }, [deletePersistedHistory, assets?.png, replaceAtlas, addLog]);

  const deleteGeneratedImage = useCallback(() => {
    enablePersistence();
    generatedImageSignatureRef.current = '';
    setGeneratedImageUrl('');
    addLog('workflow', '已删除生成图，下次换肤将重新生成');
  }, [addLog, enablePersistence]);

  const generationLocked = !slotMode && !!generatedImageUrl;

  return (
    <>
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <ScrollArea className="min-h-0 flex-1 border-b border-border">
        <div className="space-y-3 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium">AI 换肤</span>
            <div className="flex min-w-0 items-center gap-1.5">
              <Badge variant="secondary" className="max-w-28 truncate">{assets ? spineName : '未加载'}</Badge>
            </div>
          </div>
        <Tabs
          value={slotMode ? 'slot' : 'global'}
          onValueChange={(value) => {
            enablePersistence();
            const nextSlotMode = value === 'slot';
            setSlotMode(nextSlotMode);
            if (nextSlotMode && assets) loadSlots();
          }}
        >
          <TabsList className="w-full">
            <TabsTrigger value="global" disabled={running} className="flex-1">全局换肤</TabsTrigger>
            <TabsTrigger value="slot" disabled={running || !assets} className="flex-1">局部重绘</TabsTrigger>
          </TabsList>
        </Tabs>

        <Textarea
          rows={3}
          placeholder={slotMode ? '描述该部位新样式' : '描述新皮肤，如 "黑精灵，黑翅膀，金甲"'}
          value={prompt}
          onChange={(e) => { enablePersistence(); setPrompt(e.target.value); }}
          disabled={running || generationLocked}
          className="resize-none text-xs"
        />

        {!slotMode && generatedImageUrl && (
          <div className="space-y-2 rounded border border-border p-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs">生成图片</Label>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={running}
                onClick={deleteGeneratedImage}
                title="删除生成图片"
                aria-label="删除生成图片"
                className="h-7 w-7"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <button
              type="button"
              disabled={running}
              onClick={() => openMediaGallery([{
                src: generatedImageUrl,
                type: 'image',
                alt: `${finalSkinName} 生成图片`,
                fileName: `${finalSkinName}-generated.png`,
              }], 0)}
              className="block w-full overflow-hidden rounded border border-border bg-muted transition hover:border-primary disabled:cursor-not-allowed"
              title="点击查看大图"
            >
              <img
                src={generatedImageUrl}
                alt={`${finalSkinName} 生成图片`}
                className="h-28 w-full object-contain"
              />
            </button>
            <p className="text-[10px] text-muted-foreground">再次换肤将复用此图；删除后才会重新生成。</p>
          </div>
        )}

        {!slotMode ? (
          <>
            <Input
              placeholder={slug(prompt) || '皮肤名'}
              value={skinName}
              onChange={(e) => { enablePersistence(); setSkinName(e.target.value); }}
              disabled={running}
              className="h-8 text-xs"
            />
            <FieldSelect label="合成方法" value={method} onValueChange={(value) => { enablePersistence(); setMethod(value); }} disabled={running || generationLocked} options={[
              ['atlas', 'Atlas + 截图'],
              ['exploded', '爆炸图'],
            ]} />
            <FieldSelect label="分割方法" value={segMethod} onValueChange={(value) => { enablePersistence(); setSegMethod(value); }} disabled={running} options={[
              ['sam', 'SAM 精确'],
              ['bg_components', '形状交集'],
            ]} />
          </>
        ) : (
          <FieldSelect
            label="重绘部位"
            value={selectedSlot}
            onValueChange={(value) => { enablePersistence(); setSelectedSlot(value); }}
            disabled={running || !slots.length}
            options={slots.map((slot) => [slot, slot])}
            placeholder="无可用部位"
          />
        )}

        <FieldSelect label="处理模型" value={processingModel} onValueChange={handleModelChange} disabled={running || generationLocked} options={processingModels.map((m) => [m, m])} placeholder="选择模型" />
        <FieldSelect label="输出尺寸" value={size} onValueChange={handleSizeChange} disabled={running || generationLocked} options={IMAGE_SIZES} />

        <div className="rounded border border-border">
          <button
            type="button"
            disabled={running}
            onClick={() => setAdvancedOpen((v) => !v)}
            className="flex w-full items-center justify-between px-2 py-1.5 text-xs"
          >
            <span className="flex items-center gap-2">
              <Switch
                checked={erosion.enabled}
                onCheckedChange={(checked) => { updateErosion({ enabled: checked }); }}
                disabled={running}
                onClick={(e) => e.stopPropagation()}
              />
              <span>侵蚀去白边（按部件分档）</span>
            </span>
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${advancedOpen ? '' : '-rotate-90'}`} />
          </button>
          {advancedOpen && erosion.enabled && (
            <div className="space-y-2 border-t border-border px-2 py-2">
              {EROSION_FIELDS.map((f) => (
                <div key={f.key} className="grid grid-cols-[44px_1fr_56px] items-center gap-2">
                  <Label className="text-[11px] text-muted-foreground">{f.label}</Label>
                  <span className="truncate text-[10px] text-muted-foreground">{f.hint(erosion)}</span>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min={0}
                      max={20}
                      step={1}
                      value={erosion[f.key]}
                      onChange={(e) => updateErosion({ [f.key]: Math.max(0, parseInt(e.target.value || '0', 10)) })}
                      disabled={running}
                      className="h-7 text-[11px]"
                    />
                    <span className="text-[10px] text-muted-foreground">px</span>
                  </div>
                </div>
              ))}
              <p className="text-[10px] leading-relaxed text-muted-foreground">按部件边长落入对应档位，侵蚀半径用于收缩 SAM mask 去除边缘白边。设为 0px 跳过该档。</p>
            </div>
          )}
        </div>

        <Button
          size="sm"
          className="h-8 gap-1 text-xs"
          onClick={slotMode ? handleInpaintSlot : handleRun}
          disabled={running || !prompt.trim() || !assets || (slotMode && !selectedSlot)}
        >
          {running ? <Loader className="h-3.5 w-3.5" /> : slotMode ? <Paintbrush className="h-3.5 w-3.5" /> : <WandSparkles className="h-3.5 w-3.5" />}
          {running ? '处理中…' : slotMode ? '局部重绘' : '开始换肤'}
        </Button>
        </div>
      </ScrollArea>

      {history.length > 0 && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="px-3 py-2 text-xs font-medium">生成记录（{history.length}）</div>
          <ScrollArea className="min-h-0 flex-1 px-2 pb-2">
            {history.map((item) => {
              const stages = item.stages?.length ? item.stages : [
                { label: '结果', src: item.thumbnailUrl },
              ];
              const before = stages[0];
              const after = stages[stages.length - 1];
              const media = stages.map((stage) => ({
                src: stage.src, type: 'image', alt: `${item.name} ${stage.label}`,
                fileName: `${item.name}-${stage.label}.png`,
              }));
              return (
                <div
                  key={item.name + item.timestamp}
                  className={`group mb-2 rounded border p-2 ${activeSkin === item.name ? 'border-primary bg-primary/5' : 'border-border'}`}
                >
                  <div className="mb-2 flex items-center gap-2">
                    <button type="button" onClick={() => applyHistory(item)} className="min-w-0 flex-1 text-left">
                      <div className="truncate text-[11px] font-medium">{item.name}</div>
                      <div className="truncate text-[9px] text-muted-foreground">{item.prompt}</div>
                    </button>
                    <Button type="button" variant="ghost" size="icon-sm" onClick={(e) => { e.stopPropagation(); setCompareItem(item); }} title="对比" className="h-7 w-7 opacity-70 group-hover:opacity-100">
                      <Columns2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon-sm" onClick={(e) => handleDeleteHistory(item, e)} title="删除" className="h-7 w-7 opacity-0 group-hover:opacity-100">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[before, after].map((stage, stageIndex) => (
                      <button
                        key={`${stage.label}-${stageIndex}`}
                        type="button"
                        onClick={() => openMediaGallery(media, stageIndex ? media.length - 1 : 0)}
                        className="min-w-0 overflow-hidden rounded border border-border bg-muted"
                        title={`查看${stage.label}`}
                      >
                        <img src={stage.src} alt={`${item.name} ${stage.label}`} className="h-16 w-full object-contain" />
                        <span className="block truncate border-t border-border px-1 py-0.5 text-[9px] text-muted-foreground">{stage.label}</span>
                      </button>
                    ))}
                  </div>
                  {stages.length > 2 && (
                    <div className="mt-1 truncate text-[9px] text-muted-foreground">
                      {stages.map((stage) => stage.label).join(' → ')}
                    </div>
                  )}
                  {item.stats?.samMaskCount > 0 && (
                    <div className="mt-1 truncate text-[9px] text-muted-foreground">
                      SAM masks: {item.stats.samMaskCount}; scores: {(item.stats.samScores || [])
                        .map(({ slotId, score }) => `${slotId}=${Number(score).toFixed(3)}`)
                        .join(', ')}
                    </div>
                  )}
                </div>
              );
            })}
          </ScrollArea>
        </div>
      )}
      </div>
      <ReskinCompareDialog item={compareItem} onClose={() => setCompareItem(null)} />
    </>
  );
}

function ReskinCompareDialog({ item, onClose }) {
  const comparison = resolveReskinComparison(item);
  return (
    <Dialog open={!!item} onOpenChange={(open) => { if (!open) onClose?.(); }}>
      <DialogContent className="flex h-[82vh] max-h-[92vh] !w-[80vw] !max-w-[80vw] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border px-4 py-3 pr-12">
          <DialogTitle className="text-sm">生成记录对比 · {item?.name || ''}</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="material" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="mx-4 mt-3 w-fit shrink-0">
            <TabsTrigger value="material">材质图对比</TabsTrigger>
            <TabsTrigger value="spine">Spine 对比</TabsTrigger>
          </TabsList>
          <CompareTab value="material" before={comparison.material.before} after={comparison.material.after} beforeLabel="原材质" afterLabel="换肤材质" />
          <CompareTab value="spine" before={comparison.spine.before} after={comparison.spine.after} beforeLabel="原 Spine" afterLabel="换肤 Spine" />
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function CompareTab({ value, before, after, beforeLabel, afterLabel }) {
  return (
    <TabsContent value={value} className="mt-0 min-h-0 flex-1 p-4">
      {before && after ? (
        <div className="relative h-full min-h-72 overflow-hidden rounded border border-border bg-muted">
          <ReactCompareSlider
            className="h-full w-full"
            itemOne={<ReactCompareSliderImage src={before} alt={beforeLabel} style={{ objectFit: 'contain' }} />}
            itemTwo={<ReactCompareSliderImage src={after} alt={afterLabel} style={{ objectFit: 'contain' }} />}
          />
          <span className="pointer-events-none absolute left-3 top-3 rounded bg-background/85 px-2 py-1 text-[11px]">{beforeLabel}</span>
          <span className="pointer-events-none absolute right-3 top-3 rounded bg-background/85 px-2 py-1 text-[11px]">{afterLabel}</span>
        </div>
      ) : (
        <div className="flex h-full min-h-72 items-center justify-center text-sm text-muted-foreground">
          此生成记录缺少{value === 'spine' ? '完整 Spine 截图' : '材质图'}，请重新执行一次换肤。
        </div>
      )}
    </TabsContent>
  );
}

export function ReskinLogsPanel({
  logs, onClear, onRepaintMask, applyingMask = false, stepLabel = reskinStepLabel,
}) {
  const [stepFilter, setStepFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const endRef = useRef(null);
  const steps = useMemo(() => Array.from(new Set(logs.map((log) => log.step))).sort(), [logs]);
  const filtered = useMemo(() => logs.filter((log) => {
    const isError = log.data?.error || log.step === 'error';
    if (stepFilter !== 'all' && log.step !== stepFilter) return false;
    if (statusFilter === 'error' && !isError) return false;
    if (statusFilter === 'ok' && isError) return false;
    return true;
  }), [logs, statusFilter, stepFilter]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [filtered.length]);

  const clearLogs = () => {
    if (!logs.length || !window.confirm('清空当前编辑会话的全部素材替换日志？')) return;
    onClear();
  };

  return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
        <div className="shrink-0 border-b border-border px-3 py-2">
          <div className="flex items-center gap-2 text-xs font-medium">
            <ScrollText className="h-4 w-4" />
            素材替换日志
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
          <Select value={stepFilter} onValueChange={setStepFilter}>
            <SelectTrigger size="sm" className="w-40">
              <SelectValue>{stepFilter === 'all' ? '全部步骤' : stepLabel(stepFilter)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部步骤</SelectItem>
              {steps.map((step) => <SelectItem key={step} value={step}>{stepLabel(step)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger size="sm" className="w-32">
              <SelectValue>{statusFilter === 'all' ? '全部状态' : statusFilter === 'error' ? '仅错误' : '仅正常'}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="ok">仅正常</SelectItem>
              <SelectItem value="error">仅错误</SelectItem>
            </SelectContent>
          </Select>
          <span className="ml-auto text-[11px] text-muted-foreground">
            {filtered.length} / {logs.length}
          </span>
          <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-[11px]" disabled={!logs.length} onClick={clearLogs}>
            <Trash2 className="h-3.5 w-3.5" />
            清空
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-muted/20 px-3 py-3">
          {filtered.length === 0 ? (
            <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
              {logs.length ? '没有符合筛选条件的日志' : '暂无日志，执行换肤或局部重绘后将在这里显示'}
            </div>
          ) : (
            <div className="space-y-2 pb-3">
              {filtered.map((log, index) => {
                const isError = log.data?.error || log.step === 'error';
                const details = formatLogData(log.data);
                const images = normalizeLogImages(log.data?.images);
                const imageFlow = normalizeImageFlow(log.data?.imageFlow);
                return (
                  <div key={`${log.ts}-${index}`} className={`rounded-md border bg-background p-3 ${isError ? 'border-destructive/50' : 'border-border'}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      {imageFlow ? (
                        <span className="min-w-0 flex-1 text-xs font-semibold">换皮 · {stepLabel(log.step)}</span>
                      ) : (
                        <>
                          <Badge variant={isError ? 'destructive' : 'secondary'}>{stepLabel(log.step)}</Badge>
                          <span className={`min-w-0 flex-1 text-xs ${isError ? 'text-destructive' : 'text-foreground'}`}>{log.msg}</span>
                        </>
                      )}
                      {log.data?.skinName && <Badge variant="outline">skin: {log.data.skinName}</Badge>}
                      {log.data?.regionName && <Badge variant="outline">part: {log.data.regionName}</Badge>}
                      <time className="text-[10px] text-muted-foreground">{new Date(log.ts).toLocaleTimeString()}</time>
                    </div>
                    {log.data?.done != null && log.data?.total ? (
                      <div className="mt-2 text-[10px] text-muted-foreground">进度：{log.data.done} / {log.data.total}</div>
                    ) : null}
                    {imageFlow && (
                      <LogImageFlow
                        flow={imageFlow}
                        params={log.data?.params}
                        log={log}
                        applyingMask={applyingMask}
                        onRepaintMask={onRepaintMask}
                      />
                    )}
                    <LogImageList images={images} />
                    {details && (
                      <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap break-all rounded bg-muted px-2 py-1.5 font-mono text-[10px] leading-relaxed text-muted-foreground">{details}</pre>
                    )}
                  </div>
                );
              })}
              <div ref={endRef} />
            </div>
          )}
        </div>
      </div>
  );
}

function formatLogData(data) {
  if (!data || typeof data !== 'object') return '';
  const entries = Object.entries(data).filter(([key]) => ![
    'done', 'total', 'error', 'images', 'imageFlow', 'params', 'skinName', 'regionName',
    'runId', 'editContext',
  ].includes(key));
  if (!entries.length) return '';
  try {
    const value = JSON.stringify(Object.fromEntries(entries), null, 2);
    return value.length > 2000 ? `${value.slice(0, 2000)}\n...` : value;
  } catch {
    return String(data);
  }
}

function normalizeLogImages(images) {
  if (!Array.isArray(images)) return [];
  return images
    .map((image, index) => (
      typeof image === 'string'
        ? { label: `图片 ${index + 1}`, src: image }
        : { label: image?.label || `图片 ${index + 1}`, src: image?.src || image?.url }
    ))
    .filter((image) => image.src);
}

function normalizeImageFlow(flow) {
  if (!flow || typeof flow !== 'object') return null;
  const inputs = normalizeLogImages(flow.inputs);
  const outputs = normalizeLogImages(flow.outputs);
  return inputs.length || outputs.length ? { inputs, outputs } : null;
}

function LogImageFlow({ flow, params, log, applyingMask, onRepaintMask }) {
  const images = [...flow.inputs, ...flow.outputs];
  const media = images.map((image) => ({
    src: image.src,
    type: 'image',
    alt: image.label,
    fileName: `${safeFilename(image.label || 'region-mask')}.png`,
  }));
  return (
    <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-start">
      <div className="flex min-w-0 items-end gap-3 overflow-x-auto pb-1">
        <LogImageGroup
          label="INPUT"
          images={flow.inputs}
          media={media}
          startIndex={0}
          log={log}
          applyingMask={applyingMask}
          onRepaintMask={onRepaintMask}
        />
        <span className="pb-10 text-lg text-muted-foreground">→</span>
        <LogImageGroup label="OUTPUT" images={flow.outputs} media={media} startIndex={flow.inputs.length} />
      </div>
      <LogParams params={params} />
    </div>
  );
}

function LogImageGroup({ label, images, media, startIndex, log, applyingMask, onRepaintMask }) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 text-[10px] font-medium tracking-wide text-muted-foreground">{label}</div>
      <div className="flex gap-2">
        {images.map((image, index) => {
          const canRepaint = label === 'INPUT'
            && image.label.includes('蒙版')
            && Boolean(log.data?.editContext)
            && typeof onRepaintMask === 'function';
          return (
            <div key={`${image.src}-${index}`} className="relative w-24 shrink-0">
              <button
                type="button"
                className="w-full overflow-hidden rounded border border-border bg-muted text-left transition hover:border-primary"
                onClick={() => openMediaGallery(media, startIndex + index)}
                title={`查看 ${image.label}`}
              >
                <img src={image.src} alt={image.label} className="aspect-square w-full object-contain" />
                <span className="block truncate border-t border-border px-1 py-0.5 text-[9px] text-muted-foreground">{image.label}</span>
              </button>
              {canRepaint && (
                <Button
                  type="button"
                  variant="secondary"
                  size="icon-sm"
                  className="absolute right-1 top-1 h-6 w-6 shadow"
                  disabled={applyingMask}
                  onClick={() => onRepaintMask(log, image)}
                  title="重绘部件蒙版"
                >
                  {applyingMask ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <Paintbrush className="h-3.5 w-3.5" />}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LogParams({ params }) {
  const entries = params && typeof params === 'object' ? Object.entries(params) : [];
  if (!entries.length) return null;
  return (
    <div className="min-w-56 flex-1">
      <div className="mb-1.5 text-[10px] font-medium tracking-wide text-muted-foreground">PARAMS</div>
      <dl className="space-y-1 text-[11px]">
        {entries.map(([key, value]) => (
          <div key={key} className="grid grid-cols-[72px_minmax(0,1fr)] gap-2">
            <dt className="text-muted-foreground">{key}</dt>
            <dd className="break-all text-foreground">{formatParamValue(value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function formatParamValue(value) {
  if (value == null) return '-';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try { return JSON.stringify(value); } catch { return String(value); }
}

function LogImageList({ images }) {
  if (!images.length) return null;
  const media = images.map((image) => ({
    src: image.src,
    type: 'image',
    alt: image.label,
    fileName: `${safeFilename(image.label || 'reskin-log')}.png`,
  }));
  return (
    <div className="mt-3">
      <div className="mb-1.5 text-[10px] font-medium text-muted-foreground">图片列表（{images.length}）</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {images.map((image, index) => (
          <button
            key={`${image.src}-${index}`}
            type="button"
            className="min-w-0 overflow-hidden rounded border border-border bg-muted text-left transition hover:border-primary"
            onClick={() => openMediaGallery(media, index)}
            title={`查看 ${image.label}`}
          >
            <img src={image.src} alt={image.label} className="aspect-square w-full object-contain" />
            <span className="block truncate border-t border-border px-1.5 py-1 text-[9px] text-muted-foreground">{image.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function FieldSelect({ label, value, onValueChange, options, disabled, placeholder }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value || null} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger size="sm" className="min-w-36 max-w-44">
          <SelectValue>{value ? (options.find(([key]) => key === value)?.[1] || value) : placeholder}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map(([key, text]) => <SelectItem key={key} value={key}>{text}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
