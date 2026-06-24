'use client';

import { Button } from '@/components/ui/button';
import { GripVertical, Plus, X } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { CONDITION_OPERATORS, NO_VALUE_OPERATORS } from '@/lib/workflow-nodes';
import { useTranslations } from 'next-intl';
import { isPlainObject } from './workflow-properties-utils';
import type { WorkflowVariableContext } from './workflow-variable-picker';
import { WorkflowVariableInput } from './workflow-variable-input';

const LENGTH_COMPARE_OPERATORS = new Set([
  'greater_than',
  'greater_than_or_equal',
  'less_than',
  'less_than_or_equal',
]);

export function ConditionsEditor({
  value,
  onChange,
  variableContext,
}: {
  value: unknown;
  onChange: (v: Record<string, unknown>[]) => void;
  variableContext?: WorkflowVariableContext;
}) {
  const t = useTranslations('workflows');
  const conditions = Array.isArray(value) ? value.filter(isPlainObject) : [];
  const updateCondition = (index: number, patch: Record<string, unknown>) => {
    const next = [...conditions];
    next[index] = { ...next[index], ...patch };
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {conditions.map((condition, index) => {
        const compareMode = condition.compareMode === 'length' ? 'length' : 'value';
        const operator = String(
          compareMode === 'length' && !LENGTH_COMPARE_OPERATORS.has(String(condition.operator ?? ''))
            ? 'greater_than'
            : (condition.operator ?? 'equals'),
        );
        const variable = String(condition.variable ?? condition.field ?? '');
        const operatorOptions = compareMode === 'length'
          ? CONDITION_OPERATORS.filter(option => LENGTH_COMPARE_OPERATORS.has(option.value))
          : CONDITION_OPERATORS;
        return (
          <div key={index} className="group/cond relative space-y-1.5 rounded border p-2">
            <div className="flex items-center gap-1">
              <GripVertical className="h-3 w-3 shrink-0 text-muted-foreground/50" />
              <span className="w-7 shrink-0 text-[10px] text-muted-foreground">条件 {index + 1}</span>
              <WorkflowVariableInput
                value={variable}
                placeholder="变量"
                variableContext={variableContext}
                groupClassName="min-h-6 h-auto min-w-0 flex-1 rounded-md"
                inputClassName="text-[11px]"
                onChange={(nextValue) => updateCondition(index, { variable: nextValue, field: nextValue })}
                onSelectVariable={(path) => updateCondition(index, { variable: path, field: path })}
              />
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={compareMode}
                onValueChange={(nextCompareMode) => updateCondition(index, {
                  compareMode: nextCompareMode,
                  operator: nextCompareMode === 'length' && !LENGTH_COMPARE_OPERATORS.has(operator)
                    ? 'greater_than'
                    : operator,
                })}
              >
                <SelectTrigger className="h-6 flex-1 text-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="value" className="text-xs">
                    {t('nodes.switch.props.compareMode.value')}
                  </SelectItem>
                  <SelectItem value="length" className="text-xs">
                    {t('nodes.switch.props.compareMode.length')}
                  </SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={operator}
                onValueChange={(nextOperator) => updateCondition(index, { operator: nextOperator })}
              >
                <SelectTrigger className="h-6 flex-1 text-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {operatorOptions.map(option => (
                    <SelectItem key={option.value} value={option.value} className="text-xs">
                      {t(`nodes.${option.label}` as Parameters<typeof t>[0])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!NO_VALUE_OPERATORS.has(operator) && (
              <WorkflowVariableInput
                value={String(condition.value ?? '')}
                placeholder="比较值"
                variableContext={variableContext}
                groupClassName="min-h-6 h-auto rounded-md"
                inputClassName="text-[11px]"
                onChange={(nextValue) => updateCondition(index, { value: nextValue })}
                onSelectVariable={(path) => updateCondition(index, { value: path })}
              />
            )}
            <button
              type="button"
              className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 transition-opacity group-hover/cond:opacity-100"
              onClick={() => onChange(conditions.filter((_, i) => i !== index))}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </div>
        );
      })}
      <Button
        variant="outline"
        size="sm"
        className="h-7 w-full gap-1 text-xs"
        onClick={() => onChange([...conditions, {
          id: `cond_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          variable: '',
          field: '',
          compareMode: 'value',
          operator: 'equals',
          value: '',
        }])}
      >
        <Plus className="h-3.5 w-3.5" />
        添加条件
      </Button>
    </div>
  );
}
