'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { sdk } from '@/lib/sdk';
import type { MiniAppProject } from '@agent-spaces/sdk';
import { MiniAppPreview } from '@/components/mini-apps/mini-app-preview';
import { useMiniAppHostApi } from '@/components/mini-apps/use-mini-app-host-api';
import { Loader2 } from 'lucide-react';

export default function MiniAppPreviewPageClient() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const embedded = searchParams.get('embedded') === '1';
  const [project, setProject] = useState<MiniAppProject | null>(null);
  const [sourceCode, setSourceCode] = useState('');
  const [allFiles, setAllFiles] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const host = useMiniAppHostApi(params.id);

  const loadProject = useCallback(async () => {
    try {
      const p = await sdk.miniApp.get(params.id);
      setProject(p);

      // Load ALL files for multi-file import resolution
      const tree = await sdk.miniApp.getFileTree(params.id);
      const files: Record<string, string> = {};
      for (const file of tree) {
        try {
          const { content } = await sdk.miniApp.readFile(params.id, file);
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
    } catch (err: any) {
      setError(err.message || 'Failed to load project');
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => { loadProject(); }, [loadProject]);

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
    <div className="h-screen flex flex-col overflow-hidden">
      {host}
      <div className="flex-1 min-h-0 overflow-hidden">
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
        />
      </div>
    </div>
  );
}
