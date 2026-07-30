import { useCallback, useEffect, useRef, useState } from 'react';
import { FileUpload, Loader, Pause, Play } from '@agent-spaces/ui';
import NodeShell from './NodeShell';
import { NODE_TYPES } from '../../utils/constants';
import urlToDataUrl from '../../utils/spine-url';
import { loadSpineRuntime } from '../../spine/runtime.js';
import { loadSpine, getAnimations, getSkins } from '../../spine/loaders/SpineLoader.js';
import SpinePreviewApp from '../../spine/core/SpinePreviewApp.js';

/**
 * Spine 展示节点（只读预览）：
 * - 上传 .skel/.atlas/.png 三件套（持久化 http URL）
 * - 节点内直接用 PIXI 渲染（不开 Dialog）
 * - 动画播放/暂停/切换 + 皮肤切换 + 播放速度
 * - 输出 data.spineAssets 供下游 spineEditor 节点消费
 *
 * 与 SpineEditorNode 的区别：展示节点只预览不编辑，渲染用精简的 SpinePreviewApp。
 * NodeShell 已内置 useViewportActivation 视口门控，滚出视口时 children 不渲染。
 */
export default function SpineDisplayNode({ id, data, selected }) {
  const onUpdate = data?.onUpdate;
  const appRef = useRef(null); // SpinePreviewApp 实例
  const loadingRef = useRef(false); // 防止并发加载
  const containerRef = useRef(null); // PIXI canvas 容器 DOM
  // NodeShell 视口门控会卸载/重挂 children，容器 DOM 会变化。
  // 用挂载计数器（而非把 DOM 存 state）触发 effect 重建 PIXI app，
  // 避免 DOM 存 state 在 React 19 classic runtime 下触发 static flag 错误。
  const [mountTick, setMountTick] = useState(0);
  const containerRefCb = useCallback((el) => {
    containerRef.current = el;
    if (el) setMountTick((t) => t + 1);
  }, []);
  const [appReady, setAppReady] = useState(false);

  const [animations, setAnimations] = useState([]);
  const [skins, setSkins] = useState([]);

  // 当前资源（优先自身上传，其次上游注入）
  const spineAssets = data?.spineAssets || null;
  const params = data?.params || {};
  const source = data?.source; // 'upload' | 'upstream'

  // onUpdate / params 用 ref 持有最新引用，避免它们作为 effect/callback 依赖
  // 导致 PIXI app 反复销毁重建（makeOnUpdate 每次渲染返回新函数）
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const paramsRef = useRef(params);
  paramsRef.current = params;

  // ---- 三件套上传（复用 SpineEditorNode 的解析逻辑）----
  const handleFilesChange = useCallback(async (files) => {
    const AS = window.AgentSpaces;
    if (!AS?.uploadFile) {
      console.warn('[SpineDisplay] AgentSpaces.uploadFile 不可用');
      return;
    }
    const list = files || [];
    console.debug('[SpineDisplay] handleFilesChange 收到', list.length, '个文件',
      list.map((it) => ({ name: it?.file?.name, isFile: it?.file instanceof File, hasUrl: !!(it?.file?.uploadedUrl || it?.file?.url) })));
    if (!list.length) {
      onUpdateRef.current?.({ spineAssets: null, source: undefined, error: undefined });
      return;
    }
    onUpdateRef.current?.({ uploading: true, uploadError: undefined });
    try {
      const assets = { skel: '', atlas: '', png: '', name: '' };
      let baseName = '';
      for (const it of list) {
        const f = it?.file;
        if (!f) continue;
        const existing = f.uploadedUrl || f.uploadedHttpPath || f.url || f.httpPath;
        let url = existing;
        if (!url && f instanceof File) {
          console.debug('[SpineDisplay] 上传', f.name, f.type, f.size);
          const uploaded = await AS.uploadFile(f);
          console.debug('[SpineDisplay] 上传返回', f.name, uploaded);
          url = uploaded?.url || uploaded?.httpPath;
        }
        if (!url) { console.debug('[SpineDisplay] 跳过（无 url）', f.name); continue; }
        const lower = (f.name || '').toLowerCase();
        if (lower.endsWith('.skel') || lower.endsWith('.json')) assets.skel = url;
        else if (lower.endsWith('.atlas')) assets.atlas = url;
        else if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.webp')) assets.png = url;
        if (!baseName) baseName = (f.name || 'spine').replace(/\.[^.]+$/, '');
      }
      assets.name = baseName;
      const complete = assets.skel && assets.atlas && assets.png;
      console.debug('[SpineDisplay] 组装完成', assets, 'complete=', complete);
      onUpdateRef.current?.({
        uploading: false,
        spineAssets: complete ? assets : null,
        source: complete ? 'upload' : undefined,
        uploadError: complete ? undefined : '缺少资源：需同时上传 .skel + .atlas + .png',
        error: undefined,
      });
    } catch (err) {
      console.error('[SpineDisplay] upload failed:', err);
      onUpdateRef.current?.({ uploading: false, uploadError: err?.message || String(err) });
    }
  }, []);

  // ---- PIXI 初始化（容器挂载时建 app，卸载时销毁）----
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let destroyed = false;
    (async () => {
      try {
        console.debug('[SpineDisplay] init PIXI start (tick=%d)', mountTick);
        await loadSpineRuntime();
        if (destroyed) return;
        const app = new SpinePreviewApp(container);
        await app.init();
        if (destroyed) { app.destroy(); return; }
        appRef.current = app;
        setAppReady(true);
        console.debug('[SpineDisplay] init PIXI done');
      } catch (err) {
        console.error('[SpineDisplay] PIXI init failed:', err);
        if (!destroyed) onUpdateRef.current?.({ error: `渲染初始化失败：${err?.message || err}` });
      }
    })();
    return () => {
      destroyed = true;
      setAppReady(false);
      if (appRef.current) { appRef.current.destroy(); appRef.current = null; }
    };
  }, [mountTick]);

  // ---- 资源加载（app 就绪后或 spineAssets 变化时加载）----
  useEffect(() => {
    if (!appReady) {
      console.debug('[SpineDisplay] load skipped: app not ready');
      return;
    }
    const app = appRef.current;
    if (!app || !spineAssets?.skel || !spineAssets?.atlas || !spineAssets?.png) {
      console.debug('[SpineDisplay] load skipped: app/spineAssets missing', { hasApp: !!app, hasAssets: !!spineAssets?.skel });
      return;
    }
    if (loadingRef.current) {
      console.debug('[SpineDisplay] load skipped: already loading');
      return;
    }
    let cancelled = false;
    loadingRef.current = true;
    onUpdateRef.current?.({ status: 'running', error: undefined });
    console.debug('[SpineDisplay] load start', { name: spineAssets.name });
    (async () => {
      try {
        const [skelDataUrl, atlasDataUrl, pngDataUrl] = await Promise.all([
          urlToDataUrl(spineAssets.skel),
          urlToDataUrl(spineAssets.atlas),
          urlToDataUrl(spineAssets.png),
        ]);
        if (cancelled) { console.debug('[SpineDisplay] load cancelled (after urlToDataUrl)'); return; }
        const loaded = await loadSpine({
          skel: skelDataUrl, atlas: atlasDataUrl, png: pngDataUrl,
          name: spineAssets.name || 'spine',
        });
        if (cancelled) { console.debug('[SpineDisplay] load cancelled (after loadSpine)'); return; }
        if (appRef.current !== app) { console.debug('[SpineDisplay] load aborted: app changed'); return; }
        app.setSpine(loaded);
        const anims = getAnimations(loaded);
        const sks = getSkins(loaded);
        const firstSkin = sks[0] || '';
        if (firstSkin) app.setSkin(firstSkin);
        app.setPlaying(paramsRef.current.playing !== false);
        app.setPlaybackSpeed(paramsRef.current.playbackSpeed || 1);
        setAnimations(anims);
        setSkins(sks);
        const nextParams = {
          ...paramsRef.current,
          animation: app.currentAnimation || paramsRef.current.animation || '',
          skin: firstSkin || paramsRef.current.skin || '',
        };
        onUpdateRef.current?.({ status: 'done', params: nextParams });
        console.debug('[SpineDisplay] load done', { anims: anims.length, skins: sks.length, curAnim: app.currentAnimation });
      } catch (err) {
        console.error('[SpineDisplay] load failed:', err);
        if (!cancelled) onUpdateRef.current?.({ status: 'idle', error: `加载失败：${err?.message || err}` });
      } finally {
        if (!cancelled) loadingRef.current = false;
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appReady, spineAssets?.skel, spineAssets?.atlas, spineAssets?.png]);

  // ---- 控制操作（不重载资源，只调 app 方法，用 ref 取最新 params）----
  const handleAnimationChange = useCallback((name) => {
    appRef.current?.setAnimation(name);
    onUpdateRef.current?.({ params: { ...paramsRef.current, animation: name } });
  }, []);

  const handleSkinChange = useCallback((name) => {
    appRef.current?.setSkin(name);
    onUpdateRef.current?.({ params: { ...paramsRef.current, skin: name } });
  }, []);

  const handleTogglePlay = useCallback(() => {
    const cur = paramsRef.current.playing !== false;
    console.debug('[SpineDisplay] togglePlay', { curPlaying: cur, hasApp: !!appRef.current, hasSpine: !!appRef.current?.spine });
    appRef.current?.setPlaying(!cur);
    onUpdateRef.current?.({ params: { ...paramsRef.current, playing: !cur } });
  }, []);

  const handleSpeedChange = useCallback((e) => {
    const speed = Number(e.target.value);
    appRef.current?.setPlaybackSpeed(speed);
    onUpdateRef.current?.({ params: { ...paramsRef.current, playbackSpeed: speed } });
  }, []);

  // FileUpload value：把已有资源 URL 还原成展示格式
  const fileUploadValue = (() => {
    if (!spineAssets) return [];
    const out = [];
    const n = spineAssets.name || 'spine';
    if (spineAssets.skel) out.push(makeFUItem(spineAssets.skel, `${n}.skel`));
    if (spineAssets.atlas) out.push(makeFUItem(spineAssets.atlas, `${n}.atlas`));
    if (spineAssets.png) out.push(makeFUItem(spineAssets.png, `${n}.png`));
    return out;
  })();

  const hasAssets = !!(spineAssets?.skel && spineAssets?.atlas && spineAssets?.png);
  const isUpstream = source === 'upstream';

  return (
    <NodeShell id={id} nodeType={NODE_TYPES.spineDisplay} data={data} selected={selected} targetHandle sourceHandle>
      <div className="flex flex-col gap-2">
        {/* PIXI canvas 容器（必须保持空 div——React 不管理其内部 DOM，
            否则重渲染时 PIXI appendChild 进去的 canvas 会被 reconciliation 清掉）。
            占位提示/加载动画用兄弟元素绝对定位叠在上面，不进入容器内部。
            高度用内联 style 而非 Tailwind 任意值 class：嵌套 flex-col 布局下
            h-[180px] 可能被压缩为 0，内联 style 优先级更高更可靠。 */}
        <div
          className="nodrag nopan nowheel relative w-full overflow-hidden rounded-md border border-border bg-[#eef0f3]"
          style={{ height: 180 }}
        >
          <div ref={containerRefCb} className="absolute inset-0" />
          {!hasAssets && !data?.uploading && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[11px] text-muted-foreground">
              上传三件套后预览
            </div>
          )}
          {data?.uploading && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-1.5 text-[11px] text-primary">
              <Loader className="h-3.5 w-3.5 animate-spin" /> 上传中…
            </div>
          )}
        </div>

        {/* 控制条（仅加载完成且选中时显示） */}
        {hasAssets && selected && (
          <div className="nodrag nopan nowheel flex flex-col gap-1.5 rounded-md border border-border bg-card/50 p-1.5">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleTogglePlay}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-border text-foreground hover:bg-accent"
                title={params.playing !== false ? '暂停' : '播放'}
              >
                {params.playing !== false ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              </button>
              <select
                value={params.animation || ''}
                onChange={(e) => handleAnimationChange(e.target.value)}
                className="min-w-0 flex-1 rounded border border-border bg-background px-1 py-0.5 text-[11px]"
              >
                {animations.length === 0 && <option value="">（无动画）</option>}
                {animations.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            {skins.length > 1 && (
              <select
                value={params.skin || ''}
                onChange={(e) => handleSkinChange(e.target.value)}
                className="w-full rounded border border-border bg-background px-1 py-0.5 text-[11px]"
              >
                {skins.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground">速度</span>
              <input
                type="range"
                min="0.25"
                max="3"
                step="0.25"
                value={params.playbackSpeed || 1}
                onChange={handleSpeedChange}
                className="h-1 flex-1"
              />
              <span className="w-7 text-right text-[10px] tabular-nums text-muted-foreground">
                {(params.playbackSpeed || 1).toFixed(2)}
              </span>
            </div>
          </div>
        )}

        {/* 资源信息 */}
        <div className="text-[11px] text-muted-foreground">
          {hasAssets
            ? `${spineAssets.name || 'spine'}${isUpstream ? '（上游）' : ''}`
            : '上传 .skel + .atlas + .png'}
        </div>

        {/* 上传区（上游注入时不显示上传，避免覆盖；用户可删上游连线后重新上传） */}
        {!isUpstream && (
          <FileUpload
            value={fileUploadValue}
            onChange={handleFilesChange}
            maxFiles={3}
            placeholder="上传 Spine 三件套（.skel + .atlas + .png）"
          />
        )}

        {data?.uploadError && (
          <p className="text-[10px] text-red-500">{data.uploadError}</p>
        )}
        {data?.error && (
          <p className="rounded-md bg-red-500/10 px-2 py-1 text-xs text-red-500">{data.error}</p>
        )}
      </div>
    </NodeShell>
  );
}

/** 把已有 URL 还原成 FileUpload 展示项 */
function makeFUItem(url, name) {
  return {
    id: `up-${name}-${url.slice(-8)}`,
    file: { name, size: 0, type: 'application/octet-stream', url, httpPath: url },
    preview: url,
  };
}
