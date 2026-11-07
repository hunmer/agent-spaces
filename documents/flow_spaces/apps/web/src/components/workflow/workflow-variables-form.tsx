'use client';

import type { OutputField, WorkflowEdge, WorkflowNode } from '@agent-spaces/shared';
import { useTranslations } from 'next-intl';
import { ScrollArea } from '@/components/ui/scroll-area';
import { OutputFieldsEditor } from './workflow-properties-fields';
import type { WorkflowFieldKeyRenameParams } from './workflow-properties-io-sections';

function getOldFieldPath(oldKey: string, newKey: string, newPath: string) {
  if (newPath === newKey) return oldKey;
  const suffix = `.${newKey}`;
  if (!newPath.endsWith(suffix)) return oldKey;
  return `${newPath.slice(0, -suffix.length)}.${oldKey}`;
}

export function WorkflowVariablesForm({
  value,
  onChange,
  nodes,
  edges,
  currentNodeId,
  enabledPlugins,
  variables,
  onFieldKeyRename,
}: {
  value: OutputField[];
  onChange: (value: OutputField[]) => void;
  nodes?: WorkflowNode[];
  edges?: WorkflowEdge[];
  currentNodeId?: string | null;
  enabledPlugins?: string[];
  variables?: OutputField[];
  onFieldKeyRename?: (params: WorkflowFieldKeyRenameParams) => void;
}) {
  const t = useTranslations("workflows");
    return (
    <ScrollArea className="h-full">
      <div className="space-y-3 p-3">
        <div>
          <h3 className="text-sm font-medium">{t('editor.variables')}</h3>
        </div>
        <OutputFieldsEditor
          value={value}
          onChange={onChange}
          variableContext={nodes && edges ? {
            nodes,
            edges,
            currentNodeId,
            enabledPlugins,
            variables,
          } : undefined}
          showRequired
          onFieldKeyChange={(oldKey, newKey, newPath) => onFieldKeyRename?.({
            scope: 'env',
            oldPath: getOldFieldPath(oldKey, newKey, newPath),
            newPath,
          })}
        />
      </div>
    </ScrollArea>
  );
}
