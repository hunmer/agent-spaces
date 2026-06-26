'use client';

import { memo, useMemo, useCallback } from 'react';
import type { NodeProperty } from '@agent-spaces/shared';
import { Braces, ChevronRight, Info } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTriggerAsChild } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { getPropertyValue } from './workflow-properties-utils';
import { PropertyField } from './workflow-properties-fields';
import { useDynamicOptions } from './workflow-dynamic-options';
import type { WorkflowVariableContext } from './workflow-variable-picker';
import { getWorkflowFieldHandleId } from './workflow-field-handles';
import type { WorkflowFieldKeyRenameParams } from './workflow-properties-io-sections';

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
  workspaceId?: string;
  dropTargetNodeId?: string;
  onFieldKeyRename?: (params: WorkflowFieldKeyRenameParams) => void;
}

function getOldFieldPath(oldKey: string, newKey: string, newPath: string) {
  if (newPath === newKey) return oldKey;
  const suffix = `.${newKey}`;
  if (!newPath.endsWith(suffix)) return oldKey;
  return `${newPath.slice(0, -suffix.length)}.${oldKey}`;
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
  workspaceId,
  dropTargetNodeId,
  onFieldKeyRename,
}: PropertiesListProps) {
  // Cascade reset: when a dependency source (e.g. databaseId) changes, clear the
  // dependent keys (table -> '', columns -> '*') so stale values never survive a
  // dependency switch. Branches cleanly when no dynamic dependency is involved.
  const handleDataChange = useCallback((key: string, value: unknown) => {
    onDataChange(key, value);
    for (const p of properties) {
      const cfg = p.dynamicOptions;
      if (!cfg) continue;
      if (cfg.dependsOn !== key) continue;
      // `key` is the dependency source of property `p` — `p` itself is now stale.
      onDataChange(p.key, p.type === 'select' && cfg.source === 'sqlite-columns' ? '*' : '');
      // table key chain: if this property is the table that columns depend on, clear columns too.
      if (cfg.source === 'sqlite-tables') {
        const tableKey = p.key;
        for (const col of properties) {
          if (col.dynamicOptions?.source === 'sqlite-columns' && col.dynamicOptions.dependsOnTableKey === tableKey) {
            onDataChange(col.key, '*');
          }
        }
      }
    }
  }, [properties, onDataChange]);

  return (
    <section id="properties-section" className="">
      {properties.map((prop) => {
        const value = getPropertyValue(prop, data);
        return (
          <PropertyItem
            key={prop.key}
            prop={prop}
            value={value}
            data={data}
            isPreview={isPreview}
            collapsed={collapsedKeys.has(prop.key)}
            collapsedKeys={collapsedKeys}
            onCollapsedChange={onCollapsedChange}
            variableContext={variableContext}
            variableMode={isVariableModeActive(prop.key, value)}
            onToggleVariableMode={onToggleVariableMode}
            toVariableInputValue={toVariableInputValue}
            onInsertVariable={onInsertVariable}
            onDataChange={handleDataChange}
            onPreviewDataChange={onPreviewDataChange}
            workspaceId={workspaceId}
            dropTargetNodeId={dropTargetNodeId}
            onFieldKeyRename={onFieldKeyRename}
          />
        );
      })}
    </section>
  );
}

const PropertyItem = memo(function PropertyItem({
  prop,
  value,
  data,
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
  workspaceId,
  dropTargetNodeId,
  onFieldKeyRename,
}: {
  prop: NodeProperty;
  value: unknown;
  data: Record<string, unknown>;
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
  workspaceId?: string;
  dropTargetNodeId?: string;
  onFieldKeyRename?: (params: WorkflowFieldKeyRenameParams) => void;
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
      data-workflow-node-id={dropTargetNodeId}
      data-workflow-handle-id={dropTargetNodeId ? getWorkflowFieldHandleId('property', prop.key) : undefined}
      data-workflow-handle-type={dropTargetNodeId ? 'target' : undefined}
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
        {prop.dynamicOptions && prop.type === 'select' && !effectiveVariableMode ? (
          <DynamicSelectField
            prop={prop}
            value={value}
            data={data}
            isPreview={isPreview}
            variableContext={variableContext}
            onDataChange={onDataChange}
            onPreviewDataChange={onPreviewDataChange}
            onInsertVariable={onInsertVariable}
            workspaceId={workspaceId}
            onFieldKeyRename={onFieldKeyRename}
            dropTargetNodeId={dropTargetNodeId}
          />
        ) : (
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
            workspaceId={workspaceId}
            onFieldKeyChange={(oldKey, newKey, newPath) => {
              if (!dropTargetNodeId) return;
              const params = {
                scope: 'data',
                nodeId: dropTargetNodeId,
                oldPath: getOldFieldPath(oldKey, newKey, newPath),
                newPath,
              } as const;
              console.debug('[FIELD-KEY-RENAME][PropertiesList]', {
                propKey: prop.key,
                params,
              });
              onFieldKeyRename?.(params);
            }}
          />
        )}
      </CollapsibleContent>
    </Collapsible>
  );
});

/**
 * Renders a select field whose options are loaded asynchronously from the
 * backend (sqlite tables/columns) based on sibling field values.
 *
 * Exists as a dedicated child component so `useDynamicOptions` is called
 * unconditionally at the top level of a component — React hooks rules forbid
 * calling hooks inside the `.map()` callback in `PropertiesList` or inside a
 * conditional branch of `PropertyItem`.
 */
function DynamicSelectField({
  prop,
  value,
  data,
  isPreview,
  variableContext,
  onDataChange,
  onPreviewDataChange,
  onInsertVariable,
  workspaceId,
  onFieldKeyRename,
  dropTargetNodeId,
}: {
  prop: NodeProperty;
  value: unknown;
  data: Record<string, unknown>;
  isPreview: boolean;
  variableContext: WorkflowVariableContext | undefined;
  onDataChange: (key: string, value: unknown) => void;
  onPreviewDataChange?: (key: string, value: unknown) => void;
  onInsertVariable: (key: string, path: string) => void;
  workspaceId?: string;
  onFieldKeyRename?: (params: WorkflowFieldKeyRenameParams) => void;
  dropTargetNodeId?: string;
}) {
  const { options, loading } = useDynamicOptions(prop.dynamicOptions, data);
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1">
        <PropertyField
          prop={{ ...prop, options }}
          value={value}
          onChange={(nextValue) => onDataChange(prop.key, nextValue)}
          onPreviewChange={(nextValue) => onPreviewDataChange?.(prop.key, nextValue)}
          previewMode={isPreview}
          variableContext={variableContext}
          variableMode={false}
          variableValue={String(value ?? '')}
          onInsertVariable={(path) => onInsertVariable(prop.key, path)}
          workspaceId={workspaceId}
          onFieldKeyChange={(oldKey, newKey, newPath) => {
            if (!dropTargetNodeId) return;
            const params = {
              scope: 'data',
              nodeId: dropTargetNodeId,
              oldPath: getOldFieldPath(oldKey, newKey, newPath),
              newPath,
            } as const;
            console.debug('[FIELD-KEY-RENAME][DynamicSelectField]', {
              propKey: prop.key,
              params,
            });
            onFieldKeyRename?.(params);
          }}
        />
      </div>
      {loading && (
        <span className="shrink-0 text-[10px] text-muted-foreground animate-pulse">…</span>
      )}
    </div>
  );
}
