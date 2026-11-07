'use client';

import { useState, useCallback, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import type { WorkflowTrigger } from '@agent-spaces/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { Plus, Trash2, Clock, Globe, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';

interface TriggerDialogProps {
  open: boolean;
  triggers: WorkflowTrigger[];
  onSave: (triggers: WorkflowTrigger[]) => void;
  onClose: () => void;
  workflowId: string;
  validateCron?: (expr: string) => Promise<{ valid: boolean; error?: string; nextRuns?: string[] }>;
  checkHookName?: (name: string) => Promise<{ available: boolean }>;
}

const CRON_PRESETS = [
  { labelKey: 'presets.everyMinute', value: '* * * * *' },
  { labelKey: 'presets.every5Minutes', value: '*/5 * * * *' },
  { labelKey: 'presets.every30Minutes', value: '*/30 * * * *' },
  { labelKey: 'presets.everyHour', value: '0 * * * *' },
  { labelKey: 'presets.dailyAt0', value: '0 0 * * *' },
  { labelKey: 'presets.dailyAt8', value: '0 8 * * *' },
  { labelKey: 'presets.mondayAt9', value: '0 9 * * 1' },
  { labelKey: 'presets.firstOfMonthAt0', value: '0 0 1 * *' },
];

function CronEditor({
  value, onChange, isValidating, validationResult,
}: {
  value: string;
  onChange: (v: string) => void;
  isValidating: boolean;
  validationResult: { valid: boolean; error?: string; nextRuns?: string[] } | null;
}) {
  const t = useTranslations('workflows.triggerDialog');
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="* * * * *"
          className="h-7 text-xs font-mono flex-1"
        />
        {isValidating ? (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        ) : validationResult && (
          validationResult.valid
            ? <CheckCircle className="h-3 w-3 text-green-500" />
            : <AlertCircle className="h-3 w-3 text-destructive" />
        )}
      </div>

      {validationResult && !validationResult.valid && (
        <p className="text-[10px] text-destructive">{validationResult.error}</p>
      )}

      {validationResult?.nextRuns && validationResult.nextRuns.length > 0 && (
        <div className="text-[10px] text-muted-foreground">
          <span className="font-medium">{t('nextRuns')}</span>
          {validationResult.nextRuns.slice(0, 3).map((run, i) => (
            <span key={i} className="ml-1">{run}</span>
          ))}
        </div>
      )}

      {/* Presets */}
      <div className="flex flex-wrap gap-1">
        {CRON_PRESETS.map(preset => (
          <Badge
            key={preset.value}
            variant={value === preset.value ? 'default' : 'secondary'}
            className="cursor-pointer text-[9px] px-1.5 py-0"
            onClick={() => onChange(preset.value)}
          >
            {t(preset.labelKey)}
          </Badge>
        ))}
      </div>
    </div>
  );
}

export function WorkflowTriggerDialog({
  open, triggers, onSave, onClose, workflowId, validateCron, checkHookName,
}: TriggerDialogProps) {
  const t = useTranslations('workflows.triggerDialog');
  const [edited, setEdited] = useState<WorkflowTrigger[]>([]);
  const [cronValidation, setCronValidation] = useState<Record<string, { valid: boolean; error?: string; nextRuns?: string[] }>>({});
  const [validating, setValidating] = useState<string | null>(null);
  const [hookAvailability, setHookAvailability] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (open) {
      setEdited(triggers.length > 0 ? structuredClone(triggers) : []);
    }
  }, [open, triggers]);

  const handleCronChange = useCallback((id: string, expr: string) => {
    setEdited(prev => prev.map(t =>
      t.id === id ? { ...t, cron: expr } : t
    ));
    if (validateCron && expr) {
      setValidating(id);
      validateCron(expr).then(result => {
        setCronValidation(prev => ({ ...prev, [id]: result }));
        setValidating(null);
      });
    }
  }, [validateCron]);

  const handleHookNameChange = useCallback((id: string, name: string) => {
    setEdited(prev => prev.map(t =>
      t.id === id ? { ...t, hookName: name } : t
    ));
    if (checkHookName && name) {
      checkHookName(name).then(result => {
        setHookAvailability(prev => ({ ...prev, [id]: result.available }));
      });
    }
  }, [checkHookName]);

  const addCronTrigger = useCallback(() => {
    const id = `trigger_${Date.now()}`;
    setEdited(prev => [...prev, {
      id,
      type: 'cron',
      enabled: true,
      cron: '0 * * * *',
    } as WorkflowTrigger]);
  }, []);

  const addHookTrigger = useCallback(() => {
    const id = `trigger_${Date.now()}`;
    setEdited(prev => [...prev, {
      id,
      type: 'hook',
      enabled: true,
      hookName: '',
    } as WorkflowTrigger]);
  }, []);

  const removeTrigger = useCallback((id: string) => {
    setEdited(prev => prev.filter(t => t.id !== id));
  }, []);

  const toggleEnabled = useCallback((id: string) => {
    setEdited(prev => prev.map(t =>
      t.id === id ? { ...t, enabled: !t.enabled } : t
    ));
  }, []);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm">{t('title')}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[400px]">
          <div className="space-y-3 pr-2">
            {edited.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-4">
                {t('empty')}
              </div>
            )}

            {edited.map(trigger => (
              <div key={trigger.id} className="border rounded-md p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {trigger.type === 'cron' ? (
                      <Clock className="h-3.5 w-3.5 text-blue-500" />
                    ) : (
                      <Globe className="h-3.5 w-3.5 text-green-500" />
                    )}
                    <Badge variant="secondary" className="text-[9px] h-4">
                      {trigger.type === 'cron' ? t('cronTrigger') : t('webhook')}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-[10px]">{t('enabled')}</Label>
                    <Switch
                      checked={trigger.enabled}
                      onCheckedChange={() => toggleEnabled(trigger.id)}
                      className="scale-75"
                    />
                    <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive" onClick={() => removeTrigger(trigger.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                {trigger.type === 'cron' ? (
                  <div className="space-y-1">
                    <Label className="text-[10px]">{t('cronExpression')}</Label>
                    <CronEditor
                      value={trigger.type === 'cron' ? trigger.cron : ''}
                      onChange={(v) => handleCronChange(trigger.id, v)}
                      isValidating={validating === trigger.id}
                      validationResult={cronValidation[trigger.id] || null}
                    />
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Label className="text-[10px]">{t('hookName')}</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        value={trigger.type === 'hook' ? trigger.hookName : ''}
                        onChange={(e) => handleHookNameChange(trigger.id, e.target.value)}
                        placeholder="my-workflow-hook"
                        className="h-7 text-xs flex-1"
                      />
                      {trigger.type === 'hook' && trigger.hookName && (
                        hookAvailability[trigger.id] !== undefined && (
                          hookAvailability[trigger.id]
                            ? <CheckCircle className="h-3 w-3 text-green-500" />
                            : <AlertCircle className="h-3 w-3 text-orange-500" />
                        )
                      )}
                    </div>
                    {trigger.type === 'hook' && trigger.hookName && (
                      <p className="text-[9px] text-muted-foreground font-mono">
                        POST /api/workflows/hook/{trigger.hookName}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="flex gap-2 pt-2 border-t">
          <Button variant="outline" size="sm" className="text-xs" onClick={addCronTrigger}>
            <Clock className="h-3 w-3 mr-1" /> {t('cronTrigger')}
          </Button>
          <Button variant="outline" size="sm" className="text-xs" onClick={addHookTrigger}>
            <Globe className="h-3 w-3 mr-1" /> {t('webhook')}
          </Button>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>{t('cancel')}</Button>
          <Button size="sm" onClick={() => { onSave(edited); onClose(); }}>{t('save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
