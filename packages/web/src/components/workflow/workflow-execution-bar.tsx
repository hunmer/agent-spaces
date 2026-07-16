'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ExecutionLog, OutputField, WorkflowNode } from '@agent-spaces/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  AlertTriangle, Check, CheckCircle, ChevronDown,
  Circle, Clock, Copy, Loader2, MoreHorizontal, Pause, Play, Square, Trash2, XCircle,
} from 'lucide-react';
import { JsonViewer } from '@/components/viewers/json-viewer';
import { cn, copyToClipboard } from '@/lib/utils';
import { executionLogApi } from '@/lib/workflow-api';
import { ExecutionInputDialog } from './workflow-execution-input-dialog';
import { SavePresetDialog } from './workflow-save-preset-dialog';

type ExecutionStatus = 'idle' | 'running' | 'paused' | 'completed' | 'error' | 'stopped' | string;

export interface WorkflowExecutionRunGroup {
  id: string;
  label: string;
  startNodeId: string;
  startNodeLabel: string;
  nodeCount: number;
  inputFields: OutputField[];
}

interface ExecutionBarProps {
  status: ExecutionStatus;
  log: ExecutionLog | null;
  logs: ExecutionLog[];
  selectedLogId: string | null;
  workflowErrorMessage?: string | null;
  startNodes: WorkflowNode[];
  runGroups?: WorkflowExecutionRunGroup[];
  variables?: OutputField[];
  validationError?: string | null;
  workflowId: string | null;
  isPreview?: boolean;
  onExecute: (input?: Record<string, unknown>, startNodeId?: string, env?: Record<string, unknown>) => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onSelectLog: (log: ExecutionLog) => void;
  onDeleteLog: (logId: string) => void;
  onClearLogs: () => void;
  onUpdateNodeData?: (nodeId: string, data: Record<string, unknown>) => void;
}


function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function formatDuration(start: number, end?: number): string {
  const ms = Math.max(0, (end || Date.now()) - start);
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function WorkflowExecutionBar({
  status, log, logs, selectedLogId, workflowErrorMessage = null, startNodes, runGroups = [], variables = [], validationError, workflowId,
  isPreview = false,
  onExecute, onPause, onResume, onStop, onSelectLog, onDeleteLog, onClearLogs,
  onUpdateNodeData,
}: ExecutionBarProps) {
  const t = useTranslations('workflows');
  const [inputDialogOpen, setInputDialogOpen] = useState(false);
  const [selectedStartNodeId, setSelectedStartNodeId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [presetDialogState, setPresetDialogState] = useState<{
    open: boolean;
    nodeId: string;
    nodeLabel: string;
    defaultName: string;
    defaultJson: string;
    key: number;
  }>({ open: false, nodeId: '', nodeLabel: '', defaultName: '', defaultJson: '', key: 0 });

  const badge = {
    label: t(`execution.status.${status}`) || t('execution.status.idle'),
    variant: (status === 'running' || status === 'completed') ? 'default' as const
      : status === 'error' ? 'destructive' as const
      : status === 'paused' ? 'outline' as const
      : 'secondary' as const,
  };
  const isRunning = status === 'running';
  const isPaused = status === 'paused';
  const canStart = !isPreview && !isRunning && !isPaused && !validationError;
  const canPause = isRunning;
  const canResume = isPaused;
  const canStop = isRunning || isPaused;

  const executionTargets = useMemo(() => {
    if (runGroups.length > 0) {
      return runGroups.map(group => ({
        id: `group:${group.id}`,
        label: group.label,
        startNodeId: group.startNodeId,
        startNodeLabel: group.startNodeLabel,
        inputFields: group.inputFields,
        meta: t('execution.nodes', { count: group.nodeCount }),
      }));
    }
    return startNodes.map(node => ({
      id: `node:${node.id}`,
      label: node.label || t('execution.start'),
      startNodeId: node.id,
      startNodeLabel: node.label || t('execution.start'),
      inputFields: Array.isArray(node.data?.inputFields) ? node.data.inputFields as OutputField[] : [],
      meta: node.id.slice(0, 8),
    }));
  }, [runGroups, startNodes, t]);

  const activeExecutionTarget = useMemo(() => {
    if (selectedStartNodeId) {
      return executionTargets.find(target => target.startNodeId === selectedStartNodeId) ?? executionTargets[0] ?? null;
    }
    return executionTargets[0] ?? null;
  }, [executionTargets, selectedStartNodeId]);

  const inputFields = useMemo(() => {
    const fields = activeExecutionTarget?.inputFields;
    return Array.isArray(fields) ? fields as OutputField[] : [];
  }, [activeExecutionTarget]);
  const variableFields = useMemo(() => Array.isArray(variables) ? variables : [], [variables]);

  const displayLog = log;
  const steps = displayLog?.steps || [];
  const completedSteps = steps.filter(s => s.status === 'completed').length;
  const errorSteps = steps.filter(s => s.status === 'error').length;
  const progressText = displayLog ? `${completedSteps}/${steps.length}` : '';
  const elapsedText = displayLog ? formatDuration(displayLog.startedAt, displayLog.finishedAt) : '';

  // Build a summary of step statuses per log for the card display
  const logStepSummary = useMemo(() => {
    const map = new Map<string, { completed: number; error: number; total: number }>();
    for (const item of logs) {
      map.set(item.id, {
        completed: item.steps.filter(s => s.status === 'completed').length,
        error: item.steps.filter(s => s.status === 'error').length,
        total: item.steps.length,
      });
    }
    return map;
  }, [logs]);

  const executeFromTarget = useCallback((target?: (typeof executionTargets)[number] | null) => {
    const executionTarget = target ?? executionTargets[0] ?? null;
    setSelectedStartNodeId(executionTarget?.startNodeId ?? null);
    const fields = Array.isArray(executionTarget?.inputFields) ? executionTarget.inputFields : [];
    if (fields.length > 0 || variableFields.length > 0) {
      setInputDialogOpen(true);
      return;
    }
    onExecute(undefined, executionTarget?.startNodeId);
  }, [executionTargets, onExecute, variableFields.length]);

  useEffect(() => {
    const handleOpenExecutionInput = (event: Event) => {
      const detail = (event as CustomEvent).detail as { startNodeId?: string | null } | undefined;
      const target = detail?.startNodeId
        ? executionTargets.find(item => item.startNodeId === detail.startNodeId)
        : null;
      executeFromTarget(target);
    };
    window.addEventListener('workflow:open-execution-input', handleOpenExecutionInput);
    return () => window.removeEventListener('workflow:open-execution-input', handleOpenExecutionInput);
  }, [executeFromTarget, executionTargets]);

  const submitInput = (values: Record<string, unknown>, env?: Record<string, unknown>) => {
    onExecute(values, activeExecutionTarget?.startNodeId, env);
  };

  const copyText = async (key: string, text: string) => {
    await copyToClipboard(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  return (
    <div
      className={cn(
        'border-t border-border bg-background flex flex-col shrink-0 overflow-hidden',
        'h-full min-h-0',
      )}
    >
      <div className="flex items-center gap-2 px-3 py-1.5 min-w-0 overflow-hidden">
        {canResume ? (
          <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 px-2" onClick={onResume}>
            <Play className="h-3 w-3" /> {t('execution.resume')}
          </Button>
        ) : executionTargets.length > 1 ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="sm" className="h-6 text-xs gap-1 px-2" disabled={!canStart} />}
            >
              <Play className="h-3 w-3" /> {t('execution.execute')} <ChevronDown className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {executionTargets.map(target => (
                <DropdownMenuItem key={target.id} className="text-xs" onClick={() => executeFromTarget(target)}>
                  {target.label}
                  <span className="ml-auto text-[10px] text-muted-foreground">{target.meta}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 px-2" disabled={!canStart} onClick={() => executeFromTarget()}>
            <Play className="h-3 w-3" /> {t('execution.execute')}
          </Button>
        )}
        
        <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 px-2" disabled={!canPause} onClick={onPause}>
          <Pause className="h-3 w-3" /> {t('execution.pause')}
        </Button>
        <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 px-2" disabled={!canStop} onClick={onStop}>
          <Square className="h-3 w-3" /> {t('execution.stop')}
        </Button>

        <div className="ml-auto flex items-center gap-3 text-[10px] text-muted-foreground min-w-0">
          {progressText && <span>{t('execution.progress')}: {progressText}</span>}
          {elapsedText && <span>{t('execution.elapsed')}: {elapsedText}</span>}
          <Badge variant={badge.variant} className="text-[10px] h-5">{badge.label}</Badge>
          {errorSteps > 0 && <span className="text-destructive">{t('execution.errors', { count: errorSteps })}</span>}
        </div>
      </div>

      {/* Execution history cards - horizontal layout */}
      <div className="border-t border-border flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-3 py-1 border-b border-border shrink-0">
          <span className="text-[10px] text-muted-foreground font-medium">{t('execution.history')}</span>
          {logs.length > 0 && (
            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={onClearLogs}>
              <Trash2 className="h-3 w-3 text-muted-foreground" />
            </Button>
          )}
        </div>
        <ScrollArea className="flex-1 min-h-0">
          <div className="flex gap-2 p-2 items-stretch" style={{ height: 'calc(100% - 8px)' }}>
            {logs.map(item => {
              const summary = logStepSummary.get(item.id);
              const statusColor = item.status === 'completed'
                ? 'border-green-500/40'
                : item.status === 'error'
                ? 'border-red-500/40'
                : item.status === 'running'
                ? 'border-blue-500/40'
                : 'border-border';

              return (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  className={cn(
                    'relative rounded-lg border p-2 text-left transition-colors cursor-pointer shrink-0 w-[180px]',
                    'hover:bg-muted/50',
                    selectedLogId === item.id && 'bg-muted ring-1 ring-primary',
                    statusColor,
                  )}
                  onClick={() => onSelectLog(item)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') onSelectLog(item);
                  }}
                >
                  {/* Popover trigger in top-right corner */}
                  <Popover>
                    <PopoverTrigger
                      className="absolute top-1.5 right-1.5 inline-flex h-5 w-5 items-center justify-center rounded hover:bg-muted"
                      onClick={event => event.stopPropagation()}
                    >
                      <MoreHorizontal className="h-3 w-3" />
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-64 p-0">
                      {/* Output section */}
                      {(() => {
                        const lastStep = item.steps[item.steps.length - 1];
                        const displayError = lastStep?.error || (item.id === selectedLogId ? workflowErrorMessage : null);
                        return lastStep ? (
                          <div className="p-2">
                            <div className="text-[10px] text-muted-foreground font-medium mb-1.5">{t('execution.output')}</div>
                            {displayError && (
                              <div className="mb-2 px-2 py-1.5 text-[10px] text-red-500 bg-red-500/10 rounded-md border border-red-500/20 flex items-start gap-1">
                                <XCircle className="h-3 w-3 shrink-0 mt-0.5" />
                                <span className="break-all">{displayError}</span>
                              </div>
                            )}
                            {lastStep.output != null ? (
                              <JsonViewer
                                data={lastStep.output as Parameters<typeof JsonViewer>[0]['data']}
                                className="border border-border rounded-md shadow-none max-h-[240px] overflow-auto"
                                defaultExpanded={2}
                              />
                            ) : (
                              <div className="text-[10px] text-muted-foreground py-2 text-center">{t('execution.noOutput')}</div>
                            )}
                          </div>
                        ) : (
                          <div className="p-2 text-[10px] text-muted-foreground text-center">{t('execution.noOutput')}</div>
                        );
                      })()}
                      {/* Actions */}
                      <div className="border-t border-border">
                        <button
                          className="flex items-center gap-2 w-full px-2 py-1.5 text-xs hover:bg-muted transition-colors"
                          onClick={(event) => {
                            event.stopPropagation();
                            copyText(`log-${item.id}`, JSON.stringify(item, null, 2));
                          }}
                        >
                          {copiedKey === `log-${item.id}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} {t('execution.copyLog')}
                        </button>
                        <button
                          className="flex items-center gap-2 w-full px-2 py-1.5 text-xs hover:bg-muted transition-colors"
                          onClick={async (event) => {
                            event.stopPropagation();
                            if (!workflowId) return;
                            try {
                              const { path } = await executionLogApi.getLogPath(workflowId, item.id);
                              await copyToClipboard(path);
                              setCopiedKey(`path-${item.id}`);
                              setTimeout(() => setCopiedKey(null), 1500);
                            } catch { /* ignore */ }
                          }}
                        >
                          {copiedKey === `path-${item.id}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} {t('execution.copyLogPath')}
                        </button>
                        <button
                          className="flex items-center gap-2 w-full px-2 py-1.5 text-xs text-red-500 hover:bg-red-500/10 transition-colors"
                          onClick={(event) => {
                            event.stopPropagation();
                            onDeleteLog(item.id);
                          }}
                        >
                          <Trash2 className="h-3 w-3" /> {t('execution.deleteLog')}
                        </button>
                      </div>
                    </PopoverContent>
                  </Popover>

                  <div className="flex items-center gap-1.5 mb-1">
                    {item.status === 'completed' ? <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" /> :
                      item.status === 'error' ? <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" /> :
                      item.status === 'running' ? <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin shrink-0" /> :
                      <Circle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                    <span className="text-xs font-medium truncate">{formatTime(item.startedAt)}</span>
                  </div>

                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-0.5">
                      <Clock className="h-2.5 w-2.5" />
                      {formatDuration(item.startedAt, item.finishedAt)}
                    </span>
                    <span>{t('execution.nodes', { count: item.steps.length })}</span>
                  </div>

                  {summary && summary.total > 0 && (
                    <div className="mt-1.5 flex items-center gap-1">
                      <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all',
                            item.status === 'error' ? 'bg-red-500' : 'bg-green-500',
                          )}
                          style={{ width: `${(summary.completed / summary.total) * 100}%` }}
                        />
                      </div>
                      <span className="text-[9px] text-muted-foreground shrink-0">
                        {summary.completed}/{summary.total}
                      </span>
                      {summary.error > 0 && (
                        <span className="text-[9px] text-red-500 shrink-0">
                          {summary.error}✕
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {logs.length === 0 && (
              <div className="flex-1 text-center text-[10px] text-muted-foreground py-4">{t('execution.noLogs')}</div>
            )}
          </div>
        </ScrollArea>
      </div>

      <ExecutionInputDialog
        open={inputDialogOpen}
        fields={inputFields}
        variableFields={variableFields}
        startNodeLabel={activeExecutionTarget?.startNodeLabel || t('execution.start')}
        workflowId={workflowId}
        onOpenChange={setInputDialogOpen}
        onSubmit={submitInput}
      />

      <SavePresetDialog
        key={presetDialogState.key}
        open={presetDialogState.open}
        onOpenChange={(open) => setPresetDialogState(prev => ({ ...prev, open }))}
        defaultName={presetDialogState.defaultName}
        defaultJson={presetDialogState.defaultJson}
        getNodeData={() => {
          const snapshotNode = displayLog?.snapshot?.nodes?.find(n => n.id === presetDialogState.nodeId);
          return (snapshotNode?.data ?? {}) as Record<string, unknown>;
        }}
        onUpdateData={(key, value) => onUpdateNodeData?.(presetDialogState.nodeId, { [key]: value })}
      />
    </div>
  );
}
