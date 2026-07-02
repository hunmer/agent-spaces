'use client';

import type { ConditionGroup, ConditionItem } from '@agent-spaces/shared';
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

type ConditionDraft = ConditionItem & {
  field?: string;
  compareMode?: 'value' | 'length';
};

type ConditionGroupDraft = {
  id: string;
  joiner?: 'and' | 'or';
  conditions: ConditionDraft[];
};

const LENGTH_COMPARE_OPERATORS = new Set([
  'greater_than',
  'greater_than_or_equal',
  'less_than',
  'less_than_or_equal',
]);

function createConditionItem(): ConditionItem {
  return {
    id: `cond_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    variable: '',
    compareMode: 'value',
    operator: 'equals',
    value: '',
  };
}

function createConditionGroup(): ConditionGroup {
  return {
    id: `group_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    joiner: 'and',
    conditions: [createConditionItem()],
  };
}

function normalizeConditionGroups(value: unknown): ConditionGroupDraft[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isPlainObject)
    .map<ConditionGroupDraft>((item, index) => {
      if (Array.isArray(item.conditions)) {
        return {
          id: typeof item.id === 'string' ? item.id : `group_${index}`,
          joiner: item.joiner === 'or' ? 'or' : 'and',
          conditions: item.conditions
            .filter(isPlainObject)
            .map<ConditionDraft>((condition, conditionIndex) => ({
              id: typeof condition.id === 'string' ? condition.id : `cond_${index}_${conditionIndex}`,
              variable: String(condition.variable ?? condition.field ?? ''),
              field: String(condition.field ?? condition.variable ?? ''),
              compareMode: condition.compareMode === 'length' ? 'length' : 'value',
              operator: String(condition.operator ?? 'equals'),
              value: String(condition.value ?? ''),
            })),
        };
      }

      return {
        id: typeof item.id === 'string' ? item.id : `group_${index}`,
        joiner: 'and',
        conditions: [{
          id: typeof item.id === 'string' ? item.id : `cond_${index}`,
          variable: String(item.variable ?? item.field ?? ''),
          field: String(item.field ?? item.variable ?? ''),
          compareMode: item.compareMode === 'length' ? 'length' : 'value',
          operator: String(item.operator ?? 'equals'),
          value: String(item.value ?? ''),
        }],
      };
    })
    .filter(group => Array.isArray(group.conditions) && group.conditions.length > 0);
}

export function ConditionsEditor({
  value,
  onChange,
  variableContext,
}: {
  value: unknown;
  onChange: (v: ConditionGroupDraft[]) => void;
  variableContext?: WorkflowVariableContext;
}) {
  const t = useTranslations('workflows');
  const conditionGroups = normalizeConditionGroups(value);

  const updateGroup = (groupIndex: number, patch: Partial<ConditionGroupDraft>) => {
    const next = [...conditionGroups];
    next[groupIndex] = { ...next[groupIndex], ...patch };
    onChange(next);
  };

  const updateCondition = (groupIndex: number, conditionIndex: number, patch: Partial<ConditionDraft>) => {
    const group = conditionGroups[groupIndex];
    const groupConditions = Array.isArray(group?.conditions) ? group.conditions.filter(isPlainObject) : [];
    const nextConditions = [...groupConditions];
    nextConditions[conditionIndex] = { ...nextConditions[conditionIndex], ...patch };
    updateGroup(groupIndex, { conditions: nextConditions });
  };

  return (
    <div className="space-y-2">
      {conditionGroups.map((group, groupIndex) => {
        const groupConditions = Array.isArray(group.conditions) ? group.conditions.filter(isPlainObject) : [];
        const joiner = group.joiner === 'or' ? 'or' : 'and';

        return (
          <div key={String(group.id ?? groupIndex)} className="group/branch relative space-y-2 rounded border p-2">
            <div className="flex items-center gap-1">
              <GripVertical className="h-3 w-3 shrink-0 text-muted-foreground/50" />
              <span className="text-[10px] text-muted-foreground">分支 {groupIndex + 1}</span>
            </div>

            <div className="space-y-2">
              {groupConditions.map((condition, conditionIndex) => {
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
                  <div key={String(condition.id ?? conditionIndex)} className="relative space-y-1.5 rounded border border-dashed p-2">
                    {conditionIndex > 0 ? (
                      <Select
                        value={joiner}
                        onValueChange={(nextJoiner) => updateGroup(groupIndex, { joiner: (nextJoiner === 'or' ? 'or' : 'and') })}
                      >
                        <SelectTrigger className="h-6 w-20 text-[11px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="and" className="text-xs">AND</SelectItem>
                          <SelectItem value="or" className="text-xs">OR</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : null}

                    <div className="flex items-center gap-1">
                      <span className="w-12 shrink-0 text-[10px] text-muted-foreground">条件 {conditionIndex + 1}</span>
                      <WorkflowVariableInput
                        value={variable}
                        placeholder="变量"
                        variableContext={variableContext}
                        groupClassName="min-h-6 h-auto min-w-0 flex-1 rounded-md"
                        inputClassName="text-[11px]"
                        onChange={(nextValue) => updateCondition(groupIndex, conditionIndex, { variable: nextValue, field: nextValue })}
                        onSelectVariable={(path) => updateCondition(groupIndex, conditionIndex, { variable: path, field: path })}
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <Select
                        value={compareMode}
                        onValueChange={(nextCompareMode) => updateCondition(groupIndex, conditionIndex, {
                          compareMode: nextCompareMode === 'length' ? 'length' : 'value',
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
                        onValueChange={(nextOperator) => updateCondition(groupIndex, conditionIndex, { operator: nextOperator ?? 'equals' })}
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
                        onChange={(nextValue) => updateCondition(groupIndex, conditionIndex, { value: nextValue })}
                        onSelectVariable={(path) => updateCondition(groupIndex, conditionIndex, { value: path })}
                      />
                    )}

                    <button
                      type="button"
                      className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 transition-opacity group-hover/branch:opacity-100"
                      onClick={() => updateGroup(groupIndex, {
                        conditions: groupConditions.filter((_, index) => index !== conditionIndex),
                      })}
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                );
              })}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 w-full gap-1 text-xs"
              onClick={() => updateGroup(groupIndex, {
                conditions: [...groupConditions, createConditionItem()],
              })}
            >
              <Plus className="h-3.5 w-3.5" />
              添加条件
            </Button>

            <button
              type="button"
              className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 transition-opacity group-hover/branch:opacity-100"
              onClick={() => onChange(conditionGroups.filter((_, index) => index !== groupIndex))}
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
        onClick={() => onChange([...conditionGroups, createConditionGroup()])}
      >
        <Plus className="h-3.5 w-3.5" />
        添加分支
      </Button>
    </div>
  );
}
