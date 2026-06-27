'use client';

import { useState } from 'react';
import type { NodeProperty } from '@agent-spaces/shared';
import { Check, ChevronDown } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
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
  onPreviewChange: _onPreviewChange,
  previewMode: _previewMode = false,
  variableContext,
  variableMode = false,
  variableValue = '',
  onInsertVariable,
  workspaceId,
  onFieldKeyChange,
  dropTargetNodeId,
  usePopoverSelect = false,
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
  onFieldKeyChange?: (oldKey: string, newKey: string, fieldPath: string) => void;
  dropTargetNodeId?: string;
  usePopoverSelect?: boolean;
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
      if (usePopoverSelect) {
        return (
          <PropertyInputPopoverSelect
            prop={prop}
            value={value}
            disabled={disabled}
            onChange={onChange}
          />
        );
      }

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
      return (
        <OutputFieldsEditor
          value={getOutputFields(value)}
          onChange={onChange}
          variableContext={variableContext}
          parentFieldPath={prop.key}
          onFieldKeyChange={onFieldKeyChange}
        />
      );

    case 'conditions':
      return <ConditionsEditor value={value} onChange={onChange} variableContext={variableContext} />;

    case 'array':
      return <ArrayFieldEditor prop={prop} value={value} onChange={onChange} variableContext={variableContext} onFieldKeyChange={onFieldKeyChange} dropTargetNodeId={dropTargetNodeId} usePopoverSelect={usePopoverSelect} />;

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

function PropertyInputPopoverSelect({
  prop,
  value,
  disabled,
  onChange,
}: {
  prop: NodeProperty;
  value: unknown;
  disabled: boolean;
  onChange: (v: unknown) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedValue = String(value ?? prop.default ?? '');
  const selectedOption = prop.options?.find(option => option.value === selectedValue);
  const selectedLabel = selectedOption?.label ?? selectedValue;

  const selectValue = (nextValue: string) => {
    onChange(nextValue);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={(
          <button
            type="button"
            disabled={disabled}
            className={cn(
              'flex h-7 w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent px-2.5 text-left text-xs outline-none transition-colors hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50',
              !selectedLabel && 'text-muted-foreground',
            )}
          >
            <span className="min-w-0 flex-1 truncate">{selectedLabel || prop.label}</span>
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          </button>
        )}
      />
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={4}
        className="max-h-(--available-height) w-(--anchor-width) min-w-36 gap-0 overflow-y-auto p-1"
      >
        {prop.options?.map(option => (
          <button
            key={option.value}
            type="button"
            className={cn(
              'flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs outline-none hover:bg-accent hover:text-accent-foreground',
              selectedValue === option.value && 'bg-accent/70',
            )}
            onClick={() => selectValue(option.value)}
          >
            <span className="flex size-4 shrink-0 items-center justify-center">
              {selectedValue === option.value ? <Check className="size-3" /> : null}
            </span>
            <span className="min-w-0 flex-1 truncate">{option.label}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
