import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Badge, Button, Input, Label, Loader, Paintbrush, ScrollArea,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Switch, Tabs, TabsList, TabsTrigger, Textarea, Trash2, WandSparkles,
} from '@agent-spaces/ui';
import { runReskin, runInpaintSlot } from '../utils/reskin/reskinPipeline';
import { parseAtlas, safeFilename } from '../utils/reskin/atlasReader';
import { cropRegionRotated, loadImage } from '../utils/reskin/canvasUtils';

/**
 * AI 换肤面板（内嵌在骨骼编辑器对话框）。
 *
 * 支持两种合成方法（atlas/exploded）、两种分割方法（sam/bg_components）、
 * 侵蚀去白边开关、per-slot 局部重绘。
 *
 * @param {object} props
 * @param {object|null} props.assets 当前 spine 三件套 {skel, atlas, png, name}
 * @param {(pngDataUrl:string, name:string) => Promise<void>|void} props.replaceAtlas 热加载 atlas
 * @param {Promise<string|null>} props.requestSnapshot 请求 iframe 截图
 * @param {Promise<object|null>} props.requestSpineJson 从当前编辑器实例导出 spine JSON（支持 .skel）
 * @param {(assets:{skel,atlas,png,spineJson}) => void} [props.onReskinComplete] 换肤完成
 */
export default function ReskinPanel({
  assets, workflowId, processingModel, replaceAtlas, requestSnapshot, requestSpineJson, onReskinComplete,
}) {
  const [prompt, setPrompt] = useState('');
  const [skinName, setSkinName] = useState('');
  const [method, setMethod] = useState('atlas');         // 'atlas' | 'exploded'
  const [segMethod, setSegMethod] = useState('sam');     // 'sam' | 'bg_components'
  const [erode, setErode] = useState(false);             // 侵蚀去白边
  const [erodePx, setErodePx] = useState(2);             // 侵蚀半径
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState([]);
  const [history, setHistory] = useState([]);
  const [activeSkin, setActiveSkin] = useState(null);
  // per-slot 重绘
  const [slotMode, setSlotMode] = useState(false);       // 是否局部重绘模式
  const [selectedSlot, setSelectedSlot] = useState('');
  const [slots, setSlots] = useState([]);                // 可重绘的 slot 列表
  const logEndRef = useRef(null);

  const spineName = assets?.name || 'spine';

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`spine-reskin-history:${spineName}`);
      setHistory(raw ? JSON.parse(raw) : []);
    } catch { setHistory([]); }
  }, [spineName]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [logs]);

  const addLog = useCallback((step, msg, data) => {
    setLogs((prev) => [...prev, { step, msg, data, ts: Date.now() }]);
  }, []);

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
      if (slotNames.length && !selectedSlot) setSelectedSlot(slotNames[0]);
    } catch { /* ignore */ }
  }, [assets, requestSpineJson, selectedSlot]);

  const applyHistory = useCallback(async (item) => {
    if (!item?.assets?.pngDataUrl) return;
    addLog('apply', `应用历史皮肤：${item.name}`);
    await replaceAtlas?.(item.assets.pngDataUrl, item.name);
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

      addLog('pipeline', `开始 AI 换肤（${method} / ${segMethod}）…`);
      const result = await runReskin({
        snapshot, atlasSheetUrl: assets.png, atlasText, spineJson,
        skinName: finalSkinName, prompt,
      }, {
        method, segMethod, erode, erodePx,
        workflowId,
        model: processingModel,
        onLog: (step, msg, data) => addLog(step, msg, data),
      });

      addLog('preview', '应用新皮肤到画布预览…');
      const pngDataUrl = result.newAtlasCanvas.toDataURL('image/png');
      await replaceAtlas?.(pngDataUrl, finalSkinName);
      setActiveSkin(finalSkinName);

      const historyItem = {
        name: finalSkinName, prompt, timestamp: Date.now(),
        thumbnailUrl: pngDataUrl, stats: result.stats,
        assets: { pngDataUrl, atlasText: result.newAtlasText, spineJson: result.newSpineJson, skelUrl: assets.skel },
      };
      setHistory((prev) => {
        const next = [historyItem, ...prev.filter((h) => h.name !== finalSkinName)].slice(0, 20);
        try { localStorage.setItem(`spine-reskin-history:${spineName}`, JSON.stringify(next)); } catch { /* 配额满 */ }
        return next;
      });
      onReskinComplete?.({ skel: assets.skel, atlas: historyItem.assets.atlasText, png: pngDataUrl, spineJson: historyItem.assets.spineJson });
      addLog('done', `✓ 换肤完成：${finalSkinName}`);
    } catch (err) {
      console.error('[reskin] failed:', err);
      addLog('error', `换肤失败：${err?.message || String(err)}`, { error: true });
    } finally {
      setRunning(false);
    }
  }, [prompt, assets, method, segMethod, erode, erodePx, finalSkinName, requestSnapshot, requestSpineJson, replaceAtlas, onReskinComplete, addLog, spineName, workflowId, processingModel]);

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
        erode, erodePx,
        workflowId,
        model: processingModel,
        onLog: (step, msg, data) => addLog(step, msg, data),
      });

      const pngDataUrl = result.newAtlasCanvas.toDataURL('image/png');
      await replaceAtlas?.(pngDataUrl, finalSkinName);
      setActiveSkin(finalSkinName);
      onReskinComplete?.({ skel: assets.skel, atlas: result.newAtlasText, png: pngDataUrl, spineJson: result.newSpineJson });
      addLog('done', `✓ 局部重绘完成：${selectedSlot}`);
    } catch (err) {
      console.error('[inpaint] failed:', err);
      addLog('error', `局部重绘失败：${err?.message || String(err)}`, { error: true });
    } finally {
      setRunning(false);
    }
  }, [prompt, assets, selectedSlot, erode, erodePx, finalSkinName, requestSpineJson, replaceAtlas, onReskinComplete, addLog, workflowId, processingModel]);

  const deleteHistory = useCallback((name, e) => {
    e?.stopPropagation();
    setHistory((prev) => {
      const next = prev.filter((h) => h.name !== name);
      try { localStorage.setItem(`spine-reskin-history:${spineName}`, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [spineName]);

  const stepLabel = (step) => ({
    snapshot: '截图', load: '加载', pipeline: '换肤', parse: '解析', compose: '合成',
    upload: '上传', workflow: '工作流', split: '裁切', segment: '分割', repack: '打包',
    skin: '皮肤', preview: '预览', apply: '应用', inpaint: '局部', done: '完成', error: '错误',
  }[step] || step);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="space-y-3 border-b border-border p-3">
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
          disabled={running}
          className="resize-none text-xs"
        />

        {!slotMode ? (
          <>
            <Input
              placeholder={slug(prompt) || '皮肤名'}
              value={skinName}
              onChange={(e) => setSkinName(e.target.value)}
              disabled={running}
              className="h-8 text-xs"
            />
            <FieldSelect label="合成方法" value={method} onValueChange={setMethod} disabled={running} options={[
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

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Switch checked={erode} onCheckedChange={setErode} disabled={running} />
            <Label className="text-xs">去白边</Label>
          </div>
          {erode && (
            <Input type="number" min={1} max={20} value={erodePx} onChange={(e) => setErodePx(Math.max(1, Number(e.target.value)))} disabled={running} className="h-8 w-20 text-xs" />
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

      {logs.length > 0 && (
        <div className="flex min-h-0 flex-1 flex-col border-b border-border">
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
          <div className="px-3 py-2 text-xs font-medium">皮肤历史（{history.length}）</div>
          <ScrollArea className="min-h-0 flex-1 px-2 pb-2">
            {history.map((item) => (
              <div
                key={item.name + item.timestamp}
                onClick={() => applyHistory(item)}
                className={`group mb-1 flex cursor-pointer items-center gap-2 rounded border px-2 py-1 transition hover:border-primary ${activeSkin === item.name ? 'border-primary bg-primary/5' : 'border-border'}`}
              >
                <img src={item.thumbnailUrl} alt={item.name} className="h-8 w-8 flex-shrink-0 rounded border border-border object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11px] font-medium">{item.name}</div>
                  <div className="truncate text-[9px] text-muted-foreground">{item.prompt}</div>
                </div>
                <Button type="button" variant="ghost" size="icon-sm" onClick={(e) => deleteHistory(item.name, e)} title="删除" className="h-7 w-7 opacity-0 group-hover:opacity-100">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
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
