'use client';

import { useState } from 'react';
import type { OutputField } from '@agent-spaces/shared';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { FileUpload, type FileUploadFile } from '@/components/ui/file-upload';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { sdk } from '@/lib/sdk';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Play } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import {
  isArrayOutputFieldType,
  isFileOutputFieldType,
  isStructuredOutputFieldType,
  stringifyOutputFieldValue,
} from './workflow-properties-utils';

type WorkflowUploadFile = FileUploadFile<File | WorkflowFileInput>;
type InputFormValue = string | WorkflowUploadFile[];

export function parseInputValue(field: OutputField, raw: string): unknown {
  if (field.type === 'file' || field.type === 'file[]') return field.type === 'file[]' ? [] : null;
  if (field.type === 'number') return raw === '' ? 0 : Number(raw);
  if (field.type === 'boolean') return raw === 'true';
  if (isStructuredOutputFieldType(field.type) || field.type === 'any' || isArrayOutputFieldType(field.type)) {
    if (!raw.trim()) return field.type === 'object' ? {} : isArrayOutputFieldType(field.type) ? [] : '';
    try {
      const parsed = JSON.parse(raw);
      return isArrayOutputFieldType(field.type) && !Array.isArray(parsed) ? raw : parsed;
    } catch {
      if (isStructuredOutputFieldType(field.type) || isArrayOutputFieldType(field.type)) {
        try {
          const parsed = JSON.parse(raw.replace(/，/g, ','));
          return isArrayOutputFieldType(field.type) && !Array.isArray(parsed) ? raw : parsed;
        } catch {
          return raw;
        }
      }
      return raw;
    }
  }
  return raw;
}

export interface ExecutionInputFormProps {
  fields: OutputField[];
  onSubmit: (values: Record<string, unknown>) => void | Promise<void>;
  submitLabel?: React.ReactNode;
  initialValues?: Record<string, string>;
  disabled?: boolean;
  footer?: (submit: () => void) => React.ReactNode;
}

export function ExecutionInputForm({ fields, onSubmit, submitLabel, initialValues, disabled, footer }: ExecutionInputFormProps) {
  const form = useExecutionInputFormState(fields, initialValues);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async () => {
    if (isSubmitting || disabled) return;
    if (!form.validate()) return;
    setIsSubmitting(true);
    try {
      await onSubmit(await form.parse());
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <ScrollArea className="min-h-0 flex-1 pr-2">
        <ExecutionInputFields fields={fields} form={form} disabled={disabled} />
      </ScrollArea>
      {footer ? footer(submit) : submitLabel ? (
        <DialogFooter>
          <Button size="sm" onClick={submit} disabled={isSubmitting || disabled}>
            {submitLabel}
          </Button>
        </DialogFooter>
      ) : null}
    </>
  );
}

function useExecutionInputFormState(fields: OutputField[], initialValues?: Record<string, string>) {
  const [values, setValues] = useState<Record<string, InputFormValue>>(() => {
    if (!initialValues) return {};
    const map: Record<string, InputFormValue> = {};
    for (const field of fields) {
      if (!field.key) continue;
      const init = initialValues[field.key];
      if (init === undefined) continue;
      map[field.key] = isFileOutputFieldType(field.type)
        ? restoreFileFieldValue(init, field.type === 'file[]')
        : init;
    }
    return map;
  });

  const [errors, setErrors] = useState<Record<string, boolean>>({});

  const setField = (key: string, value: InputFormValue) => {
    setValues(prev => ({ ...prev, [key]: value }));
    setErrors(prev => ({ ...prev, [key]: false }));
  };

  const validate = (): boolean => {
    const next: Record<string, boolean> = {};
    for (const field of fields) {
      if (!field.key || !field.required) continue;
      const val = values[field.key];
      const empty = isFileOutputFieldType(field.type)
        ? !Array.isArray(val) || val.length === 0
        : typeof val !== 'string' || val.trim() === '';
      if (empty) next[field.key] = true;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const parse = async () => parseInputFormValues(fields, values);

  return { values, setField, parse, validate, errors };
}

function ExecutionInputFields({
  fields,
  form,
  disabled,
}: {
  fields: OutputField[];
  form: ReturnType<typeof useExecutionInputFormState>;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-3 py-1 m-1">
      {fields.map(field => {
        const hasError = !!form.errors[field.key];
        return (
          <label key={field.key} className="block space-y-1.5">
            <span className="text-xs font-medium">
              {field.required && <span className="text-destructive mr-0.5">*</span>}
              {field.key}
              <span className="text-muted-foreground font-normal ml-1">({field.type})</span>
            </span>
            {field.description && (
              <span className="block text-[10px] text-muted-foreground">{field.description}</span>
            )}
            {isFileOutputFieldType(field.type) ? (
              <FileUpload
                className={cn('text-xs', hasError && 'border-destructive')}
                maxFiles={field.type === 'file[]' ? undefined : 1}
                value={getFileValue(form.values[field.key])}
                onChange={files => form.setField(field.key, files)}
                placeholder={field.key}
                fileNameFilter={field.fileNameFilter}
                disabled={disabled}
              />
            ) : field.inputMode === 'native' && field.type === 'select' ? (
              <Select
                value={getSelectValue(form.values[field.key], field.value)}
                onValueChange={value => value != null && form.setField(field.key, value)}
                disabled={disabled}
              >
                <SelectTrigger className={cn('h-8 text-xs w-full', hasError && 'border-destructive')}>
                  <SelectValue placeholder={field.key} />
                </SelectTrigger>
                <SelectContent>
                  {getSelectOptions(field.options).map(option => (
                    <SelectItem key={option} value={option} className="text-xs">
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : field.type === 'boolean' ? (
              <div className="flex items-center gap-2 h-8">
                <Switch
                  size="sm"
                  checked={getBooleanValue(form.values[field.key], field.value)}
                  onCheckedChange={checked => form.setField(field.key, String(checked))}
                  disabled={disabled}
                />
                <span className="text-xs text-muted-foreground">
                  {getBooleanValue(form.values[field.key], field.value) ? 'true' : 'false'}
                </span>
              </div>
            ) : (
              <Input
                className={cn('h-8 text-xs', hasError && 'border-destructive')}
                type={field.type === 'number' ? 'number' : 'text'}
                placeholder={field.key}
                value={getStringValue(form.values[field.key], field.value)}
                onChange={event => form.setField(field.key, event.target.value)}
                disabled={disabled}
              />
            )}
            {hasError && (
              <span className="text-[10px] text-destructive">This field is required</span>
            )}
          </label>
        );
      })}
    </div>
  );
}

function getSelectOptions(options: OutputField['options']) {
  return Array.isArray(options) ? options : [];
}

function getSelectValue(value: InputFormValue | undefined, fallback?: unknown): string | undefined {
  const selected = getStringValue(value, fallback);
  return selected || undefined;
}

async function parseInputFormValues(fields: OutputField[], values: Record<string, InputFormValue>) {
  const parsed: Record<string, unknown> = {};
  for (const field of fields) {
    if (!field.key) continue;
    if (isFileOutputFieldType(field.type)) {
      const files = values[field.key];
      parsed[field.key] = Array.isArray(files)
        ? field.type === 'file[]'
          ? await Promise.all(files.map(file => resolveWorkflowFileInput(file.file)))
          : await resolveWorkflowFileInput(files[0]?.file)
        : field.type === 'file[]' ? [] : null;
      continue;
    }
    parsed[field.key] = parseInputValue(field, getStringValue(values[field.key], field.value));
  }
  return parsed;
}

function getStringValue(value: InputFormValue | undefined, fallback?: unknown): string {
  return typeof value === 'string' ? value : stringifyOutputFieldValue(fallback);
}

function getBooleanValue(value: InputFormValue | undefined, fallback?: unknown): boolean {
  const str = getStringValue(value, fallback);
  return str === 'true';
}

function getFileValue(value: InputFormValue | undefined): WorkflowUploadFile[] {
  return Array.isArray(value) ? value : [];
}

function restoreFileFieldValue(saved: string, isArray: boolean): WorkflowUploadFile[] {
  try {
    const parsed = JSON.parse(saved);
    if (isArray) {
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isWorkflowFileInput).map((file: WorkflowFileInput, i: number) => ({ id: `restored-${i}`, file }));
    }
    if (!isWorkflowFileInput(parsed)) return [];
    return [{ id: 'restored-0', file: parsed }];
  } catch {
    return [];
  }
}

type WorkflowFileInput = {
  path: string;
  relativePath: string;
  name: string;
  size: number;
  type: string;
  url?: string;
  httpPath?: string;
};

type UploadedWorkflowFile = {
  name: string;
  path: string;
  size: number;
  type: string;
  url: string;
  httpPath?: string;
};

function isWorkflowFileInput(value: unknown): value is WorkflowFileInput {
  if (!value || typeof value !== 'object') return false;
  const file = value as Partial<WorkflowFileInput>;
  return typeof file.name === 'string'
    && typeof file.path === 'string'
    && typeof file.size === 'number'
    && typeof file.type === 'string';
}

async function resolveWorkflowFileInput(file?: File | WorkflowFileInput): Promise<WorkflowFileInput | null> {
  if (!file) return null;
  if (!(file instanceof File)) return file;

  const relativePath = getFileRelativePath(file);
  const localPath = getElectronFilePath(file);
  if (isElectronEnvironment() && localPath) {
    return {
      path: localPath,
      relativePath,
      name: file.name,
      size: file.size,
      type: file.type,
    };
  }

  const formData = new FormData();
  formData.append('file', file);
  const uploaded = await sdk.http.upload<UploadedWorkflowFile>('/api/upload', formData);

  return {
    path: uploaded.path,
    relativePath,
    name: uploaded.name || file.name,
    size: uploaded.size || file.size,
    type: uploaded.type || file.type,
    url: uploaded.url,
    httpPath: uploaded.httpPath,
  };
}

function getFileRelativePath(file: File): string {
  const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
  return relativePath || file.name;
}

function getElectronFilePath(file: File): string | null {
  const path = (file as File & { path?: string }).path;
  return typeof path === 'string' && path.trim() ? path : null;
}

function isElectronEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  const maybeWindow = window as Window & {
    electron?: unknown;
    electronAPI?: { isElectron?: boolean };
    require?: unknown;
  };
  if (maybeWindow.electronAPI?.isElectron === true) return true;
  const userAgent = navigator.userAgent.toLowerCase();
  return Boolean(maybeWindow.electron || maybeWindow.electronAPI || userAgent.includes('electron'));
}

function getStorageKey(workflowId: string, startNodeLabel: string) {
  return `agent-spaces:workflow-input:${workflowId}:${startNodeLabel}`;
}

function loadSavedValues(workflowId: string, startNodeLabel: string): Record<string, string> | undefined {
  try {
    const raw = localStorage.getItem(getStorageKey(workflowId, startNodeLabel));
    return raw ? JSON.parse(raw) : undefined;
  } catch { return undefined; }
}

function saveValues(workflowId: string, startNodeLabel: string, values: Record<string, unknown>) {
  const stringified: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) {
    if (v != null) stringified[k] = typeof v === 'string' ? v : JSON.stringify(v);
  }
  localStorage.setItem(getStorageKey(workflowId, startNodeLabel), JSON.stringify(stringified));
}

export function ExecutionInputDialog({
  open, fields, variableFields = [], startNodeLabel, onOpenChange, onSubmit, workflowId,
}: {
  open: boolean;
  fields: OutputField[];
  variableFields?: OutputField[];
  startNodeLabel: string;
  workflowId?: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: Record<string, unknown>, env?: Record<string, unknown>) => void | Promise<void>;
}) {
  const t = useTranslations('workflows');
  const savedValues = workflowId ? loadSavedValues(workflowId, startNodeLabel) : undefined;
  const savedEnvValues = workflowId ? loadSavedValues(workflowId, `${startNodeLabel}:__env__`) : undefined;
  const hasInputFields = fields.length > 0;
  const hasVariableFields = variableFields.length > 0;
  const submit = async (values: Record<string, unknown>, env?: Record<string, unknown>) => {
    if (workflowId) {
      saveValues(workflowId, startNodeLabel, values);
      if (env) saveValues(workflowId, `${startNodeLabel}:__env__`, env);
    }
    await onSubmit(values, env);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-sm">{startNodeLabel}</DialogTitle>
        </DialogHeader>
        {hasInputFields && !hasVariableFields ? (
          <ExecutionInputForm
            fields={fields}
            initialValues={savedValues}
            onSubmit={(values) => submit(values)}
            submitLabel={<><Play className="h-3 w-3 mr-1" /> {t('execution.startExecution')}</>}
          />
        ) : hasVariableFields && !hasInputFields ? (
          <ExecutionInputForm
            fields={variableFields}
            initialValues={savedEnvValues}
            onSubmit={(env) => submit({}, env)}
            submitLabel={<><Play className="h-3 w-3 mr-1" /> {t('execution.startExecution')}</>}
          />
        ) : (
          <CombinedExecutionInputForm
            fields={fields}
            variableFields={variableFields}
            initialValues={savedValues}
            initialEnvValues={savedEnvValues}
            onSubmit={submit}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CombinedExecutionInputForm({
  fields,
  variableFields,
  initialValues,
  initialEnvValues,
  onSubmit,
}: {
  fields: OutputField[];
  variableFields: OutputField[];
  initialValues?: Record<string, string>;
  initialEnvValues?: Record<string, string>;
  onSubmit: (values: Record<string, unknown>, env: Record<string, unknown>) => void | Promise<void>;
}) {
  const t = useTranslations('workflows');
  const inputForm = useExecutionInputFormState(fields, initialValues);
  const envForm = useExecutionInputFormState(variableFields, initialEnvValues);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async () => {
    if (isSubmitting) return;
    const inputValid = inputForm.validate();
    const envValid = envForm.validate();
    if (!inputValid || !envValid) return;
    setIsSubmitting(true);
    try {
      const [values, env] = await Promise.all([inputForm.parse(), envForm.parse()]);
      await onSubmit(values, env);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="min-h-0 flex-1">
        <div className="mb-2 text-xs font-medium">{t('execution.workflowInput')}</div>
        <ScrollArea className="max-h-[28vh] pr-2">
          <ExecutionInputFields fields={fields} form={inputForm} disabled={isSubmitting} />
        </ScrollArea>
      </div>
      <div className="min-h-0 flex-1 border-t pt-3">
        <div className="mb-2 text-xs font-medium">{t('execution.initVariables')}</div>
        <ScrollArea className="max-h-[28vh] pr-2">
          <ExecutionInputFields fields={variableFields} form={envForm} disabled={isSubmitting} />
        </ScrollArea>
      </div>
      <DialogFooter>
        <Button size="sm" onClick={submit} disabled={isSubmitting}>
          <Play className="h-3 w-3 mr-1" /> {t('execution.startExecution')}
        </Button>
      </DialogFooter>
    </div>
  );
}
