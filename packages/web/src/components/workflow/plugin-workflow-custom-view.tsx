'use client';

import { useMemo, useState } from 'react';
import { MiniAppRenderer, type MiniAppRenderType } from '@/components/mini-apps/mini-app-renderer';
import { cn } from '@/lib/utils';
import type { WorkflowCustomViewProps } from './workflow-node-types';

export type PluginWorkflowCustomViewDefinition = {
  type?: MiniAppRenderType;
  sourceCode?: string;
  html?: string;
  react?: string;
};

interface PluginWorkflowCustomViewProps extends WorkflowCustomViewProps {
  view: PluginWorkflowCustomViewDefinition;
}

export function isPluginWorkflowCustomViewDefinition(input: unknown): input is PluginWorkflowCustomViewDefinition {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  const view = input as Record<string, unknown>;
  return typeof view.sourceCode === 'string'
    || typeof view.html === 'string'
    || typeof view.react === 'string';
}

export function PluginWorkflowCustomView({ nodeId, data, view }: PluginWorkflowCustomViewProps) {
  const [error, setError] = useState<string | null>(null);
  const type: MiniAppRenderType = view.type === 'html' ? 'html' : 'react';
  const sourceCode = type === 'html'
    ? (view.sourceCode || view.html || '')
    : (view.sourceCode || view.react || '');
  const componentProps = useMemo(() => ({ nodeId, data }), [nodeId, data]);

  return (
    <div className="h-full w-full">
      {error ? (
        <div className="absolute inset-x-1 top-1 z-10 max-h-16 overflow-auto rounded border border-destructive/30 bg-background/95 px-2 py-1 text-[10px] font-mono text-destructive shadow-sm">
          {error}
        </div>
      ) : null}
      <MiniAppRenderer
        type={type}
        sourceCode={sourceCode}
        onError={setError}
        componentProps={componentProps}
        className={cn('nodrag nopan', error && 'pt-12')}
      />
    </div>
  );
}
