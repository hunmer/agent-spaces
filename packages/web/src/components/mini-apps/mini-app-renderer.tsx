/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useRef } from 'react';
import * as AgentSpacesUI from '@/lib/ui-exports';
import { cn } from '@/lib/utils';
import { useTheme } from '@/components/layout/theme-provider';
import { useMiniAppReactRenderer } from './react-renderer';
import { getTaskEventsSince } from './mini-app-task-events';

export type MiniAppRenderType = 'react' | 'html';

interface MiniAppRendererProps {
  type: MiniAppRenderType;
  sourceCode: string;
  onError: (error: string | null) => void;
  componentProps?: Record<string, unknown>;
  className?: string;
  taskEvents?: MiniAppTaskEvent[];
  /** filename -> content map for local import resolution */
  files?: Record<string, string>;
  /** entry point filename (used to resolve relative imports from sourceCode) */
  mainFile?: string;
  allowScroll?: boolean;
}

export interface MiniAppTaskEvent {
  event: string;
  data: unknown;
  timestamp?: string;
}

let agentSpacesUiMountCount = 0;
let initialAgentSpacesUi: unknown;

// ---- 沙箱 iframe 支持：用于需要原生 ESM / import map 的 HTML 项目（如 Excalidraw）----

/** 从当前预览页 URL 解析 miniapp projectId（兼容 ?id= 与 /mini-apps-preview/<id>）。 */
function getMiniAppProjectIdFromLocation(): string | null {
  if (typeof window === 'undefined') return null;
  const { search, pathname } = window.location;
  const queryId = new URLSearchParams(search).get('id');
  if (queryId) return queryId;
  const m = pathname.match(/\/mini-apps-preview\/([^/?#]+)/);
  if (m) return decodeURIComponent(m[1]);
  return null;
}

/**
 * 将沙箱 HTML 中所有相对路径（./xxx、../xxx、xxx）重写为指向本地 src/file 路由的绝对 URL。
 * 命中：href="..."、src="..."、import ... from "..."、new URL("...",...)、URL 形如 ./xxx / 非 http 的裸路径。
 * 不改：已经是 http(s)、data:、blob:、//、#、绝对路径 /xxx 的 URL。
 */
function rewriteRelativePathsToSrcFile(html: string, srcFileBase: string): string {
  // 只重写真正的相对路径（以 ./ 或 ../ 开头）。
  // 裸模块名（react、react-dom/client、@scope/pkg）和绝对/协议 URL 不动，
  // 否则会破坏 import map 的裸模块映射。
  const rewritable = (val: string): boolean => /^\.\.?\//.test(val);
  const convert = (val: string) => {
    if (!rewritable(val)) return val;
    // 归一化 ./ 与 ../（假设无复杂 ../ 跨层，单项目 src 内平坦）
    const cleaned = val.replace(/^\.\//, '').replace(/(?:^|\/)\.\.\//g, '');
    return `${srcFileBase}${cleaned}`;
  };
  // href="..."、src="..."
  let out = html.replace(/(href|src)\s*=\s*("([^"]*)"|'([^']*)')/gi, (_m, attr, _q, dq, sq) => {
    if (dq !== undefined) return `${attr}="${convert(dq)}"`;
    return `${attr}='${convert(sq)}'`;
  });
  // import x from "..." / import("...")
  out = out.replace(/(import\b[^;]*?from\s*|import\s*)\(\s*("([^"]*)"|'([^']*)')\s*\)/gi, (_m, kw, _q, dq, sq) => {
    const v = dq !== undefined ? dq : sq;
    return `${kw}("${convert(v)}")`;
  });
  out = out.replace(/(from|import)\s*("([^"]*)"|'([^']*)')/gi, (_m, kw, _q, dq, sq) => {
    if (dq !== undefined) return `${kw} "${convert(dq)}"`;
    return `${kw} '${convert(sq)}'`;
  });
  return out;
}

/**
 * 用沙箱 iframe（srcdoc）加载完整 HTML，让浏览器原生解析 import map、module script、<link>。
 * 用于 Excalidraw 这类需要原生 ESM 的项目；普通 HTML 项目仍走旧 innerHTML 路径。
 */
const MINI_APP_CONSOLE_BRIDGE_SOURCE = 'agent-spaces:mini-app-console';

function renderHtmlInSandboxIframe(container: HTMLDivElement, html: string): () => void {
  container.innerHTML = '';
  const projectId = getMiniAppProjectIdFromLocation();
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  // path 段 base：GET /api/mini-apps/:id/src/file/<relPath>
  // 用 path 段而非 query 形式，因为 Excalidraw 用 new URL(rel, base) 拼接资源 URL，
  // base 中的 query string 会被 new URL 丢弃。base 末尾带 / 以便相对路径正确拼接。
  // path 段路由在 auth 中间件直接放行（只读静态资源，路径已防穿越）。
  const srcFileBase = projectId
    ? `${origin}/api/mini-apps/${encodeURIComponent(projectId)}/src/file/`
    : '';

  let finalHtml = html;
  if (srcFileBase) {
    finalHtml = rewriteRelativePathsToSrcFile(html, srcFileBase);
    // Excalidraw 资源前缀占位符：index.html 里 window.EXCALIDRAW_ASSET_PATH = "__MINIAPP_SRC_FILE_BASE__"
    // 指向 src/file/ path 段 base，Excalidraw 运行时用 new URL("./fonts/x.woff2", base) 加载字体。
    finalHtml = finalHtml.replace(/__MINIAPP_SRC_FILE_BASE__/g, srcFileBase);
  }

  // srcdoc runs in a separate Window, so the host logger cannot observe its console.
  // Forward a formatted copy to the parent while retaining the iframe's native output.
  const consoleBridge = `<script>(function(){
    var levels = ['debug','info','log','warn','error'];
    function format(value) {
      if (value instanceof Error) return value.stack || value.message;
      if (typeof value === 'string') return value;
      try { return JSON.stringify(value); } catch (_) { return String(value); }
    }
    levels.forEach(function(level) {
      var original = console[level];
      if (typeof original !== 'function') return;
      console[level] = function() {
        try {
          parent.postMessage({ source: '${MINI_APP_CONSOLE_BRIDGE_SOURCE}', level: level,
            args: Array.prototype.map.call(arguments, format) }, '*');
        } catch (_) {}
        return original.apply(console, arguments);
      };
    });
  })();</script>`;
  finalHtml = /<head\b[^>]*>/i.test(finalHtml)
    ? finalHtml.replace(/<head\b[^>]*>/i, (match) => `${match}${consoleBridge}`)
    : `${consoleBridge}${finalHtml}`;

  const iframe = document.createElement('iframe');
  iframe.setAttribute('srcdoc', finalHtml);
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-forms allow-modals allow-downloads');
  iframe.style.width = '100%';
  iframe.style.height = '100%';
  iframe.style.border = '0';
  iframe.style.display = 'block';
  iframe.setAttribute('title', 'mini-app sandbox');
  container.appendChild(iframe);

  const handleMessage = (event: MessageEvent) => {
    if (event.source !== iframe.contentWindow || event.data?.source !== MINI_APP_CONSOLE_BRIDGE_SOURCE) return;
    const level = event.data.level;
    if (!['debug', 'info', 'log', 'warn', 'error'].includes(level)) return;
    const args = Array.isArray(event.data.args) ? event.data.args : [];
    const target = console[level as 'debug' | 'info' | 'log' | 'warn' | 'error'];
    target?.apply(console, args);
  };
  window.addEventListener('message', handleMessage);
  return () => window.removeEventListener('message', handleMessage);
}

function installAgentSpacesUiGlobals() {
  if (agentSpacesUiMountCount === 0) {
    initialAgentSpacesUi = (window as any).AgentSpacesUI;
  }
  agentSpacesUiMountCount++;

  const previous = (window as any).AgentSpacesUI;
  (window as any).AgentSpacesUI = {
    ...AgentSpacesUI,
    ...(previous && typeof previous === 'object' ? previous : {}),
  };

  return () => {
    agentSpacesUiMountCount = Math.max(0, agentSpacesUiMountCount - 1);
    if (agentSpacesUiMountCount > 0) return;
    if (initialAgentSpacesUi === undefined) delete (window as any).AgentSpacesUI;
    else (window as any).AgentSpacesUI = initialAgentSpacesUi;
    initialAgentSpacesUi = undefined;
  };
}

export function MiniAppRenderer({
  type,
  sourceCode,
  onError,
  componentProps,
  className,
  taskEvents,
  files,
  mainFile,
  allowScroll = false,
}: MiniAppRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sandboxCleanupRef = useRef<(() => void) | null>(null);
  const taskEventListenersRef = useRef(new Set<(event: string, data: unknown) => void>());
  const lastDispatchedTaskEventRef = useRef<MiniAppTaskEvent | null>(taskEvents?.at(-1) ?? null);
  const { resolvedTheme } = useTheme();
  const { clearReactRenderer } = useMiniAppReactRenderer({
    enabled: type === 'react',
    containerRef,
    sourceCode,
    onError,
    componentProps,
    files,
    mainFile,
  });

  useEffect(() => installAgentSpacesUiGlobals(), []);

  useEffect(() => {
    const previousAgentSpaces = (window as any).AgentSpaces;
    const previousAgentSpacesApi = (window as any).AgentSpacesAPI;
    const taskEventListeners = taskEventListenersRef.current;
    const api = {
      ...(previousAgentSpaces && typeof previousAgentSpaces === 'object' ? previousAgentSpaces : {}),
      onTaskEvent: (listener: (event: string, data: unknown) => void) => {
        taskEventListeners.add(listener);
        return () => taskEventListeners.delete(listener);
      },
    };
    (window as any).AgentSpaces = api;
    (window as any).AgentSpacesAPI = {
      ...(previousAgentSpacesApi && typeof previousAgentSpacesApi === 'object' ? previousAgentSpacesApi : {}),
      ...api,
    };

    return () => {
      taskEventListeners.clear();
      if (previousAgentSpaces === undefined) delete (window as any).AgentSpaces;
      else (window as any).AgentSpaces = previousAgentSpaces;
      if (previousAgentSpacesApi === undefined) delete (window as any).AgentSpacesAPI;
      else (window as any).AgentSpacesAPI = previousAgentSpacesApi;
    };
  }, []);

  useEffect(() => {
    const pendingEvents = getTaskEventsSince(taskEvents, lastDispatchedTaskEventRef.current);
    for (const taskEvent of pendingEvents) {
      for (const listener of taskEventListenersRef.current) listener(taskEvent.event, taskEvent.data);
    }
    if (taskEvents?.length) lastDispatchedTaskEventRef.current = taskEvents.at(-1) ?? null;
  }, [taskEvents]);

  const renderHtml = useCallback((html: string) => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    sandboxCleanupRef.current?.();
    sandboxCleanupRef.current = null;
    clearReactRenderer();

    // 沙箱分支：检测到 module script 或 importmap 时，用 iframe srcdoc 让浏览器原生解析 ESM/import map。
    // Excalidraw 等需要原生 ESM 的 HTML 项目走此路径；普通 HTML 项目走下方旧逻辑。
    const needsSandbox = /<script[^>]*\btype\s*=\s*["'](?:module|importmap)["'][^>]*>/i.test(html);
    if (needsSandbox) {
      sandboxCleanupRef.current = renderHtmlInSandboxIframe(container, html);
      onError(null);
      return;
    }

    const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
    const scripts: string[] = [];
    const cleanHtml = html.replace(scriptRegex, (_match, content) => {
      scripts.push(content);
      return '';
    });

    container.innerHTML = cleanHtml;

    for (const script of scripts) {
      try {
        const fn = new Function('container', 'props', 'AgentSpacesUI', 'AgentSpaces', 'AgentSpacesAPI', script);
        fn(
          container,
          componentProps || {},
          (window as any).AgentSpacesUI,
          (window as any).AgentSpaces,
          (window as any).AgentSpacesAPI,
        );
      } catch (err: any) {
        onError(`Script error: ${err.message}`);
        return;
      }
    }
    onError(null);
  }, [clearReactRenderer, componentProps, onError]);

  useEffect(() => () => {
    sandboxCleanupRef.current?.();
    sandboxCleanupRef.current = null;
  }, []);

  useEffect(() => {
    if (!sourceCode || type !== 'html') return;
    renderHtml(sourceCode);
  }, [sourceCode, type, renderHtml]);

  return (
    <div
      ref={containerRef}
      className={cn('h-full w-full', allowScroll ? 'overflow-auto' : 'overflow-hidden', resolvedTheme, className)}
      style={{ colorScheme: resolvedTheme }}
    />
  );
}
