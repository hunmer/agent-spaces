'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { ExecutionLog, OutputField, Workflow } from '@agent-spaces/shared';
import { workflowApi } from '@/lib/workflow-api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ExecutionChecklist } from '@/components/ui/checklist-cell';
import { ExecutionInputForm } from '@/components/workflow/workflow-execution-input-dialog';
import { JsonViewer } from '@/components/viewers/json-viewer';
import FileCard from '@/components/file-card-collections';
import { getWS } from '@/lib/ws';
import { sendNativeNotification } from '@/lib/native-notification';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Loader2, Play, Square, Download, Lock } from 'lucide-react';
import JSZip from 'jszip';
import ModernLoader from '@/components/ui/modern-loader';
import { BackButton } from '@/components/common/back-button';
import { useTranslations } from 'next-intl';

type FormatFileProps =
  | "doc" | "pdf" | "md" | "mdx" | "csv" | "xls" | "xlsx" | "txt"
  | "ppt" | "pptx" | "zip" | "rar" | "tar" | "gz"
  | "code" | "html" | "js" | "jsx" | "tsx" | "css" | "json"
  | "img" | "png" | "jpg" | "jpeg" | "video";

interface FileOutput {
  name: string;
  format: FormatFileProps;
  url: string;
}

type EntryStatus = 'running' | 'completed' | 'error' | 'stopped';

interface ExecutionEntry {
  localId: number;
  executionId: string;
  status: EntryStatus;
  log: ExecutionLog | null;
  inputValues: Record<string, unknown>;
  createdAt: number;
}

function extToFormat(ext: string): FormatFileProps {
  const map: Record<string, FormatFileProps> = {
    pdf: 'pdf', doc: 'doc', docx: 'doc', md: 'md', mdx: 'mdx', txt: 'txt',
    csv: 'csv', xls: 'xls', xlsx: 'xlsx', ppt: 'ppt', pptx: 'pptx',
    zip: 'zip', rar: 'rar', tar: 'tar', gz: 'gz',
    html: 'html', htm: 'html', js: 'js', jsx: 'jsx', tsx: 'tsx', css: 'css', json: 'json',
    png: 'png', jpg: 'jpg', jpeg: 'jpeg', gif: 'img', webp: 'img', svg: 'img', bmp: 'img',
    mp4: 'video', avi: 'video', mov: 'video', mkv: 'video', webm: 'video',
    mp3: 'video', wav: 'video', flac: 'video', ogg: 'video', aac: 'video',
  };
  return map[ext.toLowerCase()] || 'code';
}

function extractFileOutputs(log: ExecutionLog): FileOutput[] {
  const endIds = new Set((log.snapshot?.nodes || []).filter(n => n.type === 'end').map(n => n.id));
  const results: FileOutput[] = [];
  const seen = new Set<string>();

  function walk(obj: unknown) {
    if (typeof obj === 'string') {
      const match = obj.match(/\/([^/?#]+\.(?:mp4|mp3|wav|flac|aac|ogg|pdf|doc|docx|md|mdx|txt|csv|xls|xlsx|ppt|pptx|zip|rar|tar|gz|html|htm|js|jsx|tsx|css|json|png|jpg|jpeg|gif|webp|svg|bmp|avi|mov|mkv|webm))(?:\?|#|$)/i);
      if (match && !seen.has(obj)) {
        seen.add(obj);
        const fileName = match[1];
        const ext = fileName.split('.').pop() || '';
        results.push({ name: fileName, format: extToFormat(ext), url: obj });
      }
    } else if (Array.isArray(obj)) {
      obj.forEach(walk);
    } else if (obj && typeof obj === 'object') {
      Object.values(obj as Record<string, unknown>).forEach(walk);
    }
  }

  for (const step of log.steps) {
    if (!endIds.has(step.nodeId)) continue;
    walk(step.output);
  }
  return results;
}

function extractEndOutput(log: ExecutionLog): unknown {
  const endIds = new Set((log.snapshot?.nodes || []).filter(n => n.type === 'end').map(n => n.id));
  const outputs: unknown[] = [];
  for (const step of log.steps) {
    if (!endIds.has(step.nodeId)) continue;
    if (step.output !== undefined) outputs.push(step.output);
  }
  if (outputs.length === 0) return null;
  if (outputs.length === 1) return outputs[0];
  return outputs;
}

/** 在 entries 数组中匹配或分配 executionId */
function matchAndUpdate(
  prev: ExecutionEntry[],
  execId: string,
  update: Partial<ExecutionEntry>
): ExecutionEntry[] {
  const hasExact = prev.some(en => en.executionId === execId);
  if (hasExact) {
    return prev.map(en => en.executionId === execId ? { ...en, ...update } : en);
  }
  const idx = prev.findIndex(en => en.status === 'running' && !en.executionId);
  if (idx === -1) return prev;
  return prev.map((en, i) => i === idx ? { ...en, executionId: execId, ...update } : en);
}

const STATUS_COLORS: Record<EntryStatus, string> = {
  running: 'bg-blue-500 animate-pulse',
  completed: 'bg-green-500',
  error: 'bg-red-500',
  stopped: 'bg-yellow-500',
};

export default function WorkflowSharePage() {
  const t = useTranslations('workflows');
  const searchParams = useSearchParams();
  const workflowId = searchParams.get('workflow_id') || '';
  const paramsStr = searchParams.get('params');

  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialValues, setInitialValues] = useState<Record<string, string>>({});

  // Multi-execution state
  const [entries, setEntries] = useState<ExecutionEntry[]>([]);
  const [activeLocalId, setActiveLocalId] = useState<number | null>(null);
  const nextLocalIdRef = useRef(1);
  const prevStatusMapRef = useRef<Map<number, EntryStatus>>(new Map());
  const pendingConnCleanupRef = useRef<(() => void)[]>([]);

  // Load workflow
  useEffect(() => {
    if (!workflowId) { setLoading(false); return; }
    workflowApi.get(workflowId).then(setWorkflow).catch(() => setWorkflow(null)).finally(() => setLoading(false));
  }, [workflowId]);

  // Parse URL params
  useEffect(() => {
    if (!paramsStr) return;
    try {
      const parsed = JSON.parse(paramsStr);
      if (typeof parsed === 'object' && parsed !== null) {
        const map: Record<string, string> = {};
        for (const [k, v] of Object.entries(parsed)) map[k] = typeof v === 'string' ? v : JSON.stringify(v);
        setInitialValues(map);
      }
    } catch { /* ignore */ }
  }, [paramsStr]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { for (const c of pendingConnCleanupRef.current) c(); pendingConnCleanupRef.current = []; };
  }, []);

  // Global WS listeners for all executions
  useEffect(() => {
    if (!workflowId) return;
    const ws = getWS('workflows');

    const offLog = ws.on('execution:log', (data) => {
      const e = data as { workflowId?: string; executionId?: string; log?: ExecutionLog };
      if (e.workflowId !== workflowId || !e.log) return;
      const execId = e.executionId || e.log.id;
      if (!execId) return;
      setEntries(prev => matchAndUpdate(prev, execId, { log: e.log! }));
    });

    const offDone = ws.on('workflow:completed', (data) => {
      const e = data as { workflowId?: string; log?: ExecutionLog };
      if (e.workflowId !== workflowId || !e.log) return;
      const execId = e.log.id;
      if (!execId) return;
      setEntries(prev => matchAndUpdate(prev, execId, { status: 'completed', log: e.log! }));
    });

    const offErr = ws.on('workflow:error', (data) => {
      const e = data as { workflowId?: string; log?: ExecutionLog };
      if (e.workflowId !== workflowId) return;
      const execId = e.log?.id;
      if (!execId) return;
      setEntries(prev => {
        const existing = prev.find(en => en.executionId === execId);
        const currentLog = existing?.log ?? null;
        return matchAndUpdate(prev, execId, { status: 'error', log: e.log ?? currentLog });
      });
    });

    return () => { offLog(); offDone(); offErr(); };
  }, [workflowId]);

  // Notification effect: detect status transitions
  useEffect(() => {
    for (const entry of entries) {
      const prev = prevStatusMapRef.current.get(entry.localId);
      if (prev === entry.status) continue;
      prevStatusMapRef.current.set(entry.localId, entry.status);
      if (prev === 'running') {
        if (entry.status === 'completed') {
          toast.success(t('share.execCompleted', { id: entry.localId }));
          sendNativeNotification('Agent Spaces', t('share.execCompleted', { id: entry.localId })).catch(() => {});
        } else if (entry.status === 'error') {
          toast.error(t('share.execError', { id: entry.localId }));
          sendNativeNotification('Agent Spaces', t('share.execError', { id: entry.localId })).catch(() => {});
        }
      }
    }
  }, [entries, t]);

  // Active entry
  const activeEntry = useMemo(() =>
    entries.find(e => e.localId === activeLocalId) ?? null
  , [entries, activeLocalId]);

  const inputFields = useMemo<OutputField[]>(() => {
    const startNode = (workflow?.nodes || []).find(n => n.type === 'start');
    const fields = startNode?.data?.inputFields;
    return Array.isArray(fields) ? fields as OutputField[] : [];
  }, [workflow]);

  const endOutput = useMemo(() => activeEntry?.log ? extractEndOutput(activeEntry.log) : null, [activeEntry]);
  const fileOutputs = useMemo(() => activeEntry?.log ? extractFileOutputs(activeEntry.log) : [], [activeEntry]);

  const handleExecute = useCallback((values: Record<string, unknown>) => {
    if (!workflowId || !workflow) return;
    const localId = nextLocalIdRef.current++;
    setEntries(prev => [...prev, {
      localId, executionId: '', status: 'running', log: null, inputValues: values, createdAt: Date.now(),
    }]);
    setActiveLocalId(localId);

    const ws = getWS('workflows');
    const send = () => ws.send('workflow:execute', {
      workflowId, input: values,
      snapshot: { nodes: workflow.nodes, edges: workflow.edges, groups: workflow.groups || [] },
    });
    if (ws.connected) { send(); } else {
      const offConn = ws.on('connected', () => {
        offConn();
        pendingConnCleanupRef.current = pendingConnCleanupRef.current.filter(c => c !== offConn);
        send();
      });
      pendingConnCleanupRef.current.push(offConn);
    }
  }, [workflowId, workflow]);

  const handleStop = useCallback((localId: number) => {
    setEntries(prev => {
      const entry = prev.find(e => e.localId === localId);
      if (!entry?.executionId || entry.status !== 'running') return prev;
      getWS('workflows').send('workflow:stop', { executionId: entry.executionId });
      return prev.map(e => e.localId === localId ? { ...e, status: 'stopped' as EntryStatus } : e);
    });
  }, []);

  const isExecuting = activeEntry?.status === 'running';

  if (!workflowId) return <div className="flex items-center justify-center h-full text-sm text-muted-foreground">{t('share.missingId')}</div>;
  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (!workflow) return <div className="flex items-center justify-center h-full text-sm text-muted-foreground">{t('share.notFound')}</div>;
  if (!workflow.published) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <Lock className="h-6 w-6 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium">{t('share.unpublishedTitle')}</p>
          <p className="text-xs text-muted-foreground max-w-xs">{t('share.unpublishedHint')}</p>
        </div>
      </div>
    );
  }

  const hasResult = activeEntry?.log && activeEntry.log.steps.length > 0;

  return (
    <div className="h-full flex flex-col p-4 gap-3">
      {/* Header */}
      <div className="flex items-center gap-3 shrink-0">
        <BackButton />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {workflow.icon ? <span className="text-xl leading-none">{workflow.icon}</span> : (
              <span className="w-6 h-6 rounded bg-primary/10 text-xs font-bold flex items-center justify-center text-primary shrink-0">{(workflow.name || 'W').charAt(0).toUpperCase()}</span>
            )}
            <h1 className="text-lg font-semibold truncate">{workflow.name}</h1>
            <span className="text-sm text-muted-foreground">{t('share.nodes', { count: workflow.nodes.length })}</span>
            {/* Execution tabs */}
            {entries.length > 0 && (
              <div className="flex items-center gap-1.5 shrink-0">
                {entries.map(entry => (
                  <button
                    key={entry.localId}
                    onClick={() => setActiveLocalId(entry.localId)}
                    className={cn(
                      "relative w-7 h-7 rounded-full text-xs font-medium flex items-center justify-center transition-colors shrink-0",
                      entry.localId === activeLocalId
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted hover:bg-muted-foreground/10 text-muted-foreground"
                    )}
                  >
                    {entry.localId}
                    {entry.status !== 'running' && (
                      <span className={cn(
                        "absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-background",
                        STATUS_COLORS[entry.status]
                      )} />
                    )}
                    {entry.status === 'running' && (
                      <span className={cn(
                        "absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-background",
                        STATUS_COLORS.running
                      )} />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          {workflow.description && <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">{workflow.description}</p>}
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col gap-3 md:flex-row">
        {/* Left: entry tabs + input form */}
        <div className="w-full shrink-0 flex flex-col gap-2 md:w-[360px]">
          {/* Input form */}
          <Card className="rounded-lg flex-1 min-h-0 flex flex-col md:flex-none">
            <CardHeader className="p-3 pb-2 shrink-0"><CardTitle className="text-xs">{t('share.params')}</CardTitle></CardHeader>
            <CardContent className="p-3 pt-0 flex-1 min-h-0 flex flex-col">
              {inputFields.length > 0 ? (
                <ExecutionInputForm fields={inputFields} initialValues={initialValues} onSubmit={handleExecute} disabled={false}
                  footer={submit => (
                    <div className="pt-2 shrink-0 flex gap-2">
                      <Button size="sm" className="h-7 text-xs gap-1 flex-1" onClick={submit}><Play className="h-3 w-3" /> {t('share.execute')}</Button>
                      {isExecuting && <Button variant="destructive" size="sm" className="h-7 text-xs gap-1" onClick={() => activeEntry && handleStop(activeEntry.localId)}><Square className="h-3 w-3" /> {t('share.stop')}</Button>}
                    </div>
                  )}
                />
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground mb-3">{t('share.noInputHint')}</p>
                    <Button size="sm" className="h-7 text-xs gap-1" onClick={() => handleExecute({})}>
                      <Play className="h-3 w-3" /> {t('share.execute')}
                    </Button>
                    {isExecuting && <Button variant="destructive" size="sm" className="h-7 text-xs gap-1 mt-2" onClick={() => activeEntry && handleStop(activeEntry.localId)}><Square className="h-3 w-3" /> {t('share.stop')}</Button>}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: results for active entry */}
        <div className="flex-1 min-w-0 flex flex-col gap-3 overflow-auto md:overflow-visible">
          {activeEntry ? (
              <div className="flex flex-col gap-3 min-h-0 flex-1 md:flex-row md:gap-3">
                {/* Steps - always visible */}
                {hasResult && (
                  <Card size="sm" className="m-px rounded-lg w-full shrink-0 flex max-h-[40vh] flex-col py-0 md:w-[320px] md:max-h-none">
                    <CardHeader className="p-3 pb-1 shrink-0"><CardTitle className="text-xs">Step</CardTitle></CardHeader>
                    <CardContent className="px-0 pb-0 flex-1 min-h-0 overflow-auto">
                      <ExecutionChecklist steps={activeEntry.log!.steps} />
                    </CardContent>
                  </Card>
                )}

                {/* Right content: result / loading / error */}
                {activeEntry.status === 'completed' && hasResult ? (
                  <div className="flex-1 min-w-0 flex flex-col gap-3">
                    <Card size="sm" className="m-px rounded-lg flex-1 min-h-0 flex flex-col py-0">
                      <CardHeader className="p-3 pb-1 shrink-0"><CardTitle className="text-xs">{t('share.jsonOutput')}</CardTitle></CardHeader>
                      <CardContent className="px-2 pb-2 flex-1 min-h-0 overflow-auto">
                        {endOutput !== null ? (
                          <JsonViewer data={endOutput as import('@/components/viewers/json-viewer').JsonValue} rootName="output" defaultExpanded={2} className="border-0 shadow-none" />
                        ) : (
                          <div className="flex items-center justify-center h-full text-xs text-muted-foreground">{t('share.noOutput')}</div>
                        )}
                      </CardContent>
                    </Card>

                    <Card size="sm" className="m-px rounded-lg shrink-0 py-0">
                      <div className="flex items-center justify-between p-3 pb-1">
                        <CardTitle className="text-xs">{t('share.fileOutput')}</CardTitle>
                        {fileOutputs.length > 0 && (
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={async () => {
                            try {
                              const zip = new JSZip();
                              const fetched = await Promise.all(fileOutputs.map(async f => {
                                const res = await fetch(f.url);
                                const blob = await res.blob();
                                return { name: f.name, blob };
                              }));
                              for (const f of fetched) zip.file(f.name, f.blob);
                              const content = await zip.generateAsync({ type: 'blob' });
                              const a = document.createElement('a');
                              a.href = URL.createObjectURL(content);
                              a.download = `${workflow?.name || 'workflow'}-output.zip`;
                              a.click();
                              URL.revokeObjectURL(a.href);
                            } catch { toast.error('Download failed'); }
                          }}>
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                      <CardContent className="px-3 pb-3">
                        {fileOutputs.length > 0 ? (
                          <div className="flex flex-wrap gap-3">
                            {fileOutputs.map((f, i) => (
                              <a key={i} href={f.url} target="_blank" rel="noopener noreferrer" className="group">
                                <FileCard formatFile={f.format} />
                                <div className="mt-1 text-[10px] text-muted-foreground text-center max-w-[56px] truncate group-hover:text-foreground transition-colors">
                                  {f.name}
                                </div>
                              </a>
                            ))}
                          </div>
                        ) : (
                          <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">{t('share.noFileOutput')}</div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                ) : activeEntry.status === 'running' ? (
                  <div className="flex-1 min-h-0 flex items-center justify-center">
                    <ModernLoader words={[t('share.executing')]} />
                  </div>
                ) : (
                  <Card className="rounded-lg flex-1 min-h-0 flex flex-col">
                    <CardContent className="flex-1 flex flex-col items-center justify-center gap-2">
                      {activeEntry.status === 'error' && <span className="text-xs text-red-500">{t('share.execError', { id: activeEntry.localId })}</span>}
                      {activeEntry.status === 'stopped' && <span className="text-xs text-yellow-600">{t('share.execStopped', { id: activeEntry.localId })}</span>}
                    </CardContent>
                  </Card>
                )}
              </div>
          ) : (
            <Card className="rounded-lg flex-1 min-h-0 flex flex-col">
              <CardContent className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
                {t('share.fillAndRun')}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
