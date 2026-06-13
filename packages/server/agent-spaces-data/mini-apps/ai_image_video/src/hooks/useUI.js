import { useState, useEffect } from 'react';

/**
 * 安全访问 window.AgentSpacesUI 组件库的 Hook。
 *
 * UI 组件在 Workflow UI 渲染器中是异步注入到 window.AgentSpacesUI 的，
 * 子模块在渲染时该对象可能尚未就绪，直接解构会导致
 * "Cannot read properties of undefined" 错误。
 *
 * 本 Hook 通过轮询机制等待组件库就绪，再返回可安全解构的对象引用。
 *
 * @returns {object|null} UI 组件对象，未就绪时返回 null
 */
export default function useUI() {
  const [ui, setUI] = useState(() => window.AgentSpacesUI || null);

  useEffect(() => {
    if (ui) return;
    const timer = setInterval(() => {
      const next = window.AgentSpacesUI;
      if (next) {
        setUI(next);
        clearInterval(timer);
      }
    }, 50);
    return () => clearInterval(timer);
  }, [ui]);

  return ui;
}
