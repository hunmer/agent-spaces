'use client';

import { useState } from 'react';
import type { ArrayFieldItem, NodeProperty } from '@agent-spaces/shared';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Braces, Plus, Trash2 } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { isPlainObject, getOutputFields } from './workflow-properties-utils';
import type { WorkflowVariableContext } from './workflow-variable-picker';
import { WorkflowVariableInput } from './workflow-variable-input';
import { OutputFieldsEditor } from './workflow-fields-output';
import { useDeferredInputDraft } from './workflow-fields-debounced';
import { getWorkflowFieldHandleId } from './workflow-field-handles';

export function ArrayFieldEditor({
  prop,
  value,
  onChange,
  variableContext,
  onFieldKeyChange,
  dropTargetNodeId,
}: {
  prop: NodeProperty;
  value: unknown;
  onChange: (v: Record<string, unknown>[]) => void;
  variableContext?: WorkflowVariableContext;
  onFieldKeyChange?: (oldKey: string, newKey: string, fieldPath: string) => void;
  dropTargetNodeId?: string;
}) {
  const items = Array.isArray(value) ? value.filter(isPlainObject) : [];
  const fields = prop.fields ?? [];
  const [variableModeEnabled, setVariableModeEnabled] = useState<Set<string>>(() => new Set());
  const [variableModeDisabled, setVariableModeDisabled] = useState<Set<string>>(() => new Set());

  const updateItem = (index: number, key: string, nextValue: unknown) => {
    const next = [...items];
    next[index] = { ...next[index], [key]: nextValue };
    onChange(next);
  };

  const fieldModeKey = (index: number, key: string) => `${prop.key}.${index}.${key}`;
  const isVariableRef = (nextValue: unknown) => typeof nextValue === 'string' && nextValue.includes('{{');
  const isVariableModeActive = (key: string, nextValue: unknown) => {
    if (variableModeDisabled.has(key)) return false;
    return isVariableRef(nextValue) || variableModeEnabled.has(key);
  };
  const toggleVariableMode = (key: string, nextValue: unknown) => {
    if (isVariableModeActive(key, nextValue)) {
      setVariableModeEnabled((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
      setVariableModeDisabled((current) => new Set(current).add(key));
    } else {
      setVariableModeDisabled((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
      setVariableModeEnabled((current) => new Set(current).add(key));
    }
  };
  const clearDisabledOverride = (key: string) => {
    if (!variableModeDisabled.has(key)) return;
    setVariableModeDisabled((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
  };
  const toVariableInputValue = (nextValue: unknown): string | number => {
    if (typeof nextValue === 'string' || typeof nextValue === 'number') return nextValue;
    if (typeof nextValue === 'boolean') return String(nextValue);
    return '';
  };
  const updateArrayItemField = (index: number, key: string, nextValue: unknown) => {
    updateItem(index, key, nextValue);
  };
  const insertArrayVariable = (index: number, key: string, path: string) => {
    clearDisabledOverride(fieldModeKey(index, key));
    updateArrayItemField(index, key, path);
  };

  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={index} className="group/item relative space-y-1.5 rounded border bg-muted/30 p-2">
          <button
            type="button"
            className="absolute right-1 top-1 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover/item:opacity-100"
            onClick={() => onChange(items.filter((_, i) => i !== index))}
          >
            <Trash2 className="h-3 w-3" />
          </button>
          {fields.map(field => (
            <div
              key={field.key}
              className="space-y-0.5"
              data-workflow-node-id={dropTargetNodeId}
              data-workflow-handle-id={dropTargetNodeId ? getWorkflowFieldHandleId('property', `${prop.key}[${index}].${field.key}`) : undefined}
              data-workflow-handle-type={dropTargetNodeId ? 'target' : undefined}
            >
              <div className="flex items-center gap-1 pr-5">
                <Label className="flex-1 text-[10px] text-muted-foreground">{field.label}</Label>
                <button
                  type="button"
                  className={`rounded p-0.5 transition-colors hover:bg-accent ${isVariableModeActive(fieldModeKey(index, field.key), item[field.key]) ? 'text-primary' : 'text-muted-foreground'}`}
                  title="切换变量模式"
                  onClick={() => toggleVariableMode(fieldModeKey(index, field.key), item[field.key])}
                >
                  <Braces className="h-3 w-3" />
                </button>
              </div>
              <ArrayItemField
                field={field}
                value={item[field.key] ?? field.default}
                onChange={(nextValue) => updateArrayItemField(index, field.key, nextValue)}
                variableMode={isVariableModeActive(fieldModeKey(index, field.key), item[field.key])}
                variableValue={toVariableInputValue(item[field.key])}
                variableContext={variableContext}
                onInsertVariable={(path) => insertArrayVariable(index, field.key, path)}
                parentFieldPath={`${prop.key}[${index}].${field.key}`}
                onFieldKeyChange={onFieldKeyChange}
              />
            </div>
          ))}
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        className="h-7 w-full gap-1 text-xs"
        onClick={() => onChange([...items, { ...(prop.itemTemplate ?? {}), id: Date.now() }])}
      >
        <Plus className="h-3.5 w-3.5" />
        添加项目
      </Button>
    </div>
  );
}

export function ArrayItemField({
  field,
  value,
  onChange,
  variableMode = false,
  variableValue = '',
  variableContext,
  onInsertVariable,
  parentFieldPath,
  onFieldKeyChange,
}: {
  field: ArrayFieldItem;
  value: unknown;
  onChange: (v: unknown) => void;
  variableMode?: boolean;
  variableValue?: string | number;
  variableContext?: WorkflowVariableContext;
  onInsertVariable?: (path: string) => void;
  parentFieldPath?: string;
  onFieldKeyChange?: (oldKey: string, newKey: string, fieldPath: string) => void;
}) {
  const { draft, inputProps } = useDeferredInputDraft(
    String(value ?? ''),
    (nextValue) => onChange(field.type === 'number' ? Number(nextValue) : nextValue),
  );

  if (variableMode) {
    return (
      <WorkflowVariableInput
        value={variableValue}
        placeholder={field.placeholder || field.label}
        variableContext={variableContext}
        showTypeFilter
        groupClassName="min-h-6 h-auto rounded-md"
        inputClassName="text-[11px]"
        onChange={(nextValue) => onChange(nextValue)}
        onSelectVariable={onInsertVariable}
      />
    );
  }

  if (field.type === 'select') {
    return (
      <Select value={String(value ?? field.default ?? '')} onValueChange={onChange}>
        <SelectTrigger className="h-7 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {field.options?.map(option => (
            <SelectItem key={option.value} value={option.value} className="text-xs">{option.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (field.type === 'checkbox') {
    return (
      <Switch
        size="sm"
        checked={Boolean(value)}
        onCheckedChange={onChange}
      />
    );
  }

  if (field.type === 'output_fields') {
    return (
      <OutputFieldsEditor
        value={getOutputFields(value)}
        onChange={onChange}
        variableContext={variableContext}
        parentFieldPath={parentFieldPath}
        onFieldKeyChange={onFieldKeyChange}
      />
    );
  }

  return (
    <Input
      {...inputProps}
      type={field.type === 'number' ? 'number' : 'text'}
      value={draft}
      placeholder={field.placeholder}
      className="h-6 text-[11px]"
    />
  );
}
