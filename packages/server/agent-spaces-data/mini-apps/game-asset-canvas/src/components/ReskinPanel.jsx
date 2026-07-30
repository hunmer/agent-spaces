import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Badge, Button, ChevronDown, Input, Label, Loader, Paintbrush, ScrollArea,
  openMediaGallery,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Switch, Tabs, TabsList, TabsTrigger, Textarea, Trash2, WandSparkles,
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
  onReskinComplete, initialData, onDataChange,
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
  const [logs, setLogs] = useState([]);
  const [activeSkin, setActiveSkin] = useState(null);
  const [generatedImageUrl, setGeneratedImageUrl] = useState(initialState.generatedImageUrl);
  const [processingModel, setProcessingModel] = useState(initialState.processingModel);
  // per-slot 重绘
  const [slotMode, setSlotMode] = useState(initialState.slotMode); // 是否局部重绘模式
  const [selectedSlot, setSelectedSlot] = useState(initialState.selectedSlot);
  const [slots, setSlots] = useState([]);                // 可重绘的 slot 列表
  const logEndRef = useRef(null);
  const onDataChangeRef = useRef(onDataChange);
  onDataChangeRef.current = onDataChange;
  const assetSignature = getSpineAssetsSignature(assets);
  const {
    history,
    saveHistory,
    deleteHistory: deletePersistedHistory,
  } = useSpineReskinHistory(assetSignature);
  const generatedImageSignatureRef = useRef(
    initialState.generatedImageUrl ? initialState.assetSignature : '',
  );

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
    setProcessingModel(value);
    try { localStorage.setItem(RESKIN_MODEL_STORAGE_KEY, value); } catch { /* ignore */ }
  }, []);
  const handleSizeChange = useCallback((value) => {
    setSize(value);
    try { localStorage.setItem(SIZE_STORAGE_KEY, value); } catch { /* ignore */ }
  }, []);
  const updateErosion = useCallback((patch) => {
    setErosion((cur) => {
      const next = { ...cur, ...patch };
      try { localStorage.setItem(EROSION_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const spineName = assets?.name || 'spine';

  useEffect(() => {
    if (generatedImageSignatureRef.current === assetSignature) return;
    generatedImageSignatureRef.current = '';
    setGeneratedImageUrl('');
  }, [assetSignature]);

  useEffect(() => {
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

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [logs]);

  const addLog = useCallback((step, msg, data) => {
    setLogs((prev) => [...prev, { step, msg, data, ts: Date.now() }]);
  }, []);

  const handleGeneratedImage = useCallback((url) => {
    generatedImageSignatureRef.current = url ? assetSignature : '';
    setGeneratedImageUrl(url || '');
  }, [assetSignature]);

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
    addLog('apply', `应用历史皮肤：${item.name}`);
    await replaceAtlas?.(previewUrl, item.name);
    setActiveSkin(item.name);
  }, [replaceAtlas, addLog]);

  /** 全局换肤 */
  const handleRun = useCallback(async () => {
    if (!prompt.trim() || !assets) return;
    setRunning(true);
    setLogs([]);
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
        onLog: (step, msg, data) => addLog(step, msg, data),
        onGeneratedImage: handleGeneratedImage,
      });

      addLog('preview', '应用新皮肤到画布预览…');
      const pngDataUrl = result.newAtlasCanvas.toDataURL('image/png');
      const previewPngDataUrl = result.previewAtlasCanvas.toDataURL('image/png');
      await replaceAtlas?.(previewPngDataUrl, finalSkinName);
      setActiveSkin(finalSkinName);

      const persistedAssets = await onReskinComplete?.({
        skel: assets.skel,
        atlas: result.newAtlasText,
        png: pngDataUrl,
        spineJson: result.newSpineJson,
      });
      const timestamp = Date.now();
      const [pngUrl, previewPngUrl] = await Promise.all([
        persistedAssets?.png
          ? Promise.resolve(persistedAssets.png)
          : uploadCanvas(result.newAtlasCanvas, `${finalSkinName}-atlas-${timestamp}.png`),
        uploadCanvas(result.previewAtlasCanvas, `${finalSkinName}-preview-${timestamp}.png`),
      ]);
      const stages = [
        { label: '原 Atlas', src: assets.png },
        { label: 'AI 生成', src: result.diagnostics?.generatedImageUrl },
        { label: '去背景', src: result.diagnostics?.cleanedSourceUrl },
        { label: '最终 Atlas', src: pngUrl },
      ].filter((stage) => stage.src);
      const historyItem = {
        id: `reskin-${timestamp}-${Math.random().toString(36).slice(2, 7)}`,
        name: finalSkinName, prompt, timestamp,
        thumbnailUrl: previewPngUrl, stages, stats: result.stats,
        assets: {
          pngUrl,
          previewPngUrl,
          atlasUrl: persistedAssets?.atlas || '',
          spineJsonUrl: persistedAssets?.spineJson || '',
          skelUrl: persistedAssets?.skel || assets.skel,
        },
      };
      await saveHistory(historyItem);
      addLog('done', `✓ 换肤完成：${finalSkinName}`);
    } catch (err) {
      console.error('[reskin] failed:', err);
      addLog('error', `换肤失败：${err?.message || String(err)}`, { error: true });
    } finally {
      setRunning(false);
    }
  }, [prompt, assets, method, segMethod, size, erosion, finalSkinName, generatedImageUrl, requestSnapshot, requestSpineJson, replaceAtlas, onReskinComplete, addLog, workflowId, processingModel, handleGeneratedImage, saveHistory]);

  /** per-slot 局部重绘 */
  const handleInpaintSlot = useCallback(async () => {
    if (!prompt.trim() || !assets || !selectedSlot) return;
    setRunning(true);
    setLogs([]);
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
      addLog('done', `✓ 局部重绘完成：${selectedSlot}`);
    } catch (err) {
      console.error('[inpaint] failed:', err);
      addLog('error', `局部重绘失败：${err?.message || String(err)}`, { error: true });
    } finally {
      setRunning(false);
    }
  }, [prompt, assets, selectedSlot, size, erosion, finalSkinName, requestSpineJson, replaceAtlas, onReskinComplete, addLog, workflowId, processingModel]);

  const handleDeleteHistory = useCallback((id, e) => {
    e?.stopPropagation();
    deletePersistedHistory(id).catch((err) => {
      addLog('error', `删除生成记录失败：${err?.message || err}`, { error: true });
    });
  }, [deletePersistedHistory, addLog]);

  const deleteGeneratedImage = useCallback(() => {
    generatedImageSignatureRef.current = '';
    setGeneratedImageUrl('');
    addLog('workflow', '已删除生成图，下次换肤将重新生成');
  }, [addLog]);

  const stepLabel = (step) => ({
    snapshot: '截图', load: '加载', pipeline: '换肤', parse: '解析', compose: '合成',
    upload: '上传', workflow: '工作流', split: '裁切', segment: '分割', repack: '打包',
    skin: '皮肤', preview: '预览', apply: '应用', inpaint: '局部', done: '完成', error: '错误',
  }[step] || step);

  const generationLocked = !slotMode && !!generatedImageUrl;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <ScrollArea className="min-h-0 flex-1 border-b border-border">
        <div className="space-y-3 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium">AI 换肤</span>
            <Badge variant="secondary" className="max-w-36 truncate">{assets ? spineName : '未加载'}</Badge>
          </div>
        <Tabs
          value={slotMode ? 'slot' : 'global'}
          onValueChange={(value) => {
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
          onChange={(e) => setPrompt(e.target.value)}
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
              onChange={(e) => setSkinName(e.target.value)}
              disabled={running}
              className="h-8 text-xs"
            />
            <FieldSelect label="合成方法" value={method} onValueChange={setMethod} disabled={running || generationLocked} options={[
              ['atlas', 'Atlas + 截图'],
              ['exploded', '爆炸图'],
            ]} />
            <FieldSelect label="分割方法" value={segMethod} onValueChange={setSegMethod} disabled={running} options={[
              ['sam', 'SAM 精确'],
              ['bg_components', '形状交集'],
            ]} />
          </>
        ) : (
          <FieldSelect
            label="重绘部位"
            value={selectedSlot}
            onValueChange={setSelectedSlot}
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

      {logs.length > 0 && (
        <div className="flex h-48 shrink-0 flex-col border-b border-border">
          <div className="px-3 py-2 text-xs font-medium">日志</div>
          <ScrollArea className="min-h-0 flex-1 px-3 pb-2 font-mono text-[10px] leading-relaxed">
            {logs.map((log, i) => {
              const isError = log.data?.error || log.step === 'error';
              const prog = log.data?.done != null && log.data?.total ? ` (${log.data.done}/${log.data.total})` : '';
              return (
                <div key={i} className={isError ? 'text-red-500' : 'text-muted-foreground'}>
                  <span className="text-primary/60">[{stepLabel(log.step)}]</span> {log.msg}{prog}
                </div>
              );
            })}
            <div ref={logEndRef} />
          </ScrollArea>
        </div>
      )}

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
                    <Button type="button" variant="ghost" size="icon-sm" onClick={(e) => handleDeleteHistory(item.id, e)} title="删除" className="h-7 w-7 opacity-0 group-hover:opacity-100">
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
                </div>
              );
            })}
          </ScrollArea>
        </div>
      )}
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
