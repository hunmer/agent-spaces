/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { Component as ReactComponent, useCallback, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import useEmblaCarousel from 'embla-carousel-react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import * as AgentSpacesUI from '@/lib/ui-exports';
import { cn } from '@/lib/utils';
import { useTheme } from '@/components/layout/theme-provider';

export type MiniAppRenderType = 'react' | 'html';

interface ErrorBoundaryProps {
  onError: (error: string | null) => void;
  children?: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
  errorDetail: string;
}

class RenderErrorBoundary extends ReactComponent<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, errorDetail: '' };

  static getDerivedStateFromError(error: Error) {
    return { error, errorDetail: error.stack || error.message };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({
      errorDetail: `${error.toString()}\n\nComponent stack:${errorInfo.componentStack}`,
    });
  }

  render() {
    if (this.state.error) {
      const handleCopy = () => navigator.clipboard?.writeText(this.state.errorDetail);
      return (
        <div className="flex flex-col items-center justify-center h-full text-destructive text-sm gap-2">
          <div className="flex items-start gap-2 max-w-full">
            <p className="break-all">{this.state.error.message}</p>
            <button
              type="button"
              onClick={handleCopy}
              className="shrink-0 p-1 rounded hover:bg-destructive/10 text-destructive/70 hover:text-destructive transition-colors"
              title="复制完整错误信息"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
              </svg>
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

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
}

export interface MiniAppTaskEvent {
  event: string;
  data: unknown;
  timestamp?: string;
}

type MiniAppRootRecord = {
  root: ReactDOM.Root;
  unmountTimer: ReturnType<typeof setTimeout> | null;
};

const miniAppRootRecords = new WeakMap<HTMLDivElement, MiniAppRootRecord>();

let agentSpacesUiMountCount = 0;
let initialAgentSpacesUi: unknown;

function getMiniAppRoot(container: HTMLDivElement): ReactDOM.Root {
  const existing = miniAppRootRecords.get(container);
  if (existing) {
    if (existing.unmountTimer) {
      clearTimeout(existing.unmountTimer);
      existing.unmountTimer = null;
    }
    return existing.root;
  }

  const record: MiniAppRootRecord = {
    root: ReactDOM.createRoot(container),
    unmountTimer: null,
  };
  miniAppRootRecords.set(container, record);
  return record.root;
}

function unmountMiniAppRoot(container: HTMLDivElement) {
  const record = miniAppRootRecords.get(container);
  if (!record) return;
  if (record.unmountTimer) {
    clearTimeout(record.unmountTimer);
    record.unmountTimer = null;
  }
  miniAppRootRecords.delete(container);
  try { record.root.unmount(); } catch { /* ignore */ }
}

function scheduleMiniAppRootUnmount(container: HTMLDivElement) {
  const record = miniAppRootRecords.get(container);
  if (!record || record.unmountTimer) return;
  record.unmountTimer = setTimeout(() => {
    if (miniAppRootRecords.get(container) !== record) return;
    record.unmountTimer = null;
    unmountMiniAppRoot(container);
  }, 0);
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

function resolveExternalModule(id: string) {
  if (id === 'react') return React;
  if (id === 'react-dom' || id === 'react-dom/client') return ReactDOM;
  if (id === 'embla-carousel-react') {
    return { __esModule: true, default: useEmblaCarousel };
  }
  if (id === '@dnd-kit/core') {
    return {
      __esModule: true,
      DndContext,
      closestCenter,
      PointerSensor,
      KeyboardSensor,
      useSensor,
      useSensors,
    };
  }
  if (id === '@dnd-kit/sortable') {
    return {
      __esModule: true,
      SortableContext,
      useSortable,
      arrayMove,
      verticalListSortingStrategy,
      sortableKeyboardCoordinates,
    };
  }
  if (id === '@dnd-kit/utilities') {
    return { __esModule: true, CSS };
  }
  if (id === '@agent-spaces/ui') {
    return { __esModule: true, ...AgentSpacesUI };
  }
  return undefined;
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
}: MiniAppRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<ReactDOM.Root | null>(null);
  const filesRef = useRef<Record<string, string>>(files || {});
  const mainFileRef = useRef<string>(mainFile || 'index.jsx');
  const taskEventListenersRef = useRef(new Set<(event: string, data: unknown) => void>());
  const { resolvedTheme } = useTheme();

  // Keep refs in sync — renderer reads them during compile, avoiding stale closures
  useEffect(() => { filesRef.current = files || {}; }, [files]);
  useEffect(() => { mainFileRef.current = mainFile || 'index.jsx'; }, [mainFile]);

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
    const latest = taskEvents?.at(-1);
    if (!latest) return;
    for (const listener of taskEventListenersRef.current) listener(latest.event, latest.data);
  }, [taskEvents]);

  // Cleanup on unmount only — scheduled outside React's render phase
  useEffect(() => {
    const container = containerRef.current;
    return () => {
      rootRef.current = null;
      if (container) scheduleMiniAppRootUnmount(container);
    };
  }, []);

  const renderReact = useCallback((code: string) => {
    if (!containerRef.current) return;

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Babel = require('@babel/standalone');
      const localFiles = filesRef.current;
      const entryFile = mainFileRef.current;

      // --- Local module resolution ---
      const moduleCache = new Map<string, { exports: Record<string, any> }>();

      function resolveLocalPath(fromFile: string, importId: string): string | null {
        if (!importId.startsWith('.')) return null;

        const dir = fromFile.includes('/') ? fromFile.substring(0, fromFile.lastIndexOf('/')) : '';
        let resolved = dir ? `${dir}/${importId}` : importId;

        // Normalize ./ and ../
        const parts = resolved.split('/');
        const normalized: string[] = [];
        for (const part of parts) {
          if (part === '' || part === '.') continue;
          if (part === '..') { normalized.pop(); continue; }
          normalized.push(part);
        }
        resolved = normalized.join('/');

        // Exact match
        if (localFiles[resolved] !== undefined) return resolved;
        // Try extensions
        for (const ext of ['.jsx', '.js', '.tsx', '.ts']) {
          const withExt = resolved + ext;
          if (localFiles[withExt] !== undefined) return withExt;
        }
        // Try index files
        for (const ext of ['.jsx', '.js']) {
          const idx = resolved + '/index' + ext;
          if (localFiles[idx] !== undefined) return idx;
        }

        return null;
      }

      function compileModule(filePath: string): Record<string, any> {
        const cached = moduleCache.get(filePath);
        if (cached) return cached.exports;

        const modExports: Record<string, any> = {};
        moduleCache.set(filePath, { exports: modExports });

        const source = localFiles[filePath];
        if (source === undefined) throw new Error(`Module not found: ${filePath}`);

        const compiled = Babel.transform(source, {
          presets: ['react'],
          plugins: ['transform-modules-commonjs'],
          filename: filePath,
          sourceType: 'module',
        }).code;

        const localRequire = (id: string) => {
          const externalModule = resolveExternalModule(id);
          if (externalModule !== undefined) return externalModule;
          const resolved = resolveLocalPath(filePath, id);
          if (resolved) return compileModule(resolved);
          return undefined;
        };

        const fn = new Function('React', 'ReactDOM', 'exports', 'require', compiled!);
        fn(React, ReactDOM, modExports, localRequire);
        return modExports;
      }

      // --- Compile entry point (sourceCode) ---
      const moduleExports: Record<string, any> = {};

      const mainRequire = (id: string) => {
        const externalModule = resolveExternalModule(id);
        if (externalModule !== undefined) return externalModule;
        const resolved = resolveLocalPath(entryFile, id);
        if (resolved) return compileModule(resolved);
        return undefined;
      };

      const compiled = Babel.transform(code, {
        presets: ['react'],
        plugins: ['transform-modules-commonjs'],
        filename: entryFile,
        sourceType: 'module',
      }).code;

      const fn = new Function('React', 'ReactDOM', 'exports', 'require', compiled!);
      fn(React, ReactDOM, moduleExports, mainRequire);

      const Component = moduleExports.default;
      if (!Component) {
        onError('React custom view must export a default component.');
        return;
      }

      // Reuse an existing root for the same container, including StrictMode remounts.
      rootRef.current = getMiniAppRoot(containerRef.current);
      rootRef.current.render(
        React.createElement(RenderErrorBoundary, { onError },
          React.createElement(Component, componentProps)
        )
      );
      onError(null);
    } catch (err: any) {
      onError(err.message || String(err));
    }
  }, [componentProps, onError]);

  const renderHtml = useCallback((html: string) => {
    if (!containerRef.current) return;

    // Destroy react root before HTML mode takes over the container
    const container = containerRef.current;
    unmountMiniAppRoot(container);
    rootRef.current = null;
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
  }, [componentProps, onError]);

  useEffect(() => {
    if (!sourceCode) return;
    if (type === 'react') renderReact(sourceCode);
    else renderHtml(sourceCode);
  }, [sourceCode, type, renderReact, renderHtml]);

  return (
    <div
      ref={containerRef}
      className={cn('h-full w-full overflow-hidden', resolvedTheme, className)}
      style={{ colorScheme: resolvedTheme }}
    />
  );
}
