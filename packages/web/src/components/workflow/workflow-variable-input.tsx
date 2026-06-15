'use client';

import { useState } from 'react';
import type { OutputField } from '@agent-spaces/shared';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { FIELD_TYPES } from './workflow-properties-utils';
import { WorkflowVariablePicker, type WorkflowVariableContext } from './workflow-variable-picker';

const PURE_VARIABLE_PATTERN = /^\s*\{\{\s*(.*?)\s*\}\}\s*$/;
const NODE_VARIABLE_PATTERN = /^__(?:data|inputs)__\["([^"]+)"\]\.?(.*)$/;
const CONFIG_VARIABLE_PATTERN = /^__config__\["([^"]+)"\]\["([^"]+)"\]$/;
const LOOP_VARIABLE_PATTERN = /^__loop__\.?(.*)$/;

function getVariableExpression(value: string | number): string | null {
  const match = String(value).match(PURE_VARIABLE_PATTERN);
  return match?.[1]?.trim() || null;
}

function normalizeVariableFieldPath(fieldPath: string): string {
  return fieldPath
    .replace(/\["([^"]+)"\]/g, '.$1')
    .replace(/^\./, '')
    .trim();
}

function getVariableBadgeLabel(
  value: string | number,
  variableContext?: WorkflowVariableContext,
): string | null {
  const expression = getVariableExpression(value);
  if (!expression) return null;

  const nodeMatch = expression.match(NODE_VARIABLE_PATTERN);
  if (nodeMatch) {
    const [, nodeId, fieldPath] = nodeMatch;
    const node = variableContext?.nodes.find((item) => item.id === nodeId);
    const nodeLabel = node?.label || nodeId;
    const normalizedFieldPath = normalizeVariableFieldPath(fieldPath);
    return normalizedFieldPath ? `${nodeLabel}.${normalizedFieldPath}` : nodeLabel;
  }

  const configMatch = expression.match(CONFIG_VARIABLE_PATTERN);
  if (configMatch) return `${configMatch[1]}.${configMatch[2]}`;

  const loopMatch = expression.match(LOOP_VARIABLE_PATTERN);
  if (loopMatch) return loopMatch[1] ? `loop.${loopMatch[1]}` : 'loop';

  return expression;
}

export function VariableBadgeInput({
  value,
  readOnly,
  placeholder,
  variableContext,
  onClear,
  showClear = true,
  className,
  badgeClassName,
}: {
  value: string | number;
  readOnly: boolean;
  placeholder?: string;
  variableContext?: WorkflowVariableContext;
  onClear: () => void;
  showClear?: boolean;
  className?: string;
  badgeClassName?: string;
}) {
  const label = getVariableBadgeLabel(value, variableContext);

  if (!label) return null;

  return (
    <div
      data-slot="input-group-control"
      className={cn('flex min-w-0 flex-1 items-center px-2', className)}
      title={String(value)}
    >
      <Badge
        variant="secondary"
        className={cn('h-5 max-w-full gap-1 rounded px-1.5 py-0 font-mono text-[10px]', badgeClassName)}
      >
        <span className="min-w-0 truncate">{label}</span>
        {showClear ? (
          <button
            type="button"
            aria-label={`Clear ${placeholder ?? 'variable'}`}
            className="shrink-0 rounded-sm p-0.5 text-muted-foreground hover:bg-background/80 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
            disabled={readOnly}
            onClick={onClear}
          >
            <X className="h-2.5 w-2.5" />
          </button>
        ) : null}
      </Badge>
    </div>
  );
}

export function WorkflowVariableInput({
  value,
  readOnly = false,
  placeholder,
  variableContext,
  showTypeFilter = false,
  typeFilter,
  groupClassName = 'h-7 rounded-md',
  inputClassName = 'text-xs',
  onChange,
  onSelectVariable,
}: {
  value: string | number;
  readOnly?: boolean;
  placeholder?: string;
  variableContext?: WorkflowVariableContext;
  showTypeFilter?: boolean;
  typeFilter?: OutputField['type'];
  groupClassName?: string;
  inputClassName?: string;
  onChange: (value: string) => void;
  onSelectVariable?: (path: string) => void;
}) {
  const [variableTypeFilter, setVariableTypeFilter] = useState<OutputField['type']>('any');
  const [isEditing, setIsEditing] = useState(false);
  const variableBadgeLabel = isEditing ? null : getVariableBadgeLabel(value, variableContext);
  const selectVariable = onSelectVariable ?? onChange;

  return (
    <InputGroup className={groupClassName}>
      {variableBadgeLabel ? (
        <VariableBadgeInput
          value={value}
          readOnly={readOnly}
          placeholder={placeholder}
          variableContext={variableContext}
          onClear={() => onChange('')}
        />
      ) : (
        <InputGroupInput
          value={value}
          readOnly={readOnly}
          placeholder={placeholder}
          className={inputClassName}
          onFocus={() => setIsEditing(true)}
          onBlur={() => setIsEditing(false)}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {showTypeFilter && (
        <Select
          value={variableTypeFilter}
          onValueChange={(type) => setVariableTypeFilter(type as OutputField['type'])}
        >
          <SelectTrigger size="sm" className="h-6 w-20 shrink-0 rounded-none border-y-0 border-r-0 px-2 py-0 text-[11px] [&_svg]:size-3">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FIELD_TYPES.map(type => (
              <SelectItem key={type} value={type} className="text-[11px]">{type}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {variableContext?.currentNodeId && (
        <InputGroupAddon align="inline-end">
          <WorkflowVariablePicker
            {...variableContext}
            typeFilter={showTypeFilter ? variableTypeFilter : typeFilter}
            onSelect={selectVariable}
          />
        </InputGroupAddon>
      )}
    </InputGroup>
  );
}
