'use client';

import { memo, useMemo } from 'react';
import type { NodeProperty } from '@agent-spaces/shared';
import { Braces, ChevronRight, Info } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTriggerAsChild } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { getPropertyValue } from './workflow-properties-utils';
import { PropertyField } from './workflow-properties-fields';
import type { WorkflowVariableContext } from './workflow-variable-picker';

interface PropertiesListProps {
  properties: NodeProperty[];
  data: Record<string, unknown>;
  isPreview?: boolean;
  collapsedKeys: Set<string>;
  onCollapsedChange: (keys: Set<string>) => void;
  variableContext: WorkflowVariableContext | undefined;
  isVariableModeActive: (key: string, value: unknown) => boolean;
  onToggleVariableMode: (key: string, value: unknown) => void;
  toVariableInputValue: (value: unknown) => string | number;
  onInsertVariable: (key: string, path: string) => void;
  onDataChange: (key: string, value: unknown) => void;
  onPreviewDataChange?: (key: string, value: unknown) => void;
}

export function PropertiesList({
  properties,
  data,
  isPreview = false,
  collapsedKeys,
  onCollapsedChange,
  variableContext,
  isVariableModeActive,
  onToggleVariableMode,
  toVariableInputValue,
  onInsertVariable,
  onDataChange,
  onPreviewDataChange,
}: PropertiesListProps) {
  return (
    <section id="properties-section" className="">
      {properties.map((prop) => {
        const value = getPropertyValue(prop, data);
        return (
          <PropertyItem
            key={prop.key}
            prop={prop}
            value={value}
            isPreview={isPreview}
            collapsed={collapsedKeys.has(prop.key)}
            collapsedKeys={collapsedKeys}
            onCollapsedChange={onCollapsedChange}
            variableContext={variableContext}
            variableMode={isVariableModeActive(prop.key, value)}
            onToggleVariableMode={onToggleVariableMode}
            toVariableInputValue={toVariableInputValue}
            onInsertVariable={onInsertVariable}
            onDataChange={onDataChange}
            onPreviewDataChange={onPreviewDataChange}
          />
        );
      })}
    </section>
  );
}

const PropertyItem = memo(function PropertyItem({
  prop,
  value,
  isPreview,
  collapsed,
  collapsedKeys,
  onCollapsedChange,
  variableContext,
  variableMode,
  onToggleVariableMode,
  toVariableInputValue,
  onInsertVariable,
  onDataChange,
  onPreviewDataChange,
}: {
  prop: NodeProperty;
  value: unknown;
  isPreview: boolean;
  collapsed: boolean;
  collapsedKeys: Set<string>;
  onCollapsedChange: (keys: Set<string>) => void;
  variableContext: WorkflowVariableContext | undefined;
  variableMode: boolean;
  onToggleVariableMode: (key: string, value: unknown) => void;
  toVariableInputValue: (value: unknown) => string | number;
  onInsertVariable: (key: string, path: string) => void;
  onDataChange: (key: string, value: unknown) => void;
  onPreviewDataChange?: (key: string, value: unknown) => void;
}) {
  const variableValue = useMemo(() => toVariableInputValue(value), [toVariableInputValue, value]);
  const variableOnly = prop.inputMode === 'variable';
  const effectiveVariableMode = variableOnly || variableMode;

  return (
    <Collapsible
      open={!collapsed}
      onOpenChange={(open) => {
        const next = new Set(collapsedKeys);
        if (open) next.delete(prop.key);
        else next.add(prop.key);
        onCollapsedChange(next);
      }}
      className="mt-2"
    >
      <div className="flex items-center gap-1 text-xs font-medium">
        <CollapsibleTriggerAsChild>
          <button
            type="button"
            className="flex flex-1 items-center gap-1 rounded px-0.5 text-left transition-colors hover:bg-accent/50"
          >
            <ChevronRight
              className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform ${!collapsed ? 'rotate-90' : ''}`}
            />
            <span className="truncate">{prop.label}</span>
            {prop.required && <span className="text-destructive">*</span>}
          </button>
        </CollapsibleTriggerAsChild>
        {prop.tooltip && (
          <TooltipProvider delay={300}>
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-3 w-3 shrink-0 cursor-help text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-[240px]">
                <p>{prop.tooltip}</p>
                <p className="mt-0.5 text-[10px] opacity-60">类型: {prop.type}{prop.dataType && prop.dataType !== 'string' ? ` → ${prop.dataType}` : ''}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {!variableOnly && (
          <button
            type="button"
            className={`rounded p-0.5 transition-colors hover:bg-accent ${effectiveVariableMode ? 'text-primary' : 'text-muted-foreground'}`}
            title="切换变量模式"
            onClick={() => onToggleVariableMode(prop.key, value)}
          >
            <Braces className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <CollapsibleContent>
        <PropertyField
          prop={prop}
          value={value}
          onChange={(nextValue) => onDataChange(prop.key, nextValue)}
          onPreviewChange={(nextValue) => onPreviewDataChange?.(prop.key, nextValue)}
          previewMode={isPreview}
          variableContext={variableContext}
          variableMode={effectiveVariableMode}
          variableValue={variableValue}
          onInsertVariable={(path) => onInsertVariable(prop.key, path)}
        />
      </CollapsibleContent>
    </Collapsible>
  );
});
