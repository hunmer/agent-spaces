'use client';

import type { WorkflowNode } from '@agent-spaces/shared';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Import, FileDown, RotateCcw } from 'lucide-react';
import { getOutputFields, toOutputFields } from './workflow-properties-utils';
import type { DebugResult, JsonPreset } from './workflow-properties-utils';
import { OutputFieldsEditor } from './workflow-properties-fields';
import type { WorkflowVariableContext } from './workflow-variable-picker';
import { getNodeDefinition } from '@/lib/workflow-nodes';

interface InputFieldsSectionProps {
  node: WorkflowNode;
  data: Record<string, unknown>;
  variableContext: WorkflowVariableContext | undefined;
  onDataChange: (key: string, value: unknown) => void;
}

interface OutputFieldsSectionProps {
  node: WorkflowNode;
  data: Record<string, unknown>;
  variableContext: WorkflowVariableContext | undefined;
  selectedJsonPreset: JsonPreset | null;
  debugResult: DebugResult | null;
  hasDebugOutput: boolean;
  onDataChange: (key: string, value: unknown) => void;
  onOpenImport: () => void;
}

export function InputFieldsSection({
  node,
  data,
  variableContext,
  onDataChange,
}: InputFieldsSectionProps) {
  const t = useTranslations('workflows');

  return (
    <section id="input-fields-section" className="mt-2 space-y-2">
      <div className="text-xs font-medium text-muted-foreground">
        {node.type === 'sub_workflow' ? t('properties.startNodeInput') : t('properties.inputFields')}
      </div>
      <OutputFieldsEditor
        key={`input-fields-${node.id}`}
        value={getOutputFields(data.inputFields)}
        onChange={(value) => onDataChange('inputFields', value)}
        variableContext={variableContext}
        allowedFieldTypes={getNodeDefinition(node.type)?.allowedInputFieldTypes}
        showRequired
      />
    </section>
  );
}

export function OutputFieldsSection({
  node,
  data,
  variableContext,
  selectedJsonPreset,
  debugResult,
  hasDebugOutput,
  onDataChange,
  onOpenImport,
}: OutputFieldsSectionProps) {
  const t = useTranslations('workflows');

  return (
    <section id="output-fields-section" className="flex flex-1 flex-col gap-2">
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">{t('properties.outputFields')}</span>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
            onClick={onOpenImport}
          >
            <Import className="h-3 w-3" />
            {t('properties.import')}
          </Button>
          {selectedJsonPreset && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
              onClick={() => onDataChange('outputs', toOutputFields(selectedJsonPreset.outputs))}
            >
              <FileDown className="h-3 w-3" />
              {t('properties.applyPreset')}
            </Button>
          )}
          {hasDebugOutput && debugResult?.output !== undefined && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
              onClick={() => onDataChange('outputs', toOutputFields(debugResult.output))}
            >
              <FileDown className="h-3 w-3" />
              {t('properties.applyTestOutput')}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
            onClick={() => {
              const defaults = getNodeDefinition(node.type)?.outputs;
              if (defaults) onDataChange('outputs', defaults);
            }}
          >
            <RotateCcw className="h-3 w-3" />
            {t('properties.reset')}
          </Button>
        </div>
      </div>
      <OutputFieldsEditor
        key={`output-fields-${node.id}`}
        value={getOutputFields(data.outputs)}
        onChange={(value) => onDataChange('outputs', value)}
        variableContext={variableContext}
        outputPreviewEnabled={data.outputPreviewEnabled !== false}
        onOutputPreviewEnabledChange={(enabled) => onDataChange('outputPreviewEnabled', enabled)}
      />
    </section>
  );
}
