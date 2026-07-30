import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader, Pause, Play } from '@agent-spaces/ui';
import urlToDataUrl from '../../utils/spine-url';
import { loadSpineRuntime } from '../../spine/runtime.js';
import { loadSpine, getAnimations, getSkins } from '../../spine/loaders/SpineLoader.js';
import SpinePreviewApp from '../../spine/core/SpinePreviewApp.js';

/**
 * Spine 预览查看器（NodeShell 输出预览模式专用）。
 *
 * 与 SpineDisplayNode 的区别：无 NodeShell 外壳、无 FileUpload、无上传逻辑，
 * 只负责把 spineAssets 用 PIXI 渲染出来 + 基础播放控制。
 * 由 NodeShell 在 outputPreviewEnabled && spineDisplay 时渲染。
 *
 * @param {object} props
 * @param {object} props.spineAssets { skel, atlas, png, name }
 * @param {object} [props.params] { animation, skin, playbackSpeed, playing }
 * @param {Function} [props.onHeightChange] 预览高度回调（适配 NodeShell 预览高度上报）
 */
export default function SpinePreviewViewer({ spineAssets, params = {}, onHeightChange }) {
  const appRef = useRef(null);
  const containerRef = useRef(null);
  const loadingRef = useRef(false);
  const [mountTick, setMountTick] = useState(0);
  const containerRefCb = useCallback((el) => {
    containerRef.current = el;
    if (el) setMountTick((t) => t + 1);
  }, []);
  const [appReady, setAppReady] = useState(false);
  const [animations, setAnimations] = useState([]);
  const [skins, setSkins] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const paramsRef = useRef(params);
  paramsRef.current = params;

  // PIXI 初始化
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let destroyed = false;
    (async () => {
      try {
        await loadSpineRuntime();
        if (destroyed) return;
        const app = new SpinePreviewApp(container);
        await app.init();
        if (destroyed) { app.destroy(); return; }
        appRef.current = app;
        setAppReady(true);
      } catch (err) {
        console.error('[SpinePreviewViewer] init failed:', err);
      }
    })();
    return () => {
      destroyed = true;
      setAppReady(false);
      if (appRef.current) { appRef.current.destroy(); appRef.current = null; }
    };
  }, [mountTick]);

  // 资源加载
  useEffect(() => {
    if (!appReady) return;
    const app = appRef.current;
    if (!app || !spineAssets?.skel || !spineAssets?.atlas || !spineAssets?.png || loadingRef.current) return;
    let cancelled = false;
    loadingRef.current = true;
    setLoaded(false);
    (async () => {
      try {
        const [skelDataUrl, atlasDataUrl, pngDataUrl] = await Promise.all([
          urlToDataUrl(spineAssets.skel),
          urlToDataUrl(spineAssets.atlas),
          urlToDataUrl(spineAssets.png),
        ]);
        if (cancelled || appRef.current !== app) return;
        const spineInstance = await loadSpine({
          skel: skelDataUrl, atlas: atlasDataUrl, png: pngDataUrl,
          name: spineAssets.name || 'spine',
        });
        if (cancelled || appRef.current !== app) return;
        app.setSpine(spineInstance);
        const anims = getAnimations(spineInstance);
        const sks = getSkins(spineInstance);
        const firstSkin = sks[0] || '';
        if (firstSkin) app.setSkin(firstSkin);
        app.setPlaying(paramsRef.current.playing !== false);
        app.setPlaybackSpeed(paramsRef.current.playbackSpeed || 1);
        setAnimations(anims);
        setSkins(sks);
        setLoaded(true);
      } catch (err) {
        console.error('[SpinePreviewViewer] load failed:', err);
      } finally {
        if (!cancelled) loadingRef.current = false;
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appReady, spineAssets?.skel, spineAssets?.atlas, spineAssets?.png]);

  // 控制操作
  const handleAnimationChange = useCallback((name) => {
    appRef.current?.setAnimation(name);
  }, []);
  const handleSkinChange = useCallback((name) => {
    appRef.current?.setSkin(name);
  }, []);
  const handleTogglePlay = useCallback(() => {
    const playing = !(paramsRef.current.playing !== false);
    appRef.current?.setPlaying(!playing);
  }, []);

  // 预览高度上报（固定高度）
  useEffect(() => {
    onHeightChange?.(360);
  }, [onHeightChange]);

  return (
    <div className="flex flex-col gap-2 p-2">
      <div
        className="nodrag nopan nowheel relative w-full overflow-hidden rounded-md bg-[#eef0f3]"
        style={{ height: 320 }}
      >
        <div ref={containerRefCb} className="absolute inset-0" />
        {!loaded && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
            <Loader className="mr-1.5 h-4 w-4 animate-spin" /> 加载中…
          </div>
        )}
      </div>
      <div className="nodrag nopan nowheel flex items-center gap-1.5">
        <button
          type="button"
          onClick={handleTogglePlay}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-border hover:bg-accent"
          title={params.playing !== false ? '暂停' : '播放'}
        >
          {params.playing !== false ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
        </button>
        <select
          value={params.animation || ''}
          onChange={(e) => handleAnimationChange(e.target.value)}
          className="min-w-0 flex-1 rounded border border-border bg-background px-1 py-0.5 text-[11px]"
        >
          {animations.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        {skins.length > 1 && (
          <select
            value={params.skin || ''}
            onChange={(e) => handleSkinChange(e.target.value)}
            className="min-w-0 flex-1 rounded border border-border bg-background px-1 py-0.5 text-[11px]"
          >
            {skins.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
      </div>
    </div>
  );
}
