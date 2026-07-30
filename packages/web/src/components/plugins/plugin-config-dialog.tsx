'use client';

import { useEffect, useState } from 'react';
import type { PluginConfigField } from '@agent-spaces/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { pluginApi, pluginConfigSchemeApi, workflowPluginSchemeApi } from '@/lib/workflow-plugin-api';

export function PluginConfigDialog({
  open,
  onOpenChange,
  pluginId,
  pluginName,
  config,
  schemeName,
  legacyWorkflowId,
  loadValues,
  saveValues,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pluginId: string | null;
  pluginName: string;
  config: PluginConfigField[];
  schemeName?: string;
  legacyWorkflowId?: string;
  loadValues?: () => Promise<Record<string, string>>;
  saveValues?: (values: Record<string, string>) => Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !pluginId) return;
    setError('');
    const load = async () => {
      try {
        setValues(loadValues
          ? await loadValues()
          : schemeName
            ? await pluginConfigSchemeApi.read(pluginId, schemeName)
            : await pluginApi.getConfig(pluginId));
      } catch {
        if (schemeName && legacyWorkflowId) {
          const legacyValues = await workflowPluginSchemeApi.read(legacyWorkflowId, pluginId, schemeName);
          await pluginConfigSchemeApi.save(pluginId, schemeName, legacyValues);
          setValues(legacyValues);
        } else {
          setValues(await pluginApi.getConfig(pluginId));
        }
      }
    };
    void load();
  }, [legacyWorkflowId, loadValues, open, pluginId, schemeName]);

  function setField(key: string, value: string) {
    setValues(prev => ({ ...prev, [key]: value }));
  }

  function validate(): string | null {
    for (const field of config) {
      if (field.type === 'object' && values[field.key]?.trim()) {
        try {
          JSON.parse(values[field.key]);
        } catch {
          return `"${field.label}" 不是合法 JSON`;
        }
      }
      if (field.required && !values[field.key]?.trim()) return `"${field.label}" 不能为空`;
    }
    return null;
  }

  async function save() {
    if (!pluginId) return;
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (saveValues) {
        await saveValues(values);
      } else if (schemeName) {
        await pluginConfigSchemeApi.save(pluginId, schemeName, values);
      } else {
        const result = await pluginApi.saveConfig(pluginId, values);
        if (!result.success) {
          setError(result.error || '保存失败');
          return;
        }
      }
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">
            {pluginName} - 设置{schemeName ? ` (${schemeName})` : ''}
          </DialogTitle>
          <DialogDescription>配置插件参数</DialogDescription>
        </DialogHeader>

        {error && <div className="rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

        <div className="space-y-4">
          {config.map(field => (
            <div key={field.key} className="space-y-1.5">
              <Label htmlFor={`plugin-config-${field.key}`} className="text-xs">
                {field.label}{field.required && <span className="text-destructive"> *</span>}
              </Label>
              {(field.type === 'string' || field.type === 'number') && (
                <Input
                  id={`plugin-config-${field.key}`}
                  type={field.type === 'number' ? 'number' : 'text'}
                  value={values[field.key] ?? ''}
                  placeholder={field.placeholder}
                  onChange={(event) => setField(field.key, event.target.value)}
                />
              )}
              {field.type === 'boolean' && (
                <div className="flex h-9 items-center gap-2">
                  <Switch
                    id={`plugin-config-${field.key}`}
                    checked={values[field.key] === 'true'}
                    onCheckedChange={(checked) => setField(field.key, checked ? 'true' : 'false')}
                  />
                  <span className="text-sm text-muted-foreground">{values[field.key] === 'true' ? '开启' : '关闭'}</span>
                </div>
              )}
              {field.type === 'select' && (
                <Select value={values[field.key] ?? ''} onValueChange={(value) => setField(field.key, value ?? '')}>
                  <SelectTrigger id={`plugin-config-${field.key}`}>
                    <SelectValue placeholder="请选择..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(field.options || []).map(option => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {field.type === 'object' && (
                <Textarea
                  id={`plugin-config-${field.key}`}
                  value={values[field.key] ?? ''}
                  placeholder={field.placeholder || '{}'}
                  rows={4}
                  className="font-mono text-xs"
                  onChange={(event) => setField(field.key, event.target.value)}
                />
              )}
              {field.desc && <p className="text-[11px] text-muted-foreground">{field.desc}</p>}
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={save} disabled={saving || !pluginId}>{saving ? '保存中...' : '保存'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
