// 移植自原 components/Live2DViewer.tsx，改为通过 CDN 全局访问 PIXI / Live2DModel，
// 不再 `import * as PIXI` 和 `import { Live2DModel }`（renderer 未 allowlist 这些包）。
import React, { useEffect, useRef, useState } from 'react';
import { loadLive2DDeps } from '../utils/cdn-loader';

// 容错解析 model3.json：处理部分仓库里带尾逗号的非标准 JSON
const parseModelConfig = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    let result = '';
    let quoted = false;
    let escaped = false;
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      if (char === '"' && !escaped) quoted = !quoted;
      if (char === ',' && !quoted) {
        let next = i + 1;
        while (/\s/.test(text[next] || '')) next += 1;
        if (text[next] === '}' || text[next] === ']') {
          escaped = false;
          continue; // eslint-disable-line no-continue
        }
      }
      result += char;
      escaped = char === '\\' && !escaped;
      if (char !== '\\') escaped = false;
    }
    return JSON.parse(result);
  }
};

export default function Live2DViewer({ modelConfig, onAvailableMotions, motionToPlay, onMotionConsumed, onOpenLibrary }) {
  const canvasRef = useRef(null);
  const appRef = useRef(null);
  const modelRef = useRef(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState(''); // CDN 加载/初始化提示

  // 计算尺寸时使用父容器而非 window，避免 miniapp 嵌套时尺寸错位
  const fitModelToScreen = (PIXI, model) => {
    if (!model) return;
    const parent = canvasRef.current?.parentElement;
    const width = parent?.clientWidth || window.innerWidth;
    const height = parent?.clientHeight || window.innerHeight;

    model.anchor.set(0.5, 0.5);
    const scaleX = (width * 0.9) / model.width;
    const scaleY = (height * 0.9) / model.height;
    const currentScaleX = model.scale.x;
    const currentScaleY = model.scale.y;
    const trueScaleX = scaleX * currentScaleX;
    const trueScaleY = scaleY * currentScaleY;
    const finalBaseScale = Math.min(trueScaleX, trueScaleY);
    const userScale = modelConfig?.scale || 1.0;
    model.scale.set(finalBaseScale * userScale);
    model.x = width / 2 + (modelConfig?.xOffset || 0);
    model.y = height / 2 + (modelConfig?.yOffset || 0);
  };

  const destroyModel = (model) => {
    const im = model?.interactionManager;
    if (im && typeof im.off !== 'function') {
      model.interactionManager = undefined;
    }
    try { model?.destroy(); } catch { /* noop */ }
  };

  // ===== 初始化 PIXI Application（只跑一次） =====
  useEffect(() => {
    if (!canvasRef.current) return undefined;

    let destroyed = false;
    let PIXI = null;
    let app = null;

    (async () => {
      try {
        setStatus('正在加载 Live2D 运行时…');
        PIXI = await loadLive2DDeps();
        if (destroyed) return;

        // WebGL 可用性探测：使用与 PIXI 一致的 context attributes
        const attrs = {
          alpha: true,
          antialias: false,
          premultipliedAlpha: true,
          preserveDrawingBuffer: false,
          powerPreference: 'high-performance',
          stencil: true,
          failIfMajorPerformanceCaveat: false,
        };
        const probe = document.createElement('canvas');
        let gl = null;
        try {
          gl = probe.getContext('webgl2', attrs) || probe.getContext('webgl', attrs) || probe.getContext('experimental-webgl', attrs);
        } catch {
          gl = null;
        }
        const maxTex = gl ? gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS) : 0;
        gl?.getExtension?.('WEBGL_lose_context')?.loseContext?.();
        if (!gl || !maxTex || maxTex <= 0) {
          setError('WebGL 不可用（硬件加速可能被关闭或处于沙箱环境），无法显示 Live2D 模型。');
          setStatus('');
          return;
        }

        // 注册 ticker（自动呼吸/眨眼）
        const Live2DModel = PIXI.live2d?.Live2DModel;
        if (Live2DModel?.registerTicker) {
          Live2DModel.registerTicker(PIXI.Ticker);
        }

        app = new PIXI.Application({
          view: canvasRef.current,
          autoStart: true,
          backgroundAlpha: 0,
          resizeTo: canvasRef.current?.parentElement || window,
        });
        appRef.current = app;
        setStatus('');
      } catch (e) {
        console.error('[Live2DViewer] 初始化失败：', e);
        setError('Live2D 初始化失败：' + (e?.message || e));
        setStatus('');
      }
    })();

    return () => {
      destroyed = true;
      if (appRef.current) {
        try {
          appRef.current.destroy(true, { children: true, texture: true, baseTexture: true });
        } catch { /* noop */ }
        appRef.current = null;
      }
    };
  }, []);

  // ===== 动作触发（来自对话） =====
  useEffect(() => {
    if (!motionToPlay || !modelRef.current) return;
    try {
      modelRef.current.motion(motionToPlay);
    } catch (e) {
      console.warn('[Live2DViewer] 动作播放失败：', motionToPlay, e);
    }
    onMotionConsumed?.();
  }, [motionToPlay, onMotionConsumed]);

  // ===== 模型加载/切换 =====
  useEffect(() => {
    if (!appRef.current) return;
    const PIXI = window.PIXI;

    // 无模型：清空舞台
    if (!modelConfig || !modelConfig.url) {
      if (modelRef.current) {
        appRef.current.stage.removeChild(modelRef.current);
        destroyModel(modelRef.current);
        modelRef.current = null;
      }
      onAvailableMotions?.([]);
      return;
    }

    let cancelled = false;
    const loadModel = async () => {
      try {
        setIsLoading(true);
        setError('');

        if (modelRef.current) {
          appRef.current.stage.removeChild(modelRef.current);
          destroyModel(modelRef.current);
          modelRef.current = null;
        }

        const response = await fetch(modelConfig.url);
        if (!response.ok) throw new Error(`模型配置请求失败：${response.status}`);
        const modelData = parseModelConfig(await response.text());
        let modelSource = modelConfig.url;

        const textures = (Array.isArray(modelData.textures)
          ? modelData.textures
          : Object.values(modelData.textures || {}).flat()
        ).map((t) => (t.includes('/') ? t : `textures/${t}`));

        // Cubism 2 简化配置（.moc）
        if (typeof modelData.model === 'string' && modelData.model.endsWith('.moc') && textures.length > 0) {
          modelSource = {
            type: 'Live2D Model Setting',
            name: modelData.name || 'Model',
            model: modelData.model,
            textures,
            ...(modelData.physics ? { physics: modelData.physics } : {}),
            ...(modelData.motions ? { motions: modelData.motions } : {}),
            ...(modelData.hit_areas ? { hit_areas: modelData.hit_areas } : {}),
            url: modelConfig.url,
          };
        }

        // Cubism 3/4 简化配置（.moc3）
        if (
          typeof modelData.model === 'string' &&
          modelData.model.endsWith('.moc3') &&
          Array.isArray(modelData.textures) &&
          !modelData.FileReferences
        ) {
          modelSource = {
            Version: 3,
            FileReferences: {
              Moc: modelData.model,
              Textures: modelData.textures,
              Physics: modelData.physics,
              Motions: modelData.motions || { Idle: [] },
            },
            Groups: modelData.groups || [],
            HitAreas: modelData.hit_areas || [],
            url: modelConfig.url,
          };
        }

        const Live2DModel = PIXI.live2d?.Live2DModel;
        if (!Live2DModel) throw new Error('Live2DModel 未就绪');

        const model = await Live2DModel.from(modelSource);
        if (cancelled) {
          destroyModel(model);
          return;
        }

        appRef.current.stage.addChild(model);
        modelRef.current = model;
        fitModelToScreen(PIXI, model);

        // 提取动作组
        let motions = [];
        const getKeys = (obj) => (obj ? Object.keys(obj) : []);
        if (model.internalModel) {
          const mgr = model.internalModel.motionManager;
          if (mgr && mgr.definitions) motions = getKeys(mgr.definitions);
        }
        if (motions.length === 0 && model.definitions) motions = getKeys(model.definitions);
        onAvailableMotions?.(motions);

        // 点击随机动作
        model.interactive = true;
        model.on('pointertap', () => {
          if (motions.length === 0) return;
          const randomGroup = motions[Math.floor(Math.random() * motions.length)];
          try { model.motion(randomGroup); } catch { /* noop */ }
        });
        model.on('hit', (hitAreas) => {
          if (Array.isArray(hitAreas) && hitAreas.includes('Body')) {
            try { model.motion('TapBody'); } catch { /* noop */ }
          }
        });
      } catch (e) {
        console.error('[Live2DViewer] 加载模型失败：', e);
        setError('Live2D 加载失败（详见控制台）');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    loadModel();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelConfig]);

  // ===== 窗口/父容器尺寸变化 =====
  useEffect(() => {
    const handleResize = () => {
      const PIXI = window.PIXI;
      if (appRef.current) {
        try { appRef.current.resize(); } catch { /* noop */ }
        if (modelRef.current && PIXI) fitModelToScreen(PIXI, modelRef.current);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelConfig]);

  return (
    <div className="absolute inset-0 pointer-events-none z-0 flex items-center justify-center">
      <canvas ref={canvasRef} className="absolute inset-0 z-0 pointer-events-auto" />

      {!modelConfig && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center cursor-pointer bg-black/40 backdrop-blur-sm hover:bg-black/50 transition pointer-events-auto"
          onClick={() => onOpenLibrary?.()}
        >
          <div className="text-center p-8 border-2 border-dashed border-cyan-400/50 rounded-2xl animate-pulse bg-black/50">
            <div className="text-6xl text-cyan-400 mb-4">➕</div>
            <h2 className="text-2xl font-bold text-white mb-2">未选择模型</h2>
            <p className="text-cyan-200">点击打开模型库</p>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/20 backdrop-blur-sm pointer-events-none">
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            <div className="text-white font-bold">{status || '加载模型中…'}</div>
          </div>
        </div>
      )}

      {status && !isLoading && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 text-cyan-200 text-sm bg-black/40 px-3 py-1 rounded">
          {status}
        </div>
      )}

      {error && !isLoading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-red-500/80 text-white px-4 py-2 rounded text-sm">{error}</div>
        </div>
      )}
    </div>
  );
}
