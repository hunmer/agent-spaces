'use client';

import { useEffect, useRef } from 'react';
import { Actions, type TabNode } from 'flexlayout-react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { getWS } from '@/lib/ws';
import { useTheme } from '@/components/layout/theme-provider';
import { SINGLE_TERMINAL_PREFIX } from '@/stores/terminal';

interface SingleTerminalProps {
  /** 工作空间 id，用于建立 ws */
  workspaceId: string;
  /** flexlayout tab 节点，sessionId 等数据存在 node.getExtraData() 里 */
  node: TabNode;
  /** 初始工作目录；多个时取第一个 */
  boundDirs?: string[];
  /** 指定 shell，缺省用默认 */
  shell?: string;
}

const TERM_THEMES = {
  light: {
    background: '#ffffff',
    foreground: '#222222',
    cursor: '#1456f0',
    cursorAccent: '#ffffff',
    selectionBackground: 'rgba(20, 86, 240, 0.2)',
    black: '#222222',
    red: '#ef4444',
    green: '#16a34a',
    yellow: '#ca8a04',
    blue: '#1456f0',
    magenta: '#ea5ec1',
    cyan: '#0891b2',
    white: '#e5e7eb',
    brightBlack: '#45515e',
    brightRed: '#f87171',
    brightGreen: '#22c55e',
    brightYellow: '#eab308',
    brightBlue: '#3b82f6',
    brightMagenta: '#f472b6',
    brightCyan: '#06b6d4',
    brightWhite: '#f9fafb',
  },
  dark: {
    background: '#0f1117',
    foreground: '#e5e7eb',
    cursor: '#3b82f6',
    cursorAccent: '#0f1117',
    selectionBackground: 'rgba(59, 130, 246, 0.25)',
    black: '#0f1117',
    red: '#ef4444',
    green: '#22c55e',
    yellow: '#eab308',
    blue: '#3b82f6',
    magenta: '#ea5ec1',
    cyan: '#06b6d4',
    white: '#e5e7eb',
    brightBlack: '#8b8fa3',
    brightRed: '#f87171',
    brightGreen: '#4ade80',
    brightYellow: '#facc15',
    brightBlue: '#60a0fa',
    brightMagenta: '#f472b6',
    brightCyan: '#22d3ee',
    brightWhite: '#f9fafb',
  },
};

function disableXtermMobileKeyboard(xterm: Terminal) {
  const textarea = xterm.textarea;
  if (!textarea) return;
  textarea.inputMode = 'none';
  textarea.setAttribute('inputmode', 'none');
}

/**
 * 单终端公共组件（完全独立）。
 *
 * - 不依赖 useTerminalStore / TerminalPanel，自建 xterm + 直接走 ws 协议。
 * - sessionId 等数据存在 flexlayout tab node 的 getExtraData() 里，
 *   关闭/恢复 tab 时数据随 node 走，多实例互不干扰。
 */
export function SingleTerminal({ workspaceId, node, boundDirs = [], shell }: SingleTerminalProps) {
  const termRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const { resolvedTheme } = useTheme();
  const themeForCreateRef = useRef(resolvedTheme);
  // themeForCreateRef 用 effect 同步，避免进入创建 effect 的依赖
  useEffect(() => { themeForCreateRef.current = resolvedTheme; }, [resolvedTheme]);

  useEffect(() => {
    const container = termRef.current;
    if (!container) return;

    const ws = getWS(workspaceId);
    // sessionId 持久化到 node config（随 layout json 保存），刷新后复用以重连；
    // 带前缀使其被多 tab store 识别并过滤，不会错误恢复到 TerminalPanel。
    const config = (node.getConfig() ?? {}) as { sessionId?: string };
    let sessionId = config.sessionId;
    if (!sessionId) {
      sessionId = SINGLE_TERMINAL_PREFIX + (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2));
      // 通过 action 写入 config，确保随 layout json 持久化
      node.getModel().doAction(
        Actions.updateNodeAttributes(node.getId(), { config: { ...config, sessionId } }),
      );
    }

    // 创建 xterm
    const xterm = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      rightClickSelectsWord: true,
      macOptionClickForcesSelection: true,
      theme: themeForCreateRef.current === 'dark' ? TERM_THEMES.dark : TERM_THEMES.light,
    });
    const fit = new FitAddon();
    xterm.loadAddon(fit);
    xterm.loadAddon(new WebLinksAddon((_e: MouseEvent, uri: string) => window.open(uri)));
    xterm.open(container);
    disableXtermMobileKeyboard(xterm);

    xtermRef.current = xterm;
    fitRef.current = fit;

    // 输入 → 服务端
    const inputDisposable = xterm.onData((data) => {
      ws.send('terminal.input', { sessionId, data });
    });

    // 输出 ← 服务端（仅处理本会话）
    const outputHandler = (data: unknown) => {
      const { sessionId: sid, data: output } = data as { sessionId: string; data: string };
      if (sid === sessionId) xterm.write(output);
    };
    ws.on('terminal.output', outputHandler);

    // 发送尺寸
    const sendResize = () => {
      ws.send('terminal.resize', { sessionId, cols: xterm.cols, rows: xterm.rows });
    };

    // 重启恢复：先查会话是否仍存活，存活则重连（写回 buffer + resize），否则新建。
    // 注意：terminal.sessions 会被服务端主动 push + 多处 list 请求多次触发，
    // 必须只处理首次（once），否则重复 write/create 会导致内容叠加或被新建会话清空。
    let restoreHandled = false;
    const sessionsHandler = (data: unknown) => {
      if (restoreHandled) return;
      const { sessions } = data as { sessions: Array<{ sessionId: string; buffer?: string }> };
      // 仅当本次响应确实包含本会话信息、或明确不含（可判定存活与否）时才处理。
      // 服务端在 ws 刚连上时可能先 push 一个不完整的快照，等 list 的完整响应再处理。
      const target = sessions.find((s) => s.sessionId === sessionId);
      const alive = Boolean(target);
      restoreHandled = true;
      // 后续不再处理，避免重复 write/create
      ws.off('terminal.sessions', sessionsHandler);
      if (alive) {
        // 会话仍存活：写回 buffer 并 resize 重连
        if (target?.buffer) xterm.write(target.buffer);
        sendResize();
      } else {
        // 会话已不存在：重新创建
        ws.send('terminal.create', { sessionId, shell, cwd: boundDirs[0] });
      }
    };
    ws.on('terminal.sessions', sessionsHandler);
    // 请求会话列表（服务端也会主动 push，这里兜底确保拿到）
    ws.send('terminal.list', {});

    // 初始 fit
    requestAnimationFrame(() => {
      try { fit.fit(); } catch { /* ignore */ }
    });

    // 容器尺寸变化 → fit + resize
    const resizeObserver = new ResizeObserver(() => {
      try { fit.fit(); } catch { /* ignore */ }
      sendResize();
    });
    resizeObserver.observe(container);

    // 右键复制选中
    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      if (!xterm.hasSelection()) return;
      void navigator.clipboard?.writeText(xterm.getSelection());
    };
    container.addEventListener('contextmenu', handleContextMenu, { capture: true });

    return () => {
      resizeObserver.disconnect();
      container.removeEventListener('contextmenu', handleContextMenu, { capture: true });
      inputDisposable.dispose();
      ws.off('terminal.output', outputHandler);
      ws.off('terminal.sessions', sessionsHandler);
      ws.send('terminal.close', { sessionId });
      xterm.dispose();
      xtermRef.current = null;
      fitRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 主题切换同步（不重建终端）
  useEffect(() => {
    if (!xtermRef.current || !resolvedTheme) return;
    xtermRef.current.options.theme = resolvedTheme === 'dark' ? TERM_THEMES.dark : TERM_THEMES.light;
  }, [resolvedTheme]);

  return (
    <div
      ref={termRef}
      className="h-full w-full select-text touch-pan-x touch-pan-y"
      style={{ WebkitTouchCallout: 'none' }}
    />
  );
}
