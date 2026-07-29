import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Loader } from '@agent-spaces/ui';
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
 * @param {(type:string, payload?:object) => boolean} props.postToIframe 向 iframe 发消息
 * @param {Promise<string|null>} props.requestSnapshot 请求 iframe 截图
 * @param {Promise<object|null>} props.requestSpineJson 请求 iframe 导出 spine JSON（支持 .skel）
 * @param {(assets:{skel,atlas,png,spineJson}) => void} [props.onReskinComplete] 换肤完成
 */
export default function ReskinPanel({ assets, postToIframe, requestSnapshot, requestSpineJson, onReskinComplete }) {
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
    postToIframe?.('spine:replace-atlas', { pngDataUrl: item.assets.pngDataUrl, name: item.name });
    setActiveSkin(item.name);
  }, [postToIframe, addLog]);

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
        nanoModel: 'gemini-2.5-flash-image-preview',
        onLog: (step, msg, data) => addLog(step, msg, data),
      });

      addLog('preview', '应用新皮肤到画布预览…');
      const pngDataUrl = result.newAtlasCanvas.toDataURL('image/png');
      postToIframe?.('spine:replace-atlas', { pngDataUrl, name: finalSkinName });
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
  }, [prompt, assets, method, segMethod, erode, erodePx, finalSkinName, requestSnapshot, requestSpineJson, postToIframe, onReskinComplete, addLog, spineName]);

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
        nanoModel: 'gemini-2.5-flash-image-preview',
        onLog: (step, msg, data) => addLog(step, msg, data),
      });

      const pngDataUrl = result.newAtlasCanvas.toDataURL('image/png');
      postToIframe?.('spine:replace-atlas', { pngDataUrl, name: finalSkinName });
      setActiveSkin(finalSkinName);
      onReskinComplete?.({ skel: assets.skel, atlas: result.newAtlasText, png: pngDataUrl, spineJson: result.newSpineJson });
      addLog('done', `✓ 局部重绘完成：${selectedSlot}`);
    } catch (err) {
      console.error('[inpaint] failed:', err);
      addLog('error', `局部重绘失败：${err?.message || String(err)}`, { error: true });
    } finally {
      setRunning(false);
    }
  }, [prompt, assets, selectedSlot, erode, erodePx, finalSkinName, requestSpineJson, postToIframe, onReskinComplete, addLog]);

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
    upload: '上传', gemini: 'Gemini', split: '裁切', segment: '分割', repack: '打包',
    skin: '皮肤', preview: '预览', apply: '应用', inpaint: '局部', done: '完成', error: '错误',
  }[step] || step);

  return (
    <div className="flex h-full flex-col gap-2 overflow-hidden">
      <div className="border-b border-border px-3 py-2">
        <h3 className="text-xs font-semibold">🎨 AI 换肤</h3>
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          {assets ? `当前：${spineName}` : '需先加载 spine 资源'}
        </p>
      </div>

      <div className="flex flex-col gap-2 border-b border-border px-3 py-2">
        {/* 模式切换：全局 / 局部 */}
        <div className="flex gap-1 text-[10px]">
          <button
            type="button"
            onClick={() => setSlotMode(false)}
            disabled={running}
            className={`flex-1 rounded px-2 py-1 ${!slotMode ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground'}`}
          >全局换肤</button>
          <button
            type="button"
            onClick={() => { setSlotMode(true); if (assets) loadSlots(); }}
            disabled={running || !assets}
            className={`flex-1 rounded px-2 py-1 ${slotMode ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground'}`}
          >局部重绘</button>
        </div>

        <textarea
          rows={2}
          placeholder={slotMode ? '描述该部位新样式' : '描述新皮肤，如 "黑精灵，黑翅膀，金甲"'}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={running}
          className="w-full resize-none rounded border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
        />

        {!slotMode ? (
          <>
            <input
              type="text"
              placeholder={slug(prompt) || '皮肤名'}
              value={skinName}
              onChange={(e) => setSkinName(e.target.value)}
              disabled={running}
              className="w-full rounded border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
            />
            {/* 合成方法 */}
            <label className="flex items-center justify-between gap-2 text-[10px]">
              <span className="text-muted-foreground">合成方法</span>
              <select value={method} onChange={(e) => setMethod(e.target.value)} disabled={running} className="rounded border border-border bg-background px-1 py-0.5 text-[10px]">
                <option value="atlas">Atlas + 截图</option>
                <option value="exploded">爆炸图</option>
              </select>
            </label>
            {/* 分割方法 */}
            <label className="flex items-center justify-between gap-2 text-[10px]">
              <span className="text-muted-foreground">分割方法</span>
              <select value={segMethod} onChange={(e) => setSegMethod(e.target.value)} disabled={running} className="rounded border border-border bg-background px-1 py-0.5 text-[10px]">
                <option value="sam">SAM 精确（慢）</option>
                <option value="bg_components">形状交集（快）</option>
              </select>
            </label>
          </>
        ) : (
          <label className="flex items-center justify-between gap-2 text-[10px]">
            <span className="text-muted-foreground">重绘部位</span>
            <select
              value={selectedSlot}
              onChange={(e) => { setSelectedSlot(e.target.value); if (!slots.length) loadSlots(); }}
              disabled={running}
              className="max-w-[140px] truncate rounded border border-border bg-background px-1 py-0.5 text-[10px]"
            >
              {slots.length ? slots.map((s) => <option key={s} value={s}>{s}</option>)
                : <option value="">点击加载部位…</option>}
            </select>
          </label>
        )}

        {/* 侵蚀去白边 */}
        <div className="flex items-center gap-2 text-[10px]">
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={erode} onChange={(e) => setErode(e.target.checked)} disabled={running} />
            <span className="text-muted-foreground">去白边</span>
          </label>
          {erode && (
            <label className="flex items-center gap-1">
              <input type="number" min={1} max={20} value={erodePx} onChange={(e) => setErodePx(Math.max(1, Number(e.target.value)))} disabled={running} className="w-12 rounded border border-border bg-background px-1 py-0.5 text-[10px]" />
              <span className="text-muted-foreground">px</span>
            </label>
          )}
        </div>

        <Button
          size="sm"
          className="h-8 gap-1 text-xs"
          onClick={slotMode ? handleInpaintSlot : handleRun}
          disabled={running || !prompt.trim() || !assets || (slotMode && !selectedSlot)}
        >
          {running ? <Loader className="h-3.5 w-3.5" /> : slotMode ? '✏️' : '🎨'}
          {running ? '处理中…' : slotMode ? '局部重绘' : '开始换肤'}
        </Button>
      </div>

      {/* 日志区 */}
      {logs.length > 0 && (
        <div className="flex min-h-0 flex-1 flex-col border-b border-border">
          <div className="px-3 py-1 text-[10px] font-medium text-muted-foreground">日志</div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-2 font-mono text-[10px] leading-relaxed">
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
          </div>
        </div>
      )}

      {/* 历史区 */}
      {history.length > 0 && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="px-3 py-1 text-[10px] font-medium text-muted-foreground">皮肤历史（{history.length}）</div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
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
                <button onClick={(e) => deleteHistory(item.name, e)} className="flex-shrink-0 text-[10px] text-muted-foreground opacity-0 transition hover:text-red-500 group-hover:opacity-100" title="删除">✕</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
