'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { fetchWithAuth } from '@/lib/auth';
import { resolveServerAssetUrl } from '@/lib/server';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { pluginApi } from '@/lib/workflow-plugin-api';
import { JsonViewer } from '@/components/viewers/json-viewer';
import { PluginIcon } from '@/components/workflow/workflow-plugin-icon';

interface PluginTool {
  name: string;
  description: string;
  input_schema?: Record<string, unknown>;
}

interface ToolExecuteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pluginId: string;
  pluginName: string;
  pluginIconPath?: string;
  tool: PluginTool | null;
}

/** Extract a typed array of property descriptors from JSON Schema input_schema. */
function parseSchemaProperties(schema: Record<string, unknown> | undefined) {
  if (!schema?.properties || typeof schema.properties !== 'object') return [];
  const required = new Set<string>(
    Array.isArray(schema.required) ? schema.required.map(String) : [],
  );
  return Object.entries(schema.properties as Record<string, Record<string, unknown>>).map(
    ([key, prop]) => ({
      key,
      label: (prop.title as string) || key,
      description: prop.description as string | undefined,
      type: mapSchemaType(prop),
      required: required.has(key),
      default: prop.default,
      enumOptions: Array.isArray(prop.enum)
        ? (prop.enum as unknown[]).map((v) => ({ label: String(v), value: String(v) }))
        : undefined,
    }),
  );
}

type FieldType = 'string' | 'number' | 'boolean' | 'select' | 'array' | 'object';

function mapSchemaType(prop: Record<string, unknown>): FieldType {
  const t = prop.type as string | undefined;
  if (t === 'number' || t === 'integer') return 'number';
  if (t === 'boolean') return 'boolean';
  if (Array.isArray(prop.enum)) return 'select';
  if (t === 'array') return 'array';
  if (t === 'object') return 'object';
  return 'string';
}

export function MiniAppToolExecuteDialog({
  open,
  onOpenChange,
  pluginId,
  pluginName,
  pluginIconPath,
  tool,
}: ToolExecuteDialogProps) {
  const t = useTranslations('mini-apps');
  const [config, setConfig] = useState<Record<string, string>>({});
  const [args, setArgs] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<{ data: unknown } | { error: string } | null>(null);

  const fields = useMemo(() => parseSchemaProperties(tool?.input_schema), [tool?.input_schema]);

  const buildDefaults = useCallback((cfg: Record<string, string>) => {
    const initial: Record<string, unknown> = {};
    fields.forEach((f) => {
      if (f.default !== undefined) {
        initial[f.key] = f.default;
      } else if (cfg[f.key] !== undefined && cfg[f.key] !== '') {
        initial[f.key] = f.type === 'number' ? Number(cfg[f.key]) : cfg[f.key];
      } else if (f.type === 'boolean') {
        initial[f.key] = false;
      }
    });
    return initial;
  }, [fields]);

  // Load plugin config + reset args when tool changes
  useEffect(() => {
    if (!open || !tool) return;
    setLoading(true);
    setResult(null);

    pluginApi
      .getConfig(pluginId)
      .then((cfg) => {
        setConfig(cfg);
        setArgs(buildDefaults(cfg));
      })
      .catch(() => setArgs({}))
      .finally(() => setLoading(false));
  }, [open, pluginId, tool, buildDefaults]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = useCallback((key: string, value: unknown) => {
    setArgs((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleExecute = useCallback(async () => {
    if (!tool) return;
    setExecuting(true);
    setResult(null);
    try {
      const resp = await fetchWithAuth(`/api/plugins/${pluginId}/tools/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: tool.name, args }),
      });
      const data = await resp.json();
      setResult({ data });
    } catch (error: unknown) {
      setResult({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      setExecuting(false);
    }
  }, [pluginId, tool, args]);

  const handleClose = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        setResult(null);
        setArgs({});
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange],
  );

  const hasResult = result !== null;
  const isWideScreen = hasResult;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="!w-[80vw] !h-[80vh] !max-w-none sm:!max-w-none !flex !flex-col !overflow-hidden !gap-0">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <PluginIcon
              source={pluginIconPath ? { type: 'url', url: resolveServerAssetUrl(`/api/plugins/${pluginId}/icon`) } : { type: 'builtin', variant: 'local' }}
            />
            {pluginName} / {tool?.name}
          </DialogTitle>
          {tool?.description && (
            <p className="text-xs text-muted-foreground">{tool.description}</p>
          )}
        </DialogHeader>

        <div className={`flex-1 min-h-0 overflow-hidden grid gap-4 ${isWideScreen ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {/* Left: parameters */}
          <div className="min-w-0 flex flex-col overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : fields.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground">
                {t('toolExecute.noParams')}
              </div>
            ) : (
              <ScrollArea className="flex-1 overflow-hidden">
                <div className="space-y-3 pr-2">
                  {fields.map((field) => (
                    <FieldRow
                      key={field.key}
                      field={field}
                      value={args[field.key]}
                      onChange={(v) => handleChange(field.key, v)}
                    />
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>

          {/* Right: result (only when wide screen / result exists) */}
          {isWideScreen && (
            <div className="min-w-0 border-l pl-4 flex flex-col overflow-hidden">
              {'error' in result! ? (
                <div className="rounded border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
                  {result.error}
                </div>
              ) : (
                <ScrollArea className="flex-1 overflow-hidden">
                  <JsonViewer data={result.data as any} rootName="result" defaultExpanded={2} />
                </ScrollArea>
              )}
            </div>
          )}
        </div>

        <div className="shrink-0 flex items-center justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={() => { setArgs(buildDefaults(config)); setResult(null); }}>
            {t('toolExecute.reset')}
          </Button>
          <Button size="sm" disabled={executing || loading} onClick={handleExecute}>
            {executing && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
            {t('toolExecute.execute')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Field row (mirrors PropertyField style) ──────────────────────────

function FieldRow({
  field,
  value,
  onChange,
}: {
  field: ReturnType<typeof parseSchemaProperties>[number];
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="flex items-center gap-1 text-xs font-medium">
        {field.label}
        {field.required && <span className="text-destructive">*</span>}
      </label>
      <FieldInput field={field} value={value} onChange={onChange} />
      {field.description && (
        <p className="text-[10px] text-muted-foreground">{field.description}</p>
      )}
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: ReturnType<typeof parseSchemaProperties>[number];
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  switch (field.type) {
    case 'number':
      return (
        <Input
          type="number"
          value={value !== undefined ? String(value) : ''}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
          placeholder={field.description}
          className="h-7 text-xs"
        />
      );

    case 'boolean':
      return (
        <Switch
          size="sm"
          checked={Boolean(value)}
          onCheckedChange={onChange}
        />
      );

    case 'select':
      return (
        <Select
          value={value !== undefined ? String(value) : ''}
          onValueChange={onChange}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {field.enumOptions?.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case 'array':
    case 'object':
      return (
        <Textarea
          value={
            value !== undefined
              ? typeof value === 'string'
                ? value
                : JSON.stringify(value, null, 2)
              : ''
          }
          onChange={(e) => {
            const raw = e.target.value;
            try {
              onChange(JSON.parse(raw));
            } catch {
              onChange(raw);
            }
          }}
          placeholder={field.description || (field.type === 'array' ? '[]' : '{}')}
          className="min-h-[72px] text-xs font-mono"
        />
      );

    default: // string
      return (
        <Input
          value={value !== undefined ? String(value) : ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.description}
          className="h-7 text-xs"
        />
      );
  }
}
