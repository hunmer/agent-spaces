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

interface RenderErrorBoundaryProps {
  onError: (error: string | null) => void;
  children?: React.ReactNode;
}

interface RenderErrorBoundaryState {
  error: Error | null;
  errorDetail: string;
}

class RenderErrorBoundary extends ReactComponent<RenderErrorBoundaryProps, RenderErrorBoundaryState> {
  state: RenderErrorBoundaryState = { error: null, errorDetail: '' };

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

type MiniAppRootRecord = {
  root: ReactDOM.Root;
  unmountTimer: ReturnType<typeof setTimeout> | null;
};

const miniAppRootRecords = new WeakMap<HTMLDivElement, MiniAppRootRecord>();

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

export function unmountMiniAppReactRoot(container: HTMLDivElement) {
  const record = miniAppRootRecords.get(container);
  if (!record) return;
  if (record.unmountTimer) {
    clearTimeout(record.unmountTimer);
    record.unmountTimer = null;
  }
  miniAppRootRecords.delete(container);
  try { record.root.unmount(); } catch { /* ignore */ }
}

function scheduleMiniAppReactRootUnmount(container: HTMLDivElement) {
  const record = miniAppRootRecords.get(container);
  if (!record || record.unmountTimer) return;
  record.unmountTimer = setTimeout(() => {
    if (miniAppRootRecords.get(container) !== record) return;
    record.unmountTimer = null;
    unmountMiniAppReactRoot(container);
  }, 0);
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

interface UseMiniAppReactRendererOptions {
  enabled: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  sourceCode: string;
  onError: (error: string | null) => void;
  componentProps?: Record<string, unknown>;
  files?: Record<string, string>;
  mainFile?: string;
}

export function useMiniAppReactRenderer({
  enabled,
  containerRef,
  sourceCode,
  onError,
  componentProps,
  files,
  mainFile,
}: UseMiniAppReactRendererOptions) {
  const reactComponentRef = useRef<React.ComponentType<Record<string, unknown>> | null>(null);
  const componentPropsRef = useRef<Record<string, unknown> | undefined>(componentProps);
  const filesRef = useRef<Record<string, string>>(files || {});
  const mainFileRef = useRef<string>(mainFile || 'index.jsx');

  useEffect(() => { componentPropsRef.current = componentProps; }, [componentProps]);
  useEffect(() => { filesRef.current = files || {}; }, [files]);
  useEffect(() => { mainFileRef.current = mainFile || 'index.jsx'; }, [mainFile]);

  useEffect(() => {
    const container = containerRef.current;
    return () => {
      if (container) scheduleMiniAppReactRootUnmount(container);
    };
  }, [containerRef]);

  const renderCompiledReact = useCallback(() => {
    const container = containerRef.current;
    const Component = reactComponentRef.current;
    if (!container || !Component) return;

    const root = getMiniAppRoot(container);
    root.render(
      React.createElement(RenderErrorBoundary, { onError },
        React.createElement(Component, componentPropsRef.current)
      )
    );
    onError(null);
  }, [containerRef, onError]);

  const compileReact = useCallback((code: string) => {
    if (!containerRef.current) return;

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Babel = require('@babel/standalone');
      const localFiles = filesRef.current;
      const entryFile = mainFileRef.current;
      const moduleCache = new Map<string, { exports: Record<string, any> }>();

      function resolveLocalPath(fromFile: string, importId: string): string | null {
        if (!importId.startsWith('.')) return null;

        const dir = fromFile.includes('/') ? fromFile.substring(0, fromFile.lastIndexOf('/')) : '';
        let resolved = dir ? `${dir}/${importId}` : importId;
        const parts = resolved.split('/');
        const normalized: string[] = [];
        for (const part of parts) {
          if (part === '' || part === '.') continue;
          if (part === '..') { normalized.pop(); continue; }
          normalized.push(part);
        }
        resolved = normalized.join('/');

        if (localFiles[resolved] !== undefined) return resolved;
        for (const ext of ['.jsx', '.js', '.tsx', '.ts']) {
          const withExt = resolved + ext;
          if (localFiles[withExt] !== undefined) return withExt;
        }
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

      reactComponentRef.current = Component as React.ComponentType<Record<string, unknown>>;
      renderCompiledReact();
      onError(null);
    } catch (err: any) {
      onError(err.message || String(err));
    }
  }, [containerRef, onError, renderCompiledReact]);

  useEffect(() => {
    if (!enabled || !sourceCode) return;
    compileReact(sourceCode);
  }, [enabled, sourceCode, compileReact]);

  useEffect(() => {
    if (!enabled) return;
    renderCompiledReact();
  }, [enabled, componentProps, renderCompiledReact]);

  return {
    clearReactRenderer: useCallback(() => {
      const container = containerRef.current;
      if (container) unmountMiniAppReactRoot(container);
      reactComponentRef.current = null;
    }, [containerRef]),
  };
}
