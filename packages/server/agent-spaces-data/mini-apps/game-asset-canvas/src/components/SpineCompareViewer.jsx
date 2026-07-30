import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader } from '@agent-spaces/ui';
import { SpineEditorApp } from '../spine/core/SpineEditorApp';
import { getSkins, loadSpine } from '../spine/loaders/SpineLoader';
import { loadSpineRuntime } from '../spine/runtime';

async function urlToDataUrl(url) {
  if (!url) throw new Error('Spine 对比资源 URL 为空');
  if (url.startsWith('data:')) return url;
  const AS = window.AgentSpaces;
  const requestUrl = AS?.proxyImageUrl ? AS.proxyImageUrl(url) : url;
  const response = await fetch(requestUrl);
  if (!response.ok) throw new Error(`Spine 对比资源加载失败 (${response.status})`);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Spine 对比资源转换失败'));
    reader.readAsDataURL(blob);
  });
}

export default function SpineCompareViewer({ assets, label }) {
  const hostRef = useRef(null);
  const signature = useMemo(() => [
    assets?.skel || '', assets?.atlas || '', assets?.png || '', assets?.skinName || '',
  ].join('|'), [assets?.skel, assets?.atlas, assets?.png, assets?.skinName]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !assets?.skel || !assets?.atlas || !assets?.png) return undefined;
    let disposed = false;
    let editor = null;
    let resizeObserver = null;

    (async () => {
      setStatus('loading');
      setError('');
      try {
        await loadSpineRuntime();
        if (disposed) return;
        editor = new SpineEditorApp(host);
        await editor.init();
        const [skel, atlas, png] = await Promise.all([
          urlToDataUrl(assets.skel),
          urlToDataUrl(assets.atlas),
          urlToDataUrl(assets.png),
        ]);
        if (disposed) return;
        const spine = await loadSpine({ skel, atlas, png, name: label || 'Spine 对比' });
        if (disposed) {
          spine.destroy?.();
          return;
        }
        editor.setSpine(spine);
        const skins = getSkins(spine);
        const skinName = skins.includes(assets.skinName)
          ? assets.skinName
          : (skins.includes('default') ? 'default' : skins[0]);
        if (skinName) editor.setSkin(skinName);
        editor.setMode('pose');
        editor.setViewInteractionEnabled(false);
        editor.gizmo?.setVisible(false);
        await new Promise((resolve) => requestAnimationFrame(resolve));
        if (disposed) return;
        editor.fitView();
        editor.app?.render();
        if (typeof ResizeObserver !== 'undefined') {
          resizeObserver = new ResizeObserver(() => {
            editor?.fitView();
            editor?.app?.render();
          });
          resizeObserver.observe(host);
        }
        setStatus('ready');
      } catch (err) {
        if (!disposed) {
          setError(err?.message || String(err));
          setStatus('error');
        }
      }
    })();

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      editor?.destroy();
    };
  }, [signature, label]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-muted">
      <div ref={hostRef} className="absolute inset-0" />
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/70 text-xs text-muted-foreground">
          <Loader className="mr-2 h-4 w-4 animate-spin" />加载 {label}
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-destructive/10 px-4 text-center text-xs text-destructive">
          {error}
        </div>
      )}
    </div>
  );
}
