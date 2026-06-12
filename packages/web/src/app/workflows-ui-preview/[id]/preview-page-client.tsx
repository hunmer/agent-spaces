'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { sdk } from '@/lib/sdk';
import type { WorkflowUiProject } from '@agent-spaces/sdk';
import { WorkflowUiPreview } from '@/components/workflows-ui/workflow-ui-preview';
import { useWorkflowUiHostApi } from '@/components/workflows-ui/use-workflow-ui-host-api';
import { Loader2 } from 'lucide-react';

export default function WorkflowUiPreviewPageClient() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const embedded = searchParams.get('embedded') === '1';
  const [project, setProject] = useState<WorkflowUiProject | null>(null);
  const [sourceCode, setSourceCode] = useState('');
  const [allFiles, setAllFiles] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useWorkflowUiHostApi(params.id);

  const loadProject = useCallback(async () => {
    try {
      const p = await sdk.workflowUi.get(params.id);
      setProject(p);

      // Load ALL files for multi-file import resolution
      const tree = await sdk.workflowUi.getFileTree(params.id);
      const files: Record<string, string> = {};
      for (const file of tree) {
        try {
          const { content } = await sdk.workflowUi.readFile(params.id, file);
          files[file] = content;
        } catch { /* skip */ }
      }
      setAllFiles(files);

      const mainFile = tree.find(f => f === p.mainFile) ?? tree[0];
      if (mainFile) {
        setSourceCode(files[mainFile] || '');
      }
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
    <div className="h-screen flex flex-col">
      <div className="flex-1 min-h-0">
        <WorkflowUiPreview
          type={project.type}
          sourceCode={sourceCode}
          error={error}
          onError={setError}
          projectId={project.id}
          projectName={project.name}
          hideHeader={embedded}
          enabledPlugins={project.enabledPlugins}
          files={allFiles}
          mainFile={project.mainFile}
        />
      </div>
    </div>
  );
}
