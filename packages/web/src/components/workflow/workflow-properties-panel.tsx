'use client';

import { useCallback, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useLocalizedNodeDefinition } from '@/lib/workflow-nodes';
import type { ExecutionLog, OutputField, WorkflowEdge, WorkflowNode } from '@agent-spaces/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Copy, Image as ImageIcon, Save, X } from 'lucide-react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Toggle } from '@/components/ui/toggle';
import { copyToClipboard } from '@/lib/utils';
import {
  getOutputFields,
  getJsonPresets,
  isVisible,
  JSON_PRESETS_KEY,
  SELECTED_JSON_PRESET_KEY,
  TEMP_DEBUG_PRESET_ID,
  isPlainObject,
} from './workflow-properties-utils';
import type { DebugResult, JsonPreset } from './workflow-properties-utils';
import { JsonPreview } from './workflow-properties-fields';
import type { WorkflowVariableContext } from './workflow-variable-picker';
import { ExecutionNodeDialog } from './workflow-execution-node-dialog';
import { NodeHeader } from './workflow-properties-node-header';
import { Toolbar } from './workflow-properties-toolbar';
import { PropertiesList } from './workflow-properties-list';
import { InputFieldsSection, OutputFieldsSection } from './workflow-properties-io-sections';
import { ImportDialog } from './workflow-properties-import-dialog';
import { PresetDialog } from './workflow-properties-preset-dialog';

interface PropertiesPanelProps {
  node: WorkflowNode | null;
  isPreview?: boolean;
  nodes?: WorkflowNode[];
  edges?: WorkflowEdge[];
  variableContextWorkflow?: {
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    enabledPlugins?: string[];
    variables?: OutputField[];
  } | null;
  enabledPlugins?: string[];
  variables?: OutputField[];
  onUpdateData: (nodeId: string, data: Record<string, unknown>) => void;
  onPreviewUpdateData?: (nodeId: string, data: Record<string, unknown>) => void;
  debugNodeId?: string | null;
  debugStatus?: 'idle' | 'running' | 'completed' | 'error';
  debugResult?: DebugResult | null;
  previewResult?: DebugResult | null;
  onDebugNode?: (nodeId: string, inputs?: Record<string, unknown>, properties?: Record<string, unknown>) => void;
  onCancelDebug?: () => void;
  executionLog?: ExecutionLog | null;
  workspaceId?: string;
  dragHandleClassName?: string;
}

export function WorkflowPropertiesPanel({
  node,
  isPreview = false,
  nodes = [],
  edges = [],
  variableContextWorkflow = null,
  enabledPlugins = [],
  variables = [],
  onUpdateData,
  onPreviewUpdateData,
  debugNodeId = null,
  debugStatus = 'idle',
  debugResult = null,
  previewResult = null,
  onDebugNode,
  onCancelDebug,
  executionLog = null,
  workspaceId,
  dragHandleClassName,
}: PropertiesPanelProps) {
  const t = useTranslations('workflows');
  const [importOpen, setImportOpen] = useState(false);
  const [presetOpen, setPresetOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<JsonPreset | null>(null);
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(() => new Set());
  const [variableModeEnabled, setVariableModeEnabled] = useState<Set<string>>(() => new Set());
  const [variableModeDisabled, setVariableModeDisabled] = useState<Set<string>>(() => new Set());
  const [nodeTestDialogOpen, setNodeTestDialogOpen] = useState(false);

  // Derived values
  const definition = useLocalizedNodeDefinition(node?.type ?? '');
  const data = useMemo(() => node?.data ?? {}, [node?.data]);
  const visibleProperties = useMemo(
    () => (definition?.properties ?? []).filter(prop => isVisible(prop, data)),
    [definition, data],
  );
  const jsonPresets = useMemo(() => getJsonPresets(data[JSON_PRESETS_KEY]), [data]);
  const selectedJsonPresetId = typeof data[SELECTED_JSON_PRESET_KEY] === 'string'
    ? data[SELECTED_JSON_PRESET_KEY] as string
    : '';
  const selectedJsonPreset = jsonPresets.find(preset => preset.id === selectedJsonPresetId) ?? null;
  const canEditInputFields = Boolean(definition?.allowInputFields && node?.type !== 'end');
  const canEditOutputFields = Boolean(node && node.type !== 'start');
  const canEditDelay = Boolean(node && node.type !== 'start' && node.type !== 'end');
  const canDebugSelectedNode = Boolean(node && definition?.debuggable !== false && node.type !== 'start' && node.type !== 'end');
  const isDebugging = Boolean(node && debugNodeId === node.id && debugStatus === 'running');
  const visibleDebugResult = previewResult ?? (node && debugNodeId === node.id ? debugResult : null);
  const hasDebugOutput = Boolean(node && visibleDebugResult);
  const nodeId = node?.id;
  const latestExecutionStep = useMemo(() => {
    if (!nodeId) return undefined;
    const steps = executionLog?.steps;
    if (!steps) return undefined;
    for (let index = steps.length - 1; index >= 0; index -= 1) {
      const step = steps[index];
      if (step?.nodeId === nodeId) return step;
    }
    return undefined;
  }, [executionLog?.steps, nodeId]);
  const visibleLogs = nodeId
    ? visibleDebugResult?.logs ?? latestExecutionStep?.logs
    : undefined;
  const variableContext = useMemo<WorkflowVariableContext | undefined>(() => {
    if (!node) return undefined;
    return {
      nodes: variableContextWorkflow?.nodes ?? nodes,
      edges: variableContextWorkflow?.edges ?? edges,
      currentNodeId: node.id,
      enabledPlugins: variableContextWorkflow?.enabledPlugins ?? enabledPlugins,
      variables: variableContextWorkflow?.variables ?? variables,
    };
  }, [edges, enabledPlugins, node, nodes, variableContextWorkflow, variables]);

  // Handlers
  const isVariableRef = (value: unknown): boolean => typeof value === 'string' && value.includes('{{');
  const isVariableModeActive = useCallback((key: string, value: unknown): boolean => {
    if (variableModeDisabled.has(key)) return false;
    return isVariableRef(value) || variableModeEnabled.has(key);
  }, [variableModeDisabled, variableModeEnabled]);
  const toggleVariableMode = useCallback((key: string, value: unknown) => {
    if (isVariableModeActive(key, value)) {
      setVariableModeEnabled((current) => { const next = new Set(current); next.delete(key); return next; });
      setVariableModeDisabled((current) => new Set(current).add(key));
    } else {
      setVariableModeDisabled((current) => { const next = new Set(current); next.delete(key); return next; });
      setVariableModeEnabled((current) => new Set(current).add(key));
    }
  }, [isVariableModeActive]);
  const clearVariableModeDisabledOverride = useCallback((key: string) => {
    setVariableModeDisabled((current) => {
      if (!current.has(key)) return current;
      const next = new Set(current);
      next.delete(key);
      return next;
    });
  }, []);
  const handleDataChange = useCallback((key: string, value: unknown) => {
    if (!nodeId) return;
    onUpdateData(nodeId, { [key]: value });
  }, [nodeId, onUpdateData]);
  const handlePreviewDataChange = useCallback((key: string, value: unknown) => {
    if (!nodeId) return;
    onPreviewUpdateData?.(nodeId, { [key]: value });
  }, [nodeId, onPreviewUpdateData]);
  const handleCopyNodeJson = useCallback(() => {
    if (!node) return;
    copyToClipboard(JSON.stringify(node, null, 2));
  }, [node]);
  const toVariableInputValue = useCallback((value: unknown): string | number => {
    if (typeof value === 'string' || typeof value === 'number') return value;
    if (typeof value === 'boolean') return String(value);
    return '';
  }, []);
  const insertVariable = useCallback((key: string, variablePath: string) => {
    clearVariableModeDisabledOverride(key);
    handleDataChange(key, variablePath);
  }, [clearVariableModeDisabledOverride, handleDataChange]);
  const updateJsonPresets = useCallback((presets: JsonPreset[]) => {
    handleDataChange(JSON_PRESETS_KEY, presets);
  }, [handleDataChange]);

  const handleResetToDefaults = useCallback(() => {
    if (!nodeId) return;
    const defaults: Record<string, unknown> = {};
    for (const prop of visibleProperties) {
      if (prop.default !== undefined) {
        defaults[prop.key] = prop.default;
      }
    }
    if (Object.keys(defaults).length > 0) {
      onUpdateData(nodeId, defaults);
    }
  }, [nodeId, visibleProperties, onUpdateData]);

  const openAddPresetDialog = () => {
    setEditingPreset(null);
    setPresetOpen(true);
  };

  const openEditPresetDialog = (preset: JsonPreset) => {
    setEditingPreset(preset);
    setPresetOpen(true);
  };

  const handlePresetSave = (presets: JsonPreset[], newPresetId?: string) => {
    updateJsonPresets(presets);
    if (newPresetId) handleDataChange(SELECTED_JSON_PRESET_KEY, newPresetId);
  };

  const saveDebugOutputToPreset = useCallback(() => {
    if (!visibleDebugResult || visibleDebugResult.output === undefined) return;
    const output = visibleDebugResult.output;
    const preset: JsonPreset = {
      id: TEMP_DEBUG_PRESET_ID,
      name: TEMP_DEBUG_PRESET_ID,
      data: {},
      inputs: {},
      outputs: isPlainObject(output) ? output : { result: output },
    };
    updateJsonPresets([
      ...jsonPresets.filter(item => item.id !== TEMP_DEBUG_PRESET_ID),
      preset,
    ]);
    handleDataChange(SELECTED_JSON_PRESET_KEY, TEMP_DEBUG_PRESET_ID);
  }, [handleDataChange, jsonPresets, updateJsonPresets, visibleDebugResult]);

  // Empty states
  if (!node) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-muted-foreground">
        {t('properties.emptyNode')}
      </div>
    );
  }
  if (node.type === 'loop_body') {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">
        {t('properties.loopBodyHint')}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <NodeHeader
        node={node}
        data={data}
        definition={definition}
        jsonPresets={jsonPresets}
        selectedJsonPresetId={selectedJsonPresetId}
        selectedJsonPreset={selectedJsonPreset}
        onDataChange={handleDataChange}
        onAddPreset={openAddPresetDialog}
        onEditPreset={openEditPresetDialog}
        onUpdatePresets={updateJsonPresets}
        dragHandleClassName={dragHandleClassName}
      />

      <Toolbar
        node={node}
        data={data}
        canEditInputFields={canEditInputFields}
        canEditOutputFields={canEditOutputFields}
        canEditDelay={canEditDelay}
        canDebug={canDebugSelectedNode && Boolean(onDebugNode)}
        isDebugging={isDebugging}
        showRunResultAnchor={hasDebugOutput}
        showRunLogsAnchor={Boolean(visibleLogs?.length)}
        showJsonPresetAnchor={Boolean(selectedJsonPreset)}
        selectedJsonPreset={selectedJsonPreset}
        onDataChange={handleDataChange}
        onDebug={onDebugNode ?? (() => {})}
        onCancelDebug={onCancelDebug ?? (() => {})}
        onOpenTestDialog={() => setNodeTestDialogOpen(true)}
        onResetToDefaults={handleResetToDefaults}
      />

      <ScrollArea className="min-h-0 flex-1" viewportClassName="flex flex-col">
        <div className="flex flex-col gap-3 p-3 pt-0">
          {hasDebugOutput && visibleDebugResult && (
            <section id="run-result-section" className="space-y-2 rounded border bg-muted/20 p-2 mt-2">
              <div className="flex items-center gap-1.5">
                {visibleDebugResult.status === 'completed' ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />
                )}
                <span className="text-xs font-medium">
                  {visibleDebugResult.status === 'completed' ? t('properties.testSuccess') : t('properties.testFailed')}
                </span>
                {typeof visibleDebugResult.duration === 'number' && (
                  <span className="text-[10px] text-muted-foreground">{visibleDebugResult.duration}ms</span>
                )}
                {visibleDebugResult.output !== undefined && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-auto h-6 w-6 text-muted-foreground hover:text-foreground"
                    title="保存到临时预设"
                    onClick={saveDebugOutputToPreset}
                  >
                    <Save className="h-3.5 w-3.5" />
                  </Button>
                )}
                {!previewResult && (
                  <X
                    className={`${visibleDebugResult.output === undefined ? 'ml-auto ' : ''}h-3.5 w-3.5 shrink-0 cursor-pointer text-muted-foreground hover:text-foreground`}
                    onClick={() => onCancelDebug?.()}
                  />
                )}
              </div>
              {visibleDebugResult.error && (
                <div className="flex items-start gap-2 rounded bg-red-500/10 p-2">
                  <p className="min-w-0 flex-1 break-all text-[11px] font-mono text-red-500">
                    {visibleDebugResult.error}
                  </p>
                  <Copy
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer text-red-400 hover:text-red-300"
                    onClick={() => copyToClipboard(visibleDebugResult.error ?? '')}
                  />
                </div>
              )}
              {visibleDebugResult.output !== undefined && (
                <JsonPreview value={visibleDebugResult.output} />
              )}
            </section>
          )}

          
          {nodeId && (() => {
            if (!visibleLogs?.length) return null;
            return (
              <Card id="run-logs-section" className="mt-2">
                <CardHeader>
                  <CardTitle className="text-xs font-medium text-muted-foreground">{t('nodeUi.logs')}</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="max-h-48 overflow-y-auto rounded border bg-background font-mono text-[11px]">
                    {visibleLogs.map((entry, i) => (
                      <div
                        key={i}
                        className={`flex items-start gap-2 border-b px-2 py-1 last:border-b-0 ${
                          entry.level === 'error' ? 'bg-red-500/5 text-red-600' :
                          entry.level === 'warning' ? 'bg-yellow-500/5 text-yellow-600' :
                          'text-muted-foreground'
                        }`}
                      >
                        <span className="shrink-0 text-[10px] opacity-50">
                          {new Date(entry.timestamp).toLocaleTimeString()}
                        </span>
                        <span className="min-w-0 break-all">{entry.message}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          {selectedJsonPreset && (
            <div id="json-preset-section" className="space-y-2 rounded border bg-muted/20 p-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">{t('properties.currentJsonPreset')}</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 gap-1 text-[11px]"
                  onClick={() => copyToClipboard(JSON.stringify(selectedJsonPreset, null, 2))}
                >
                  <Copy className="h-3 w-3" />
                  {t('properties.copy')}
                </Button>
              </div>
              <JsonPreview value={{
                data: selectedJsonPreset.data,
                inputs: selectedJsonPreset.inputs,
                outputs: selectedJsonPreset.outputs,
              }} />
            </div>
          )}

          {canEditInputFields && (
            <Card className='mt-2'>
              <CardContent>
                <InputFieldsSection
                  node={node}
                  data={data}
                  variableContext={variableContext}
                  onDataChange={handleDataChange}
                />
              </CardContent>
            </Card>
          )}

          {visibleProperties.length > 0 && (
            <Card className="mt-2">
              <CardContent >
                  <PropertiesList
                    properties={visibleProperties}
                    data={data}
                    isPreview={isPreview}
                    collapsedKeys={collapsedKeys}
                    onCollapsedChange={setCollapsedKeys}
                    variableContext={variableContext}
                    isVariableModeActive={isVariableModeActive}
                    onToggleVariableMode={toggleVariableMode}
                    toVariableInputValue={toVariableInputValue}
                    onInsertVariable={insertVariable}
                    onDataChange={handleDataChange}
                    onPreviewDataChange={handlePreviewDataChange}
                    workspaceId={workspaceId}
                  />
              </CardContent>
            </Card>
          )}

          {canEditOutputFields && (
            <Card className="mt-2">
              <CardContent >
                  <OutputFieldsSection
                    node={node}
                    nodes={nodes}
                    data={data}
                    variableContext={variableContext}
                    selectedJsonPreset={selectedJsonPreset}
                    debugResult={visibleDebugResult}
                    hasDebugOutput={hasDebugOutput}
                    onDataChange={isPreview ? handlePreviewDataChange : handleDataChange}
                    onOpenImport={() => setImportOpen(true)}
                  />
              </CardContent>
            </Card>
          )}

        </div>
      </ScrollArea>

      {node && (
        <div className="flex shrink-0 items-center gap-2 border-t px-3 py-2">
          <Button
            variant="outline"
            size="sm"
            className="h-6 gap-1 px-2 text-[11px]"
            onClick={handleCopyNodeJson}
            aria-label={`${t('properties.copy')} JSON`}
          >
            <Copy className="h-3 w-3" />
          </Button>
          {canEditOutputFields && (
            <Toggle
              size="sm"
              pressed={data.outputPreviewEnabled !== false}
              onPressedChange={(enabled) => handleDataChange('outputPreviewEnabled', enabled)}
              className="h-6 min-w-6 px-1 text-muted-foreground data-[state=on]:text-primary"
              aria-label={t('properties.outputPreview')}
            >
              <ImageIcon className="h-3.5 w-3.5" />
            </Toggle>
          )}
        </div>
      )}

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImport={(outputs) => handleDataChange('outputs', outputs)}
      />

      <PresetDialog
        open={presetOpen}
        onOpenChange={setPresetOpen}
        editingPreset={editingPreset}
        jsonPresets={jsonPresets}
        selectedJsonPresetId={selectedJsonPresetId}
        onSave={handlePresetSave}
      />

      {node && (
        <ExecutionNodeDialog
          open={nodeTestDialogOpen}
          inputFields={getOutputFields(data.inputFields)}
          properties={visibleProperties}
          propertyValues={data as Record<string, unknown>}
          nodeLabel={node.label || t('properties.node')}
          onOpenChange={setNodeTestDialogOpen}
          onSubmit={({ inputs, properties }) => onDebugNode?.(node.id, inputs, properties)}
        />
      )}
    </div>
  );
}
