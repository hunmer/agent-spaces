import { useCallback, useEffect, useState } from 'react';
import { loadPanelLayout, loadShowMinimap, onAnyConfigChanged, savePanelLayout } from '../utils/storage';
import { DEFAULT_PANEL_LAYOUT } from '../utils/canvas-constants';

/**
 * 画布面板布局 + 小地图显隐的持久化。
 * 从 Canvas.jsx 抽出（原 B2 订阅 + B16 布局回调部分）。
 *
 * panel-layout.json 同时存 layout（{panelId:percentage}）和 showMinimap（bool），
 * 任意一项变化都广播 miniApp.configChanged，这里订阅并同步到 state。
 *
 * @returns {{ panelLayout, showMinimap, setPanelLayout, setShowMinimap, handlePanelLayoutChange, toggleMinimap }}
 */
export default function usePanelLayout() {
  const [panelLayout, setPanelLayout] = useState(() => loadPanelLayout() || DEFAULT_PANEL_LAYOUT);
  const [showMinimap, setShowMinimap] = useState(() => loadShowMinimap());

  // 订阅 panel-layout.json 变化（多端同步）
  useEffect(() => {
    const unsub = onAnyConfigChanged((path, value) => {
      if (path === 'panel-layout.json') {
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

  return { panelLayout, showMinimap, setPanelLayout, setShowMinimap, handlePanelLayoutChange, toggleMinimap };
}
