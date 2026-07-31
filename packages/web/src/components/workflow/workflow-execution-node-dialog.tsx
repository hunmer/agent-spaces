'use client';

import { useState } from 'react';
import type { OutputField, NodeProperty } from '@agent-spaces/shared';
import { ExecutionInputForm } from './workflow-execution-input-dialog';
import { getEffectiveDataType } from './workflow-properties-utils';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { SearchSelect } from '@/components/ui/search-select';
import { Button } from '@/components/ui/button';
import { Play } from 'lucide-react';

export interface ExecutionNodeDialogProps {
  open: boolean;
  inputFields: OutputField[];
  properties: NodeProperty[];
  propertyValues: Record<string, unknown>;
  nodeLabel: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { inputs: Record<string, unknown>; properties: Record<string, unknown> }) => void | Promise<void>;
}

export function ExecutionNodeDialog({
  open, inputFields, properties, propertyValues, nodeLabel, onOpenChange, onSubmit,
}: ExecutionNodeDialogProps) {
  const [propValues, setPropValues] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const setProp = (key: string, value: string) => {
    setPropValues(prev => ({ ...prev, [key]: value }));
  };

  // 只展示 text/textarea/number/select 类型的简单属性
  const simpleProperties = properties.filter(p =>
    p.type === 'text' || p.type === 'textarea' || p.type === 'number' || p.type === 'select'
  );

  const hasInputFields = inputFields.length > 0;
  const hasProperties = simpleProperties.length > 0;

  const submit = async (inputValues: Record<string, unknown>) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const parsedProps: Record<string, unknown> = {};
      for (const prop of simpleProperties) {
        const raw = propValues[prop.key] ?? stringifyValue(propertyValues[prop.key] ?? prop.default);
        const dt = getEffectiveDataType(prop);
        if (dt === 'number') {
          parsedProps[prop.key] = raw === '' ? undefined : Number(raw);
        } else if (dt === 'string[]' || dt === 'number[]' || dt === 'object[]') {
          if (typeof raw === 'string' && raw.trim().startsWith('[')) {
            try { parsedProps[prop.key] = JSON.parse(raw); }
            catch { parsedProps[prop.key] = raw; }
          } else {
            parsedProps[prop.key] = raw;
          }
        } else if (dt === 'object') {
          if (typeof raw === 'string' && raw.trim().startsWith('{')) {
            try { parsedProps[prop.key] = JSON.parse(raw); }
            catch { parsedProps[prop.key] = raw; }
          } else {
            parsedProps[prop.key] = raw;
          }
        } else {
          parsedProps[prop.key] = raw;
        }
      }
      await onSubmit({ inputs: inputValues, properties: parsedProps });
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-sm">节点测试 · {nodeLabel}</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto pr-2 space-y-4">
          {hasInputFields && (
            <section className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">输入字段</div>
              <ExecutionInputForm
                fields={inputFields}
                onSubmit={submit}
              />
            </section>
          )}

          {hasProperties && (
            <section className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">属性</div>
              <div className="space-y-3 py-1">
                {simpleProperties.map(prop => (
                  <label key={prop.key} className="block space-y-1.5">
                    <span className="text-xs font-medium">
                      {prop.required && <span className="text-destructive mr-0.5">*</span>}
                      {prop.label || prop.key}
                    </span>
                    {prop.type === 'select' ? (
                      <SearchSelect
                        value={propValues[prop.key] ?? stringifyValue(propertyValues[prop.key] ?? prop.default)}
                        onChange={v => setProp(prop.key, v)}
                        options={(prop.options ?? []).map(opt => ({ value: opt.value, label: opt.label }))}
                        placeholder={prop.label || prop.key}
                        allowCustom={false}
                      />
                    ) : (
                      <Input
                        className="h-8 text-xs"
                        type={prop.type === 'number' ? 'number' : 'text'}
                        placeholder={prop.label || prop.key}
                        value={propValues[prop.key] ?? stringifyValue(propertyValues[prop.key] ?? prop.default)}
                        onChange={e => setProp(prop.key, e.target.value)}
                      />
                    )}
                  </label>
                ))}
              </div>
            </section>
          )}

          {!hasInputFields && !hasProperties && (
            <div className="py-4 text-center text-xs text-muted-foreground">无可配置的输入或属性</div>
          )}
        </div>

        <div className="flex justify-end pt-2 border-t">
          <Button size="sm" onClick={() => submit({})} disabled={isSubmitting}>
            <Play className="h-3 w-3 mr-1" /> 开始测试
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function stringifyValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  return String(value);
}
