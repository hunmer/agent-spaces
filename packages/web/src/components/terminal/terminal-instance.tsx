'use client';

import { useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { useTheme } from '@/components/theme-provider';
import { getWS } from '@/lib/ws';
import { useTerminalStore, consumeSessionBuffer } from '@/stores/terminal';

// Global registry to persist xterm instances across mount/unmount cycles
const terminalRegistry = new Map<string, { xterm: Terminal; fit: FitAddon }>();

export function disposeTerminalSession(sessionId: string) {
  const cached = terminalRegistry.get(sessionId);
  if (cached) {
    cached.xterm.dispose();
    terminalRegistry.delete(sessionId);
  }
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
    brightBlue: '#60a5fa',
    brightMagenta: '#f472b6',
    brightCyan: '#22d3ee',
    brightWhite: '#f9fafb',
  },
};

interface TerminalInstanceProps {
  sessionId: string;
  workspaceId: string;
}

export function TerminalInstance({ sessionId, workspaceId }: TerminalInstanceProps) {
  const termRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const { resolvedTheme } = useTheme();

  const handleOutput = useCallback((data: unknown) => {
    const { sessionId: sid, data: output } = data as { sessionId: string; data: string };
    if (sid === sessionId && xtermRef.current) {
      xtermRef.current.write(output);
    }
  }, [sessionId]);

  useEffect(() => {
    if (!termRef.current) return;

    const ws = getWS(workspaceId);
    let xterm: Terminal;
    let fit: FitAddon;
    let inputDisposable: ReturnType<Terminal['onData']>;

    const cached = terminalRegistry.get(sessionId);
    if (cached) {
      // Reuse existing terminal — move DOM element to new container
      xterm = cached.xterm;
      fit = cached.fit;
      if (xterm.element) {
        termRef.current.appendChild(xterm.element);
      }
      requestAnimationFrame(() => fit.fit());
    } else {
      // Create new terminal instance
      xterm = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        theme: resolvedTheme === 'dark' ? TERM_THEMES.dark : TERM_THEMES.light,
      });

      fit = new FitAddon();
      xterm.loadAddon(fit);
      xterm.loadAddon(new WebLinksAddon());
      xterm.open(termRef.current);

      requestAnimationFrame(() => fit.fit());

      terminalRegistry.set(sessionId, { xterm, fit });

      // Restore buffered output for reconnected sessions
      const buffer = consumeSessionBuffer(sessionId);
      if (buffer) xterm.write(buffer);
    }

    xtermRef.current = xterm;
    fitRef.current = fit;

    // Send terminal input to server
    inputDisposable = xterm.onData((data) => {
      ws.send('terminal.input', { sessionId, data });
    });

    // Listen for output
    ws.on('terminal.output', handleOutput);

    // Send initial size
    ws.send('terminal.resize', {
      sessionId,
      cols: xterm.cols,
      rows: xterm.rows,
    });

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      try { fit.fit(); } catch { /* ignore */ }
      ws.send('terminal.resize', {
        sessionId,
        cols: xterm.cols,
        rows: xterm.rows,
      });
    });
    resizeObserver.observe(termRef.current);

    return () => {
      resizeObserver.disconnect();
      inputDisposable.dispose();
      ws.off('terminal.output', handleOutput);
      // If session was removed from store (user/server closed it), dispose terminal
      const { sessions } = useTerminalStore.getState();
      if (!sessions.some(s => s.id === sessionId)) {
        disposeTerminalSession(sessionId);
      }
    };
  }, [sessionId, workspaceId, handleOutput]);

  // Sync theme without recreating terminal
  useEffect(() => {
    if (!xtermRef.current || !resolvedTheme) return;
    xtermRef.current.options.theme = resolvedTheme === 'dark' ? TERM_THEMES.dark : TERM_THEMES.light;
  }, [resolvedTheme]);

  return <div ref={termRef} className="h-full w-full" />;
}
