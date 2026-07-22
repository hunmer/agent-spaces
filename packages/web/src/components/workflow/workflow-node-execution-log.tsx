'use client';

import React from 'react';
import { copyToClipboard } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Info,
  Loader2,
  X,
} from 'lucide-react';
import {
  LOOP_NODE_TYPE,
  type ExecutionStep,
  type OutputField,
} from '@agent-spaces/shared';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NodeMediaPreview, type MediaItem } from '@/components/ui/media-gallery';
import { JsonViewer } from '@/components/viewers/json-viewer';
import { cn } from '@/lib/utils';
import { toStaticHref } from '@/lib/navigate';
import { formatDuration, type WorkflowLogPanelLayout } from './workflow-node-types';

const LOG_SECTION_SCROLL_CLASS = 'nodrag nopan max-h-[calc(500px/3)] overscroll-contain overflow-auto';
const LOG_TAB_TRIGGER_CLASS = 'h-7 rounded-none border-b-2 border-transparent px-2 text-[10px] data-active:border-primary data-active:bg-primary/5 data-active:text-foreground data-active:shadow-none';
const WORKFLOW_EXECUTION_BATCH_INDEX_EVENT = 'workflow:execution-log-batch-index';

interface WorkflowExecutionBatchIndexEventDetail {
  scopeId: string;
  nodeId: string;
  index: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function CopyButton({ data }: { data: unknown }) {
  const [copied, setCopied] = React.useState(false);
  const handleClick = React.useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    copyToClipboard(JSON.stringify(data, null, 2)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [data]);
  return (
    <button
      type="button"
      className="p-0.5 rounded hover:bg-muted/50 transition-colors"
      onClick={handleClick}
    >
      {copied
        ? <CheckCheck className="h-2.5 w-2.5 text-green-500" />
        : <Copy className="h-2.5 w-2.5" />}
    </button>
  );
}
const LOG_TAB_SECTION_SCROLL_CLASS = 'nodrag nopan max-h-[110px] overscroll-contain overflow-auto';
const LOG_TAB_PANEL_SCROLL_CLASS = 'nodrag nopan max-h-[220px] overscroll-contain overflow-auto';

interface WorkflowNodeExecutionLogProps {
  nodeId: string;
  executionStep: ExecutionStep;
  executionSteps?: ExecutionStep[];
  executionStatus?: string;
  nodeType?: string;
  loopExecutionScopeId?: string;
  data?: Record<string, unknown>;
  inputFields?: OutputField[];
  outputs: OutputField[];
  nodeWidth: number;
  layout: WorkflowLogPanelLayout;
  isLogExpanded: boolean;
  showOutputPreview: boolean;
  onToggleLog: () => void;
}

export function WorkflowNodeExecutionLog({
  nodeId,
  executionStep,
  executionSteps,
  executionStatus,
  nodeType,
  loopExecutionScopeId,
  data,
  inputFields = [],
  outputs,
  nodeWidth,
  layout,
  isLogExpanded,
  showOutputPreview,
  onToggleLog,
}: WorkflowNodeExecutionLogProps) {
  const t = useTranslations('workflows');
  const isExecutionActive = executionStatus === 'running' || executionStatus === 'paused';
  const batchSteps = React.useMemo(() => {
    return Array.isArray(executionSteps) && executionSteps.length > 0
      ? executionSteps
      : [executionStep];
  }, [executionStep, executionSteps]);
  const shouldShowAllTab = nodeType === LOOP_NODE_TYPE && batchSteps.length > 1;
  const allTabValue = 'all';
  const initialBatchIndex = shouldShowAllTab ? -1 : Math.max(0, batchSteps.length - 1);
  const [selectedBatchIndex, setSelectedBatchIndex] = React.useState(initialBatchIndex);
  React.useEffect(() => {
    setSelectedBatchIndex(shouldShowAllTab ? -1 : Math.max(0, batchSteps.length - 1));
  }, [batchSteps.length, shouldShowAllTab]);
  React.useEffect(() => {
    if (!loopExecutionScopeId) return;
    const handleBatchIndexChange = (event: Event) => {
      const detail = (event as CustomEvent<WorkflowExecutionBatchIndexEventDetail>).detail;
      if (!detail || detail.scopeId !== loopExecutionScopeId || detail.nodeId === nodeId) return;
      setSelectedBatchIndex(Math.min(Math.max(0, detail.index), Math.max(0, batchSteps.length - 1)));
    };

    window.addEventListener(WORKFLOW_EXECUTION_BATCH_INDEX_EVENT, handleBatchIndexChange);
    return () => window.removeEventListener(WORKFLOW_EXECUTION_BATCH_INDEX_EVENT, handleBatchIndexChange);
  }, [batchSteps.length, loopExecutionScopeId, nodeId]);
  const selectedExecutionStep = selectedBatchIndex === -1
    ? executionStep
    : batchSteps[selectedBatchIndex] || executionStep;
  const shouldShowRunningSpinner = selectedExecutionStep.status === 'running' && isExecutionActive;
  const shouldShowBatchTabs = batchSteps.length > 1;
  const handleBatchIndexChange = React.useCallback((value: string) => {
    if (value === allTabValue) {
      setSelectedBatchIndex(-1);
      return;
    }

    const index = Number(value);
    if (!Number.isFinite(index)) return;
    setSelectedBatchIndex(index);
    if (!loopExecutionScopeId || nodeType !== LOOP_NODE_TYPE) return;
    window.dispatchEvent(new CustomEvent<WorkflowExecutionBatchIndexEventDetail>(
      WORKFLOW_EXECUTION_BATCH_INDEX_EVENT,
      { detail: { scopeId: loopExecutionScopeId, nodeId, index } },
    ));
  }, [loopExecutionScopeId, nodeId, nodeType]);
  const translateNodeLabel = React.useCallback((label: string): string => {
    if (!label.startsWith('nodes.')) return label;
    const boundaryMatch = label.match(/^(nodes\.[^.]+\.label)(开始|结束)$/);
    if (boundaryMatch) {
      const [, key, suffix] = boundaryMatch;
      const suffixKey = suffix === '开始' ? 'defaultWorkflow.startLabel' : 'defaultWorkflow.endLabel';
      return `${t(key as Parameters<typeof t>[0])} ${t(suffixKey as Parameters<typeof t>[0])}`;
    }
    return t(label as Parameters<typeof t>[0]);
  }, [t]);
  const translateDisplayValue = React.useCallback((value: unknown): unknown => {
    const walk = (item: unknown): unknown => {
      if (Array.isArray(item)) return item.map(child => walk(child));
      if (!isRecord(item)) return item;
      return Object.fromEntries(
        Object.entries(item).map(([key, child]) => [translateNodeLabel(key), walk(child)]),
      );
    };
    return walk(value);
  }, [translateNodeLabel]);
  const getDisplayStep = React.useCallback((step: ExecutionStep): ExecutionStep => ({
    ...step,
    input: translateDisplayValue(step.input),
    output: translateDisplayValue(step.output),
    logs: step.logs?.map(entry => ({
      ...entry,
      message: entry.message.replace(/^([^:]+):\s/, (_match, label: string) => `${translateNodeLabel(label)}: `),
    })),
  }), [translateDisplayValue, translateNodeLabel]);
  const handleClick = React.useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    window.dispatchEvent(new CustomEvent('workflow:select-node', { detail: { nodeId } }));
  }, [nodeId]);
  const stopContentScrollWheel = React.useCallback((event: React.WheelEvent) => {
    if (event.ctrlKey || event.metaKey) return;
    event.stopPropagation();
  }, []);

  const isFileObj = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === 'object' && !Array.isArray(v) && 'httpPath' in (v as Record<string, unknown>)

  const toSrc = React.useCallback((v: unknown): string => {
    if (typeof v === 'string') return v
    if (isFileObj(v)) return v.httpPath as string
    return ''
  }, [])

  const getMediaType = React.useCallback((fieldType: OutputField['type']): MediaItem['type'] | null => {
    if (fieldType === 'image' || fieldType === 'image[]' || fieldType === 'file' || fieldType === 'file[]') return 'image'
    if (fieldType === 'audio') return 'audio'
    if (fieldType === 'video') return 'video'
    return null
  }, [])

  const extractSchemaMedia = React.useMemo(() => {
    const extract = (fields: OutputField[], parent: Record<string, unknown>): MediaItem[] => {
      const items: MediaItem[] = []
      for (const field of fields) {
        const val = parent[field.key]
        if (val == null) continue

        const mediaType = getMediaType(field.type)
        if (mediaType) {
          const values = field.type.endsWith('[]')
            ? Array.isArray(val) ? val : []
            : [val]

          for (const item of values) {
            const src = toSrc(item)
            if (src) items.push({ src, type: mediaType, alt: field.key })
          }
          continue
        }

        if (field.type === 'object' && field.children && val && typeof val === 'object' && !Array.isArray(val)) {
          items.push(...extract(field.children, val as Record<string, unknown>))
        } else if (field.type === 'array' && field.children && Array.isArray(val)) {
          for (const item of val) {
            if (item && typeof item === 'object' && !Array.isArray(item)) {
              items.push(...extract(field.children, item as Record<string, unknown>))
            }
          }
        }
      }
      return items
    }
    return extract
  }, [getMediaType, toSrc])

  const getRecord = React.useCallback((value: unknown): Record<string, unknown> | null => {
    return isRecord(value) ? value : null
  }, [])

  const { inputMediaItems, outputMediaItems } = React.useMemo(() => {
    const input = getRecord(getDisplayStep(selectedExecutionStep).input)
    const inputMedia = input ? extractSchemaMedia(inputFields, input) : []

    let outputMedia: MediaItem[] = []
    if (selectedExecutionStep.status === 'completed' && selectedExecutionStep.output) {
      const output = getRecord(getDisplayStep(selectedExecutionStep).output)
      const outputFields = nodeType === 'start' ? inputFields : outputs
      outputMedia = output ? extractSchemaMedia(outputFields, output) : []
    }

    return { inputMediaItems: inputMedia, outputMediaItems: outputMedia }
  }, [selectedExecutionStep, nodeType, inputFields, outputs, extractSchemaMedia, getRecord, getDisplayStep])

  const renderOutputSection = (step: ExecutionStep, className: string, extraClassName?: string) => (
    <div
      className={cn(className, extraClassName)}
      onWheelCapture={stopContentScrollWheel}
    >
      <div className="flex items-center px-2 py-0.5 text-[9px] font-medium text-muted-foreground/70 uppercase tracking-wider">
        <span className="flex-1">{t('execution.output')}</span>
        {step.output != null && <CopyButton data={step.output} />}
      </div>
      {step.output != null ? (
        <JsonViewer
          data={step.output as Parameters<typeof JsonViewer>[0]['data']}
          className="border-0 shadow-none rounded-none text-[10px]"
          defaultExpanded={2}
          mini
        />
      ) : (
        <div className="px-2 pb-1 text-[10px] text-muted-foreground">{t('execution.noOutput')}</div>
      )}
    </div>
  );

  const inputFieldsDisplay = React.useMemo(() => {
    return Array.isArray(inputFields) && inputFields.length > 0 ? inputFields : null;
  }, [inputFields]);

  const dataDisplay = React.useMemo(() => {
    if (!data) return null
    const {
      inputFields: _inputFields,
      outputs: _outputs,
      executionStep: _executionStep,
      executionSteps: _executionSteps,
      ...rest
    } = data
    return Object.keys(rest).length > 0 ? rest : null
  }, [data])

  const renderInputSection = (step: ExecutionStep, className: string, extraClassName?: string) => (
    <div
      className={cn(className, extraClassName)}
      onWheelCapture={stopContentScrollWheel}
    >
      <div className="flex items-center px-2 py-0.5 text-[9px] font-medium text-muted-foreground/70 uppercase tracking-wider">
        <span className="flex-1">{t('execution.input')}</span>
        {inputFieldsDisplay != null && <CopyButton data={inputFieldsDisplay} />}
      </div>
      {inputFieldsDisplay != null ? (
        <JsonViewer
          data={inputFieldsDisplay as unknown as Parameters<typeof JsonViewer>[0]['data']}
          className="border-0 shadow-none rounded-none text-[10px]"
          defaultExpanded={2}
          mini
        />
      ) : (
        <div className="px-2 pb-1 text-[10px] text-muted-foreground">{t('execution.noInput')}</div>
      )}
    </div>
  );

  const renderDataSection = (className: string, extraClassName?: string) => (
    <div
      className={cn(className, extraClassName)}
      onWheelCapture={stopContentScrollWheel}
    >
      <div className="flex items-center px-2 py-0.5 text-[9px] font-medium text-muted-foreground/70 uppercase tracking-wider">
        <span className="flex-1">DATA</span>
        {dataDisplay != null && <CopyButton data={dataDisplay} />}
      </div>
      {dataDisplay != null ? (
        <JsonViewer
          data={dataDisplay as Parameters<typeof JsonViewer>[0]['data']}
          className="border-0 shadow-none rounded-none text-[10px]"
          defaultExpanded={1}
          mini
        />
      ) : (
        <div className="px-2 pb-1 text-[10px] text-muted-foreground">{t('execution.noInput')}</div>
      )}
    </div>
  );

  const renderLogsSection = (step: ExecutionStep, className: string, extraClassName?: string) => (
    <div
      className={cn(className, extraClassName)}
      onWheelCapture={stopContentScrollWheel}
    >
      <div className="px-2 py-0.5 text-[9px] font-medium text-muted-foreground/70 uppercase tracking-wider">{t('execution.logs')}</div>
      {step.logs?.length ? (
        <div className="px-1.5 pb-1 space-y-px">
          {step.logs.map((entry, logIndex) => (
            <div
              key={`${entry.timestamp}-${logIndex}`}
              className={cn(
                'flex items-start gap-1 text-[10px] px-1.5 py-0.5 rounded',
                entry.level === 'info' && 'text-blue-600 dark:text-blue-400 bg-blue-500/10',
                entry.level === 'warning' && 'text-yellow-600 dark:text-yellow-400 bg-yellow-500/10',
                entry.level === 'error' && 'text-red-600 dark:text-red-400 bg-red-500/10',
              )}
            >
              {entry.level === 'info' ? <Info className="h-2.5 w-2.5 shrink-0 mt-0.5" /> :
                entry.level === 'warning' ? <AlertTriangle className="h-2.5 w-2.5 shrink-0 mt-0.5" /> :
                <AlertCircle className="h-2.5 w-2.5 shrink-0 mt-0.5" />}
              <span className="break-all">{entry.message}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-2 pb-1 text-[10px] text-muted-foreground">{t('execution.noLogsContent')}</div>
      )}
    </div>
  );

  const renderStepContent = (step: ExecutionStep) => {
    const displayStep = getDisplayStep(step);
    return (
    layout === 'tabs' ? (
      <Tabs defaultValue="io" className="flex-col gap-0">
        <TabsList variant="line" className="mx-2 h-7 w-[calc(100%-1rem)] justify-start p-0">
          <TabsTrigger value="io" className={LOG_TAB_TRIGGER_CLASS}>
            {t('execution.input')} / {t('execution.output')}
          </TabsTrigger>
          <TabsTrigger value="logs" className={LOG_TAB_TRIGGER_CLASS}>
            {t('execution.logs')}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="io" className="m-0">
          {renderInputSection(displayStep, LOG_TAB_SECTION_SCROLL_CLASS, 'border-b border-border')}
          {renderDataSection(LOG_TAB_SECTION_SCROLL_CLASS, 'border-b border-border')}
          {renderOutputSection(displayStep, LOG_TAB_SECTION_SCROLL_CLASS)}
        </TabsContent>
        <TabsContent value="logs" className="m-0">
          {renderLogsSection(displayStep, LOG_TAB_PANEL_SCROLL_CLASS)}
        </TabsContent>
      </Tabs>
    ) : (
      <>
        {renderInputSection(displayStep, LOG_SECTION_SCROLL_CLASS, 'border-b border-border')}
        {renderDataSection(LOG_SECTION_SCROLL_CLASS, 'border-b border-border')}
        {renderOutputSection(displayStep, LOG_SECTION_SCROLL_CLASS, 'border-b border-border')}
        {renderLogsSection(displayStep, LOG_SECTION_SCROLL_CLASS)}
      </>
    )
    );
  };

  return (
    <div
      className="nodrag nopan relative z-10 mt-1"
      style={{ width: nodeWidth }}
      onClick={handleClick}
    >
      <button
        type="button"
        className={cn(
          'flex items-center gap-1 rounded-t-md border border-border px-2 py-1 text-[10px] w-full text-left transition-colors',
          isLogExpanded ? 'bg-muted' : 'bg-background hover:bg-muted rounded-b-md',
        )}
        onClick={onToggleLog}
      >
        {shouldShowRunningSpinner
          ? <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
          : selectedExecutionStep.status === 'error'
            ? <X className="h-3 w-3 text-red-500" />
            : <Check className="h-3 w-3 text-green-500" />}
        <span className="flex-1 truncate text-muted-foreground">
          {selectedExecutionStep.status === 'error' ? selectedExecutionStep.error?.slice(0, 60) || t('nodeUi.executionResult') : t('nodeUi.executionResult')}
        </span>
        <span className="text-muted-foreground/70">
          {selectedExecutionStep.finishedAt ? formatDuration(selectedExecutionStep.startedAt, selectedExecutionStep.finishedAt) : '...'}
        </span>
        {isLogExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {isLogExpanded && (
        <div className="nodrag nopan rounded-b-md border border-t-0 border-border bg-background">
          {nodeType === 'sub_workflow' && selectedExecutionStep.subWorkflowId && selectedExecutionStep.subWorkflowExecutionId && (
            <div className="border-b border-border p-2">
              <button
                type="button"
                className="flex h-7 w-full items-center justify-center gap-1.5 rounded-md border border-input bg-background px-2 text-[10px] hover:bg-muted"
                onClick={(event) => {
                  event.stopPropagation();
                  const workflowId = encodeURIComponent(selectedExecutionStep.subWorkflowId!);
                  const executionLogId = encodeURIComponent(selectedExecutionStep.subWorkflowExecutionId!);
                  const href = toStaticHref(`/workflows/${workflowId}?executionLogId=${executionLogId}&preview=1`);
                  window.open(href, '_blank', 'noopener,noreferrer');
                }}
              >
                <ExternalLink className="h-3 w-3" />
                {t('execution.viewSubWorkflow')}
              </button>
            </div>
          )}
          {/* Error */}
          {selectedExecutionStep.error && (
            <div className="px-2 py-1.5 text-[10px] text-red-500 bg-red-500/10 border-b border-border flex items-start gap-1">
              <AlertCircle className="h-2.5 w-2.5 shrink-0 mt-0.5" />
              <span className="break-all">{selectedExecutionStep.error}</span>
            </div>
          )}

          {shouldShowBatchTabs ? (
            <Tabs
              value={selectedBatchIndex === -1 ? allTabValue : String(selectedBatchIndex)}
              onValueChange={handleBatchIndexChange}
              className="flex-col gap-0"
            >
              <TabsList
                variant="line"
                className="mx-2 h-7 w-[calc(100%-1rem)] justify-start gap-1 overflow-x-auto p-0"
              >
                {shouldShowAllTab && (
                  <TabsTrigger
                    value={allTabValue}
                    className={cn(LOG_TAB_TRIGGER_CLASS, 'flex-none')}
                  >
                    {t('templatesDialog.all')}
                  </TabsTrigger>
                )}
                {batchSteps.map((step, index) => (
                  <TabsTrigger
                    key={`${step.startedAt}-${index}`}
                    value={String(index)}
                    className={cn(LOG_TAB_TRIGGER_CLASS, 'flex-none')}
                  >
                    {index + 1}
                  </TabsTrigger>
                ))}
              </TabsList>
              {shouldShowAllTab && (
                <TabsContent value={allTabValue} className="m-0">
                  {renderStepContent(executionStep)}
                </TabsContent>
              )}
              {batchSteps.map((step, index) => (
                <TabsContent key={`${step.startedAt}-${index}`} value={String(index)} className="m-0">
                  {renderStepContent(step)}
                </TabsContent>
              ))}
            </Tabs>
          ) : (
            renderStepContent(selectedExecutionStep)
          )}
        </div>
      )}

      {/* Resource preview */}
      {showOutputPreview && inputMediaItems.length > 0 && (
        <div className="border-t border-border/50">
          <div className="px-2 py-0.5 text-[9px] font-medium text-muted-foreground/70 uppercase tracking-wider">{t('execution.input')}</div>
          <NodeMediaPreview items={inputMediaItems} />
        </div>
      )}
      {showOutputPreview && outputMediaItems.length > 0 && (
        <div className="border-t border-border/50">
          <div className="px-2 py-0.5 text-[9px] font-medium text-muted-foreground/70 uppercase tracking-wider">{t('execution.output')}</div>
          <NodeMediaPreview items={outputMediaItems} />
        </div>
      )}
    </div>
  );
}
