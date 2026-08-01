'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams, type ReadonlyURLSearchParams } from 'next/navigation';
import { sdk } from '@/lib/sdk';
import type { MiniAppProject } from '@agent-spaces/sdk';
import { MiniAppPreview } from '@/components/mini-apps/mini-app-preview';
import { useMiniAppHostApi } from '@/components/mini-apps/use-mini-app-host-api';
import { isSkippableAsset } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

const MINI_APP_RUNTIME_INIT_SOURCE = 'agent-spaces:mini-app-runtime:init';
const MINI_APP_RUNTIME_EVENT = 'agent-spaces:mini-app-runtime';
const MINI_APP_RUNTIME_READY_SOURCE = 'agent-spaces:mini-app-runtime:ready';

type MiniAppRuntimeContext = {
  route: string;
  params: Record<string, unknown>;
};

function runtimeContextEquals(a: MiniAppRuntimeContext, b: MiniAppRuntimeContext): boolean {
  return a.route === b.route && JSON.stringify(a.params) === JSON.stringify(b.params);
}

function decodeRouteParam(value: string) {
  try { return decodeURIComponent(value); }
  catch { return value; }
}

function parseRuntimeParams(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function readRuntimeContextFromSearchParams(searchParams: ReadonlyURLSearchParams): MiniAppRuntimeContext {
  return {
    route: searchParams.get('route') || '/',
    params: parseRuntimeParams(searchParams.get('payload')),
  };
}

export default function MiniAppPreviewPageClient() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const queryProjectId = searchParams.get('id');
  const routeProjectId = params.id ? decodeRouteParam(params.id) : '';
  const projectId = queryProjectId || routeProjectId;
  const embedded = searchParams.get('embedded') === '1';
  const [project, setProject] = useState<MiniAppProject | null>(null);
  const [sourceCode, setSourceCode] = useState('');
  const [allFiles, setAllFiles] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [runtimeContext, setRuntimeContext] = useState<MiniAppRuntimeContext>(() => readRuntimeContextFromSearchParams(searchParams));
  const runtimeContextRef = useRef<MiniAppRuntimeContext>(runtimeContext);

  const host = useMiniAppHostApi(projectId, runtimeContext);

  const loadProject = useCallback(async (onProgress?: (loaded: number, total: number) => void) => {
    try {
      const p = await sdk.miniApp.get(projectId);
      setProject(p);

      // Load ALL files for multi-file import resolution.
      // 跳过二进制/资源文件：这些不会被源码 import 解析，utf-8 读取无意义，
      // 且会在初始化时触发大体积 fetch（如 vendor/pixelorama-web/index.wasm 38MB、index.pck 12MB）。
      // 运行时资源（iframe 加载的 wasm/glb、fetch+eval 的 vendor js）按需懒加载，无需预读。
      const tree = await sdk.miniApp.getFileTree(projectId);
      onProgress?.(0, tree.length);
      const files: Record<string, string> = {};
      let loaded = 0;
      for (const file of tree) {
        if (isSkippableAsset(file)) continue;
        try {
          const { content } = await sdk.miniApp.readFile(projectId, file);
          files[file] = content;
        } catch { /* skip */ }
        loaded += 1;
        onProgress?.(loaded, tree.length);
      }
      setAllFiles(files);

      // mainFile 在 tree 里找不到通常是导入时多余的顶层目录没剥掉
      // （源码落在 src/<wrapper>/src/... 而 mainFile 是裸文件名）。
      // 不静默 fallback 到 tree[0]，否则会渲染错误入口，模块解析全乱。
      const mainFile = tree.find(f => f === p.mainFile);
      if (!mainFile) {
        setError(
          `入口文件 ${p.mainFile} 未找到。项目文件树:\n${tree.slice(0, 20).join('\n')}` +
          (tree.length > 20 ? `\n... (共 ${tree.length} 个文件)` : ''),
        );
        return;
      }
      setSourceCode(files[mainFile] || '');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load project');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { loadProject(); }, [loadProject]);

  useEffect(() => {
    runtimeContextRef.current = runtimeContext;
  }, [runtimeContext]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== window.parent) return;
      const data = event.data;
      if (!data || data.source !== MINI_APP_RUNTIME_INIT_SOURCE) return;
      console.debug('[mini-app-preview] received runtime init', data);
      const nextRuntimeContext = {
        route: typeof data.route === 'string' && data.route.trim() ? data.route : '/',
        params: data.params && typeof data.params === 'object' && !Array.isArray(data.params)
          ? data.params as Record<string, unknown>
          : {},
      };
      if (runtimeContextEquals(runtimeContextRef.current, nextRuntimeContext)) {
        console.debug('[mini-app-preview] runtime init unchanged, skip update', nextRuntimeContext);
        return;
      }
      setRuntimeContext(nextRuntimeContext);
    };

    window.addEventListener('message', handleMessage);
    window.parent?.postMessage({
      source: MINI_APP_RUNTIME_READY_SOURCE,
      projectId,
      currentRuntimeContext: runtimeContextRef.current,
    }, '*');
    console.debug('[mini-app-preview] runtime listener ready', { projectId, runtimeContext: runtimeContextRef.current });
    return () => window.removeEventListener('message', handleMessage);
  }, [projectId]);

  useEffect(() => {
    (window as typeof window & { __AGENT_SPACES_MINIAPP_RUNTIME__?: MiniAppRuntimeContext }).__AGENT_SPACES_MINIAPP_RUNTIME__ = runtimeContext;
    console.debug('[mini-app-preview] broadcast runtime context', runtimeContext);
    window.dispatchEvent(new CustomEvent(MINI_APP_RUNTIME_EVENT, { detail: runtimeContext }));
  }, [runtimeContext]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!project) {
    return <div className="flex items-center justify-center h-screen text-muted-foreground">Project not found</div>;
  }

  return (
    <div className={`h-screen flex flex-col ${embedded ? 'overflow-auto' : 'overflow-hidden'}`}>
      {host}
      <div className={`flex-1 min-h-0 ${embedded ? 'overflow-auto' : 'overflow-hidden'}`}>
        <MiniAppPreview
          type={project.type}
          sourceCode={sourceCode}
          error={error}
          onError={setError}
          projectId={project.id}
          projectName={project.name}
          hideHeader={embedded}
          onReload={loadProject}
          enabledPlugins={project.enabledPlugins}
          enableAgents={project.enableAgents}
          devices={project.devices}
          files={allFiles}
          mainFile={project.mainFile}
          allowScroll={embedded}
        />
      </div>
    </div>
  );
}
