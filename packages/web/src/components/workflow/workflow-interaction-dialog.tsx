'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { InteractionRequest } from '@agent-spaces/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { parseRoute, serializeRoute } from '@/components/mini-apps/mini-app-router';

type FormItem = {
  id?: string;
  title?: string;
  type?: string;
  data?: {
    value?: unknown;
    placeholder?: string;
    options?: Array<{ label?: string; value?: string } | string>;
  };
};

type MiniAppMessage = {
  source?: string;
  payload?: unknown;
  cancelled?: boolean;
};

function schemaRecord(request: InteractionRequest | null): Record<string, unknown> {
  return request?.schema && typeof request.schema === 'object' ? request.schema as Record<string, unknown> : {};
}

function getFormInitialValues(items: FormItem[]): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const item of items) {
    if (!item.id) continue;
    if (item.type === 'checkbox') values[item.id] = Boolean(item.data?.value);
    else values[item.id] = item.data?.value ?? '';
  }
  return values;
}

function miniAppUrlFromSchema(schema: Record<string, unknown>): string {
  const miniAppId = typeof schema.miniAppId === 'string' ? schema.miniAppId : '';
  const routeInput = typeof schema.route === 'string' && schema.route.trim() ? schema.route.trim() : '/';
  const routeState = parseRoute(routeInput);

  if (schema.params && typeof schema.params === 'object' && !Array.isArray(schema.params)) {
    routeState.query.payload = JSON.stringify(schema.params);
  }

  const route = serializeRoute(routeState);
  const params = new URLSearchParams({ id: miniAppId });
  if (route) params.set('route', route);
  return `/mini-apps-preview?${params.toString()}`;
}

interface WorkflowInteractionDialogProps {
  request: InteractionRequest | null;
  onResolve: (request: InteractionRequest, data: unknown) => void;
  onCancel: (request: InteractionRequest) => void;
}

export function WorkflowInteractionDialog({
  request,
  onResolve,
  onCancel,
}: WorkflowInteractionDialogProps) {
  const schema = useMemo(() => schemaRecord(request), [request]);
  const items = useMemo(() => Array.isArray(schema.items) ? schema.items as FormItem[] : [], [schema]);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [promptValue, setPromptValue] = useState('');
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});
  const [selectedRows, setSelectedRows] = useState<string[]>([]);

  useEffect(() => {
    setPromptValue(String(schema.defaultValue ?? ''));
    setFormValues(getFormInitialValues(items));
    setSelectedRows([]);
  }, [request?.id, schema.defaultValue, items]);

  useEffect(() => {
    if (!request || request.interactionType !== 'miniapp_confirm') return undefined;

    const handleMessage = (event: MessageEvent<MiniAppMessage>) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data;
      if (!data || data.source !== 'agent-spaces:workflow-miniapp-submit') return;
      if (data.cancelled) {
        onCancel(request);
        return;
      }
      onResolve(request, data.payload ?? null);
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [request, onResolve, onCancel]);

  if (!request) return null;

  const title = String(schema.title || (request.interactionType === 'dialog_prompt' ? '请输入' : '提示'));
  const message = String(schema.message || schema.description || '');
  const selectionMode = String(schema.selectionMode || 'none');
  const headers = Array.isArray(schema.headers) ? schema.headers as Array<{ id: string; title?: string }> : [];
  const cells = Array.isArray(schema.cells) ? schema.cells as Array<{ id: string; data?: Record<string, unknown> }> : [];
  const miniAppUrl = request.interactionType === 'miniapp_confirm' ? miniAppUrlFromSchema(schema) : '';

  const confirm = () => {
    if (request.interactionType === 'dialog_prompt') {
      onResolve(request, { value: promptValue });
      return;
    }
    if (request.interactionType === 'dialog_form') {
      onResolve(request, formValues);
      return;
    }
    if (request.interactionType === 'table_confirm') {
      onResolve(request, { selectedRowIds: selectedRows, selectedCount: selectedRows.length });
      return;
    }
    onResolve(request, { confirmed: true });
  };

  const toggleRow = (rowId: string) => {
    if (selectionMode === 'single') {
      setSelectedRows((prev) => (prev.includes(rowId) ? [] : [rowId]));
      return;
    }
    setSelectedRows((prev) => (prev.includes(rowId) ? prev.filter((id) => id !== rowId) : [...prev, rowId]));
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(request); }}>
      <DialogContent className={request.interactionType === 'miniapp_confirm' ? 'max-w-5xl' : 'sm:max-w-lg'}>
        <DialogHeader>
          <DialogTitle className="text-sm">{title}</DialogTitle>
        </DialogHeader>

        {request.interactionType === 'dialog_alert' && (
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{message}</p>
        )}

        {request.interactionType === 'dialog_prompt' && (
          <div className="space-y-3">
            {message && <p className="text-sm text-muted-foreground">{message}</p>}
            <Input
              value={promptValue}
              placeholder={String(schema.placeholder || '')}
              onChange={(event) => setPromptValue(event.target.value)}
              autoFocus
            />
          </div>
        )}

        {request.interactionType === 'dialog_form' && (
          <ScrollArea className="max-h-[55vh] pr-3">
            <div className="space-y-4">
              {items.map((item) => {
                const id = item.id || '';
                if (!id) return null;
                const label = item.title || id;
                const placeholder = item.data?.placeholder || '';
                const value = formValues[id];
                if (item.type === 'textarea') {
                  return (
                    <div key={id} className="space-y-2">
                      <Label>{label}</Label>
                      <Textarea value={String(value ?? '')} placeholder={placeholder} onChange={(event) => setFormValues((v) => ({ ...v, [id]: event.target.value }))} />
                    </div>
                  );
                }
                if (item.type === 'checkbox') {
                  return (
                    <Label key={id} className="gap-2">
                      <input type="checkbox" checked={Boolean(value)} onChange={(event) => setFormValues((v) => ({ ...v, [id]: event.target.checked }))} />
                      {label}
                    </Label>
                  );
                }
                if (item.type === 'select') {
                  const options = Array.isArray(item.data?.options) ? item.data.options : [];
                  return (
                    <div key={id} className="space-y-2">
                      <Label>{label}</Label>
                      <Select value={String(value ?? '')} onValueChange={(next) => setFormValues((v) => ({ ...v, [id]: next }))}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={placeholder || '请选择'} />
                        </SelectTrigger>
                        <SelectContent>
                          {options.map((option, index) => {
                            const optionValue = typeof option === 'string' ? option : option.value || '';
                            const optionLabel = typeof option === 'string' ? option : option.label || optionValue;
                            return <SelectItem key={`${optionValue}-${index}`} value={optionValue}>{optionLabel}</SelectItem>;
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                }
                return (
                  <div key={id} className="space-y-2">
                    <Label>{label}</Label>
                    <Input
                      type={item.type === 'number' ? 'number' : 'text'}
                      value={String(value ?? '')}
                      placeholder={placeholder}
                      onChange={(event) => setFormValues((v) => ({ ...v, [id]: item.type === 'number' ? Number(event.target.value) : event.target.value }))}
                    />
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}

        {request.interactionType === 'table_confirm' && (
          <ScrollArea className="max-h-[55vh]">
            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    {selectionMode !== 'none' && <th className="w-10 p-2" />}
                    {headers.map((header) => <th key={header.id} className="p-2 text-left font-medium">{header.title || header.id}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {cells.map((cell) => (
                    <tr key={cell.id} className="border-t">
                      {selectionMode !== 'none' && (
                        <td className="p-2">
                          <input type={selectionMode === 'single' ? 'radio' : 'checkbox'} checked={selectedRows.includes(cell.id)} onChange={() => toggleRow(cell.id)} />
                        </td>
                      )}
                      {headers.map((header) => <td key={header.id} className="p-2">{String(cell.data?.[header.id] ?? '')}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ScrollArea>
        )}

        {request.interactionType === 'miniapp_confirm' && (
          <div className="space-y-3">
            {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
            <div className="overflow-hidden rounded-lg border border-border bg-background">
              <iframe
                ref={iframeRef}
                title={String(schema.miniAppId || 'miniapp')}
                src={miniAppUrl}
                className="h-[70vh] w-full bg-background"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          {request.interactionType === 'miniapp_confirm' ? (
            <Button variant="ghost" size="sm" onClick={() => onCancel(request)}>取消</Button>
          ) : (
            <>
              {request.interactionType !== 'dialog_alert' && (
                <Button variant="ghost" size="sm" onClick={() => onCancel(request)}>取消</Button>
              )}
              <Button size="sm" onClick={confirm}>确定</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
