'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams, type ReadonlyURLSearchParams } from 'next/navigation';
import { sdk } from '@/lib/sdk';
import type { MiniAppProject } from '@agent-spaces/sdk';
import { MiniAppPreview } from '@/components/mini-apps/mini-app-preview';
import { useMiniAppHostApi } from '@/components/mini-apps/use-mini-app-host-api';
import { Loader2 } from 'lucide-react';

const MINI_APP_RUNTIME_INIT_SOURCE = 'agent-spaces:mini-app-runtime:init';
const MINI_APP_RUNTIME_EVENT = 'agent-spaces:mini-app-runtime';
const MINI_APP_RUNTIME_READY_SOURCE = 'agent-spaces:mini-app-runtime:ready';

type MiniAppRuntimeContext = {
  route: string;
  params: Record<string, unknown>;
};

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

  const host = useMiniAppHostApi(projectId, runtimeContext);

  const loadProject = useCallback(async () => {
    try {
      const p = await sdk.miniApp.get(projectId);
      setProject(p);

      // Load ALL files for multi-file import resolution
      const tree = await sdk.miniApp.getFileTree(projectId);
      const files: Record<string, string> = {};
      for (const file of tree) {
        try {
          const { content } = await sdk.miniApp.readFile(projectId, file);
          files[file] = content;
        } catch { /* skip */ }
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
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== window.parent) return;
      const data = event.data;
      if (!data || data.source !== MINI_APP_RUNTIME_INIT_SOURCE) return;
      console.debug('[mini-app-preview] received runtime init', data);
      setRuntimeContext({
        route: typeof data.route === 'string' && data.route.trim() ? data.route : '/',
        params: data.params && typeof data.params === 'object' && !Array.isArray(data.params)
          ? data.params as Record<string, unknown>
          : {},
      });
    };

    window.addEventListener('message', handleMessage);
    window.parent?.postMessage({
      source: MINI_APP_RUNTIME_READY_SOURCE,
      projectId,
      currentRuntimeContext: runtimeContext,
    }, '*');
    console.debug('[mini-app-preview] runtime listener ready', { projectId, runtimeContext });
    return () => window.removeEventListener('message', handleMessage);
  }, [projectId, runtimeContext]);

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
          enabledPlugins={project.enabledPlugins}
          enableAgents={project.enableAgents}
          files={allFiles}
          mainFile={project.mainFile}
          allowScroll={embedded}
        />
      </div>
    </div>
  );
}
