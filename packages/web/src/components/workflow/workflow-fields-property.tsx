'use client';

import type { NodeProperty } from '@agent-spaces/shared';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { getOutputFields } from './workflow-properties-utils';
import type { WorkflowVariableContext } from './workflow-variable-picker';
import { WorkflowVariableInput } from './workflow-variable-input';
import { OutputFieldsEditor } from './workflow-fields-output';
import { ConditionsEditor } from './workflow-fields-conditions';
import { ArrayFieldEditor } from './workflow-fields-array';
import {
  DebouncedTextInput,
  DebouncedTextarea,
  DebouncedNumberInput,
} from './workflow-fields-debounced';
import { AgentPropertyEditor } from './workflow-fields-agent';
import { CodePropertyEditor } from './workflow-fields-code';
import { SqliteDatabasePicker } from './workflow-fields-sqlite';
import { KnowledgeBasePicker } from './workflow-fields-knowledge-base';

export function PropertyField({
  prop,
  value,
  onChange,
  onPreviewChange,
  previewMode = false,
  variableContext,
  variableMode = false,
  variableValue = '',
  onInsertVariable,
  workspaceId,
}: {
  prop: NodeProperty;
  value: unknown;
  onChange: (v: unknown) => void;
  onPreviewChange?: (v: unknown) => void;
  previewMode?: boolean;
  variableContext?: WorkflowVariableContext;
  variableMode?: boolean;
  variableValue?: string | number;
  onInsertVariable?: (path: string) => void;
  workspaceId?: string;
}) {
  const disabled = Boolean(prop.readonly);

  if (variableMode) {
    return (
      <WorkflowVariableInput
        value={variableValue}
        readOnly={disabled}
        placeholder={prop.label}
        variableContext={variableContext}
        onChange={(nextValue) => onChange(nextValue)}
        onSelectVariable={onInsertVariable}
      />
    );
  }

  switch (prop.type) {
    case 'text':
      return (
        <DebouncedTextInput
          value={String(value ?? '')}
          onChange={onChange}
          placeholder={prop.tooltip}
          disabled={disabled}
          className="h-7 text-xs"
        />
      );

    case 'textarea':
      return (
        <DebouncedTextarea
          value={String(value ?? '')}
          onChange={onChange}
          placeholder={prop.tooltip}
          disabled={disabled}
          className="min-h-[72px] text-xs"
        />
      );

    case 'number':
      return (
        <DebouncedNumberInput
          value={String(value ?? '')}
          onChange={(nextValue) => onChange(nextValue === '' ? undefined : Number(nextValue))}
          disabled={disabled}
          className="h-7 text-xs"
        />
      );

    case 'select':
      return (
        <Select
          value={String(value ?? prop.default ?? '')}
          onValueChange={onChange}
          disabled={disabled}
        >
          <SelectTrigger className="h-7 text-xs w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {prop.options?.map(option => (
              <SelectItem key={option.value} value={option.value} className="text-xs">
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case 'checkbox':
      return (
        <Switch
          size="sm"
          checked={Boolean(value)}
          disabled={disabled}
          onCheckedChange={onChange}
        />
      );

    case 'code':
      return (
        <CodePropertyEditor
          label={prop.label}
          language={(prop as unknown as Record<string, unknown>).language as string || 'javascript'}
          value={String(value ?? '')}
          disabled={disabled}
          onChange={(nextValue) => onChange(nextValue)}
        />
      );

    case 'output_fields':
      return <OutputFieldsEditor value={getOutputFields(value)} onChange={onChange} variableContext={variableContext} />;

    case 'conditions':
      return <ConditionsEditor value={value} onChange={onChange} variableContext={variableContext} />;

    case 'array':
      return <ArrayFieldEditor prop={prop} value={value} onChange={onChange} variableContext={variableContext} />;

    case 'agent':
      return (
        <AgentPropertyEditor
          value={value}
          disabled={disabled}
          onChange={onChange}
        />
      );

    case 'sqlite':
      return <SqliteDatabasePicker value={String(value ?? '')} onChange={(v) => onChange(v)} />;

    case 'knowledge-base':
      return <KnowledgeBasePicker value={String(value ?? '')} workspaceId={workspaceId} onChange={(v) => onChange(v)} />;

    default:
      return (
        <DebouncedTextInput
          value={String(value ?? '')}
          onChange={onChange}
          disabled={disabled}
          className="h-7 text-xs"
        />
      );
  }
}
