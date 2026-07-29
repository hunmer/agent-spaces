import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Loader } from '@agent-spaces/ui';
import { runReskin } from '../utils/reskin/reskinPipeline';

/**
 * AI 换肤面板（内嵌在骨骼编辑器对话框）。
 *
 * 流程：
 *  1. 从父对话框请求 iframe 的 canvas 截图（snapshot）
 *  2. 跑 reskinPipeline：合成 composite → nano-banana 重绘 → rembg SAM 分割 → repack → skin JSON
 *  3. 把新 atlas PNG 经 postMessage 发回 iframe 做热加载预览
 *  4. 成功后存入皮肤历史（localStorage）
 *
 * @param {object} props
 * @param {object|null} props.assets 当前 spine 三件套 {skel, atlas, png, name}
 * @param {(type:string, payload?:object) => boolean} props.postToIframe 向 iframe 发消息
 * @param {Promise<string|null>} props.requestSnapshot 请求 iframe 截图，返回 dataUrl
 * @param {(assets:{skel,atlas,png,spineJson}) => void} [props.onReskinComplete] 换肤完成（含三件套）
 */
export default function ReskinPanel({ assets, postToIframe, requestSnapshot, onReskinComplete }) {
  const [prompt, setPrompt] = useState('');
  const [skinName, setSkinName] = useState('');
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState([]); // {step, msg, data, ts}
  const [history, setHistory] = useState([]); // 当前 spine 的历史
  const [activeSkin, setActiveSkin] = useState(null); // 当前预览的皮肤名
  const logEndRef = useRef(null);

  const spineName = assets?.name || 'spine';

  // 加载历史（按 spine 名分组）
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`spine-reskin-history:${spineName}`);
      setHistory(raw ? JSON.parse(raw) : []);
    } catch { setHistory([]); }
  }, [spineName]);

  // 日志自动滚动到底
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [logs]);

  const addLog = useCallback((step, msg, data) => {
    setLogs((prev) => [...prev, { step, msg, data, ts: Date.now() }]);
  }, []);

  const slug = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32);
  const finalSkinName = skinName.trim() || slug(prompt) || 'reskin-1';

  /** 应用一个历史皮肤（热加载预览） */
  const applyHistory = useCallback(async (item) => {
    if (!item?.assets?.pngDataUrl) return;
    addLog('apply', `应用历史皮肤：${item.name}`);
    const ok = postToIframe?.('spine:replace-atlas', {
      pngDataUrl: item.assets.pngDataUrl,
      name: item.name,
    });
    if (!ok) addLog('apply', '发送到 iframe 失败', { error: true });
    setActiveSkin(item.name);
  }, [postToIframe, addLog]);

  /** 执行换肤 */
  const handleRun = useCallback(async () => {
    if (!prompt.trim() || !assets) return;
    setRunning(true);
    setLogs([]);
    setActiveSkin(null);
    try {
      // 1. 请求 snapshot
      addLog('snapshot', '请求画布截图…');
      const snapshot = await requestSnapshot?.();
      if (!snapshot) throw new Error('无法获取画布截图');

      // 2. 加载原 atlas 文本和 spine JSON
      addLog('load', '加载原 atlas 与 spine JSON…');
      const AS = window.AgentSpaces;
      const proxy = (u) => (AS?.proxyImageUrl ? AS.proxyImageUrl(u) : u);
      const [atlasText, spineJson] = await Promise.all([
        fetch(proxy(assets.atlas)).then((r) => r.text()),
        fetch(proxy(assets.skel)).then((r) => {
          // .skel 是二进制，.json 是文本；换肤只用 spine JSON 的 skins 段
          // 若是 .skel，需要前端解析，但 MVP 假设有 .json 或从 iframe 拿
          const ct = r.headers.get('content-type') || '';
          return ct.includes('json') || assets.skel.endsWith('.json') ? r.json() : null;
        }).catch(() => null),
      ]);
      if (!spineJson) {
        addLog('load', '当前资源是 .skel（二进制），换肤需要 .json 格式的 spine 骨架。可先用 iframe 导出姿势 JSON 获取。', { error: true });
        throw new Error('需要 .json 格式的 spine 骨架（.skel 不支持前端换肤）');
      }

      // 3. 跑 pipeline
      addLog('pipeline', '开始 AI 换肤…');
      const result = await runReskin({
        snapshot,
        atlasSheetUrl: assets.png,
        atlasText,
        spineJson,
        skinName: finalSkinName,
        prompt,
      }, {
        onLog: (step, msg, data) => addLog(step, msg, data),
        nanoModel: 'gemini-2.5-flash-image-preview',
        erode: false,
      });

      // 4. 新 atlas PNG → dataUrl，热加载预览
      addLog('preview', '应用新皮肤到画布预览…');
      const pngDataUrl = result.newAtlasCanvas.toDataURL('image/png');
      postToIframe?.('spine:replace-atlas', { pngDataUrl, name: finalSkinName });
      setActiveSkin(finalSkinName);

      // 5. 存历史
      const historyItem = {
        name: finalSkinName,
        prompt,
        timestamp: Date.now(),
        thumbnailUrl: pngDataUrl,
        stats: result.stats,
        assets: {
          pngDataUrl,
          atlasText: result.newAtlasText,
          spineJson: result.newSpineJson,
          skelUrl: assets.skel, // 原 .skel/.json 不变
        },
      };
      setHistory((prev) => {
        const next = [historyItem, ...prev.filter((h) => h.name !== finalSkinName)].slice(0, 20);
        try { localStorage.setItem(`spine-reskin-history:${spineName}`, JSON.stringify(next)); } catch { /* 配额满忽略 */ }
        return next;
      });

      // 6. 通知父对话框（含新三件套，供导出）
      onReskinComplete?.({
        skel: assets.skel,
        atlas: historyItem.assets.atlasText,
        png: historyItem.assets.pngDataUrl,
        spineJson: historyItem.assets.spineJson,
      });

      addLog('done', `✓ 换肤完成：${finalSkinName}`);
    } catch (err) {
      console.error('[reskin] failed:', err);
      addLog('error', `换肤失败：${err?.message || String(err)}`, { error: true });
    } finally {
      setRunning(false);
    }
  }, [prompt, assets, finalSkinName, requestSnapshot, postToIframe, onReskinComplete, addLog, spineName]);

  /** 删除历史项 */
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
    skin: '皮肤', preview: '预览', apply: '应用', done: '完成', error: '错误',
  }[step] || step);

  return (
    <div className="flex h-full flex-col gap-2 overflow-hidden">
      <div className="border-b border-border px-3 py-2">
        <h3 className="text-xs font-semibold">🎨 AI 换肤</h3>
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          {assets ? `当前角色：${spineName}` : '需先加载 spine 资源'}
        </p>
      </div>

      {/* 输入区 */}
      <div className="flex flex-col gap-2 border-b border-border px-3 py-2">
        <textarea
          rows={2}
          placeholder='描述新皮肤，如 "黑精灵，黑翅膀，金甲"'
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={running}
          className="w-full resize-none rounded border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
        />
        <input
          type="text"
          placeholder={slug(prompt) || '皮肤名'}
          value={skinName}
          onChange={(e) => setSkinName(e.target.value)}
          disabled={running}
          className="w-full rounded border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
        />
        <Button
          size="sm"
          className="h-8 gap-1 text-xs"
          onClick={handleRun}
          disabled={running || !prompt.trim() || !assets}
        >
          {running ? <Loader className="h-3.5 w-3.5" /> : '🎨'}
          {running ? '换肤中…' : '开始换肤'}
        </Button>
      </div>

      {/* 日志区 */}
      {logs.length > 0 && (
        <div className="flex min-h-0 flex-1 flex-col border-b border-border">
          <div className="px-3 py-1 text-[10px] font-medium text-muted-foreground">日志</div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-2 font-mono text-[10px] leading-relaxed">
            {logs.map((log, i) => {
              const isError = log.data?.error || log.step === 'error';
              const prog = log.data?.done != null && log.data?.total
                ? ` (${log.data.done}/${log.data.total})` : '';
              return (
                <div key={i} className={isError ? 'text-red-500' : 'text-muted-foreground'}>
                  <span className="text-primary/60">[{stepLabel(log.step)}]</span>{' '}
                  {log.msg}{prog}
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
          <div className="px-3 py-1 text-[10px] font-medium text-muted-foreground">
            皮肤历史（{history.length}）
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {history.map((item) => (
              <div
                key={item.name + item.timestamp}
                onClick={() => applyHistory(item)}
                className={`group mb-1 flex cursor-pointer items-center gap-2 rounded border px-2 py-1 transition hover:border-primary ${
                  activeSkin === item.name ? 'border-primary bg-primary/5' : 'border-border'
                }`}
              >
                <img
                  src={item.thumbnailUrl}
                  alt={item.name}
                  className="h-8 w-8 flex-shrink-0 rounded border border-border object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11px] font-medium">{item.name}</div>
                  <div className="truncate text-[9px] text-muted-foreground">{item.prompt}</div>
                </div>
                <button
                  onClick={(e) => deleteHistory(item.name, e)}
                  className="flex-shrink-0 text-[10px] text-muted-foreground opacity-0 transition hover:text-red-500 group-hover:opacity-100"
                  title="删除"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
