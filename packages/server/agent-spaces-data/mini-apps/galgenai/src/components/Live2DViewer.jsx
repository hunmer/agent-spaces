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
  // 当前模型的动作项 [{group,index,label}]，供 triggerMotion 按 label 查表播放
  const motionItemsRef = useRef([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState(''); // CDN 加载/初始化提示
  // PIXI Application 是否就绪。CDN 异步加载期间 appRef.current 为 null，
  // 模型加载 effect 会提前 return；这里用 appReady 触发它重跑，确保
  // 页面重载后从 settings 恢复的 currentModelId 能被加载。
  const [appReady, setAppReady] = useState(false);

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
        if (!destroyed) setAppReady(true);
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

  // ===== 动作触发（来自对话 / Popover 点击） =====
  // motionToPlay 约定为动作 label；按 label 在当前模型动作表里查 group+index 精确播放。
  useEffect(() => {
    if (!motionToPlay || !modelRef.current) return;
    const items = motionItemsRef.current || [];
    // 精确匹配优先，否则包含匹配
    const found =
      items.find((m) => m.label === motionToPlay) ||
      items.find((m) => m.label.toLowerCase().includes(String(motionToPlay).toLowerCase())) ||
      items.find((m) => String(motionToPlay).toLowerCase().includes(m.label.toLowerCase()));
    if (found) {
      try {
        modelRef.current.motion(found.group, found.index);
      } catch (e) {
        console.warn('[Live2DViewer] 动作播放失败：', motionToPlay, e);
      }
    } else {
      console.warn('[Live2DViewer] 未找到动作：', motionToPlay, '可用：', items.map((m) => m.label));
    }
    onMotionConsumed?.();
  }, [motionToPlay, onMotionConsumed]);

  // ===== 模型加载/切换 =====
  // 依赖 appReady：PIXI Application 异步初始化完成后触发重跑，
  // 让页面重载时从 settings 恢复的模型也能被加载。
  useEffect(() => {
    if (!appReady || !appRef.current) return;
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

        // 提取动作项。某些模型把所有动作塞在一个空键组 "" 下（或单一组下），
        // 这种情况按 group 不易区分，需要展平到「每个具体动作」级别：
        // [{group, index, label}]，label 优先用动作文件名（去路径和扩展名）。
        const extractMotionItems = (definitions) => {
          const items = [];
          if (!definitions) return items;
          for (const group of Object.keys(definitions)) {
            const arr = definitions[group];
            if (!Array.isArray(arr)) continue;
            arr.forEach((def, index) => {
              const file = def?.File || def?.file || def?.name || '';
              const base = String(file).split('/').pop().replace(/\.(motion3\.json|mtn|json)$/i, '');
              const label = base || group || `motion ${index + 1}`;
              items.push({ group, index, label });
            });
          }
          return items;
        };
        let motionItems = [];
        if (model.internalModel) {
          const mgr = model.internalModel.motionManager;
          if (mgr?.definitions) motionItems = extractMotionItems(mgr.definitions);
        }
        if (motionItems.length === 0 && model.definitions) {
          motionItems = extractMotionItems(model.definitions);
        }
        motionItemsRef.current = motionItems;
        onAvailableMotions?.(motionItems);

        // 点击随机动作
        model.interactive = true;
        model.on('pointertap', () => {
          if (motionItems.length === 0) return;
          const item = motionItems[Math.floor(Math.random() * motionItems.length)];
          try { model.motion(item.group, item.index); } catch { /* noop */ }
        });
        model.on('hit', (hitAreas) => {
          if (Array.isArray(hitAreas) && hitAreas.includes('Body')) {
            const tap = motionItems.find((m) => /tap|touch/i.test(m.label));
            if (tap) {
              try { model.motion(tap.group, tap.index); } catch { /* noop */ }
            }
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
    // appReady 必须在依赖里：CDN 加载完成后触发首次模型加载
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelConfig, appReady]);

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

  // ===== idle 结束后立即播第一个待机动画 =====
  // 策略：事件驱动为主——监听 motionManager 的 motionFinish，动作一结束就播第一个待机动作；
  // 低频兜底定时器处理首次启动 / 事件丢失 / 某些 cubism 版本不触发 finish 的情况。
  // 待机候选组优先 idle/Idle，否则第一个动作组。
  useEffect(() => {
    if (!appReady) return undefined;

    const playIdle = () => {
      const model = modelRef.current;
      if (!model) return;
      const items = motionItemsRef.current || [];
      if (items.length === 0) return;
      // 仅在模型空闲时播，避免打断用户/对话触发的动作
      try {
        const state = model.internalModel?.motionManager?.state;
        if (state && state.currentGroup !== undefined) return;
      } catch { /* noop */ }
      // 选 idle 候选项：label 含 idle 的优先，否则第一个
      const idleItem =
        items.find((m) => /^idle$/i.test(m.label)) ||
        items.find((m) => /idle/i.test(m.label)) ||
        items[0];
      try {
        model.motion(idleItem.group, idleItem.index);
      } catch { /* noop */ }
    };

    // 绑定到当前模型的 motionManager；模型切换时重新绑（modelRef 变化无法触发 effect，
    // 用定时器轮询绑定状态兜底）
    let boundModel = null;
    const onMotionFinish = () => {
      // 动作结束后稍延迟，让 motionManager state 更新为空闲
      setTimeout(playIdle, 300);
    };
    const bind = () => {
      const model = modelRef.current;
      if (!model || model === boundModel) return;
      if (boundModel) {
        try { boundModel.internalModel?.motionManager?.off?.('motionFinish', onMotionFinish); } catch { /* noop */ }
      }
      boundModel = model;
      try {
        model.internalModel?.motionManager?.on?.('motionFinish', onMotionFinish);
      } catch { /* noop */ }
    };

    // 首次启动 + 兜底：每 10 秒检查一次（事件丢失时也能恢复 idle）
    const fallback = setInterval(() => {
      bind();
      playIdle();
    }, 10000);
    bind();
    playIdle();

    return () => {
      clearInterval(fallback);
      if (boundModel) {
        try { boundModel.internalModel?.motionManager?.off?.('motionFinish', onMotionFinish); } catch { /* noop */ }
      }
    };
  }, [appReady]);

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
