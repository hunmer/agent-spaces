import { useCallback, useEffect, useState } from 'react';
import {
  PANEL_LAYOUT_CONFIG, loadPanelLayout, loadShowMinimap, onAnyConfigChanged, savePanelLayout,
} from '../utils/storage';
import { DEFAULT_PANEL_LAYOUT } from '../utils/canvas-constants';

/**
 * 画布面板布局 + 小地图显隐的持久化。
 * 从 Canvas.jsx 抽出（原 B2 订阅 + B16 布局回调部分）。
 *
 * panel-layout.json 同时存 layout（{panelId:percentage}）和 showMinimap（bool），
 * 任意一项变化都广播 miniApp.configChanged，这里订阅并同步到 state。
 *
 * 三重读取（getConfig 快照 + onConfigReady 兜底 + onAnyConfigChanged 同步）：
 * 挂载时 config 缓存可能未 ready，单次 getConfig 会拿空 → 布局丢失。
 * onConfigReady 在缓存就绪后补读一次，保证刷新后能恢复。
 *
 * @returns {{ panelLayout, showMinimap, setPanelLayout, setShowMinimap, handlePanelLayoutChange, toggleMinimap, layoutReady }}
 */
export default function usePanelLayout() {
  const [panelLayout, setPanelLayout] = useState(() => loadPanelLayout() || DEFAULT_PANEL_LAYOUT);
  const [showMinimap, setShowMinimap] = useState(() => loadShowMinimap());
  const [layoutReady, setLayoutReady] = useState(false);

  // 三重读取之一：挂载时若 config 未 ready，等 onConfigReady 再读一次（补初始快照缺失）
  useEffect(() => {
    const as = window.AgentSpaces;
    if (as?.isConfigReady?.() === false) {
      return as.onConfigReady?.((configs) => {
        const v = configs?.[PANEL_LAYOUT_CONFIG];
        if (v?.layout && typeof v.layout === 'object') setPanelLayout(v.layout);
        if (typeof v?.showMinimap === 'boolean') setShowMinimap(v.showMinimap);
        setLayoutReady(true);
      });
    }
    setLayoutReady(true);
    return undefined;
  }, []);

  // 订阅 panel-layout.json 变化（多端同步）
  useEffect(() => {
    const unsub = onAnyConfigChanged((path, value) => {
      if (path === PANEL_LAYOUT_CONFIG) {
        if (value?.layout && typeof value.layout === 'object') setPanelLayout(value.layout);
        if (typeof value?.showMinimap === 'boolean') setShowMinimap(value.showMinimap);
      }
    });
    return () => { try { unsub(); } catch {} };
  }, []);

  // 面板布局变化 -> 持久化（同时带上当前 showMinimap，避免覆盖）
  const handlePanelLayoutChange = useCallback((layout) => {
    setPanelLayout(layout);
    savePanelLayout(layout, { showMinimap });
  }, [showMinimap]);

  // 切换 MiniMap 显隐 -> 持久化（同时带上当前 layout）
  const toggleMinimap = useCallback(() => {
    setShowMinimap((prev) => {
      const next = !prev;
      savePanelLayout(panelLayout, { showMinimap: next });
      return next;
    });
  }, [panelLayout]);

  return { panelLayout, showMinimap, setPanelLayout, setShowMinimap, handlePanelLayoutChange, toggleMinimap, layoutReady };
}
