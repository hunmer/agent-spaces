/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useRef } from 'react';
import * as AgentSpacesUI from '@/lib/ui-exports';
import { cn } from '@/lib/utils';
import { useTheme } from '@/components/layout/theme-provider';
import { useMiniAppReactRenderer } from './react-renderer';

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
  const taskEventListenersRef = useRef(new Set<(event: string, data: unknown) => void>());
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
    const latest = taskEvents?.at(-1);
    if (!latest) return;
    for (const listener of taskEventListenersRef.current) listener(latest.event, latest.data);
  }, [taskEvents]);

  const renderHtml = useCallback((html: string) => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    clearReactRenderer();
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
