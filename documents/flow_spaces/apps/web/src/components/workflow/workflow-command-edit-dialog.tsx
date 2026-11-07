'use client';

import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Terminal } from 'lucide-react';

interface CommandNodeData {
  label: string;
  script: string;
  cwd?: string;
  env?: Record<string, string>;
  shell?: string;
  failStrategy?: 'stop';
}

interface WorkflowCommandEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: CommandNodeData;
  onSave: (data: CommandNodeData) => void;
}

export function WorkflowCommandEditDialog({ open, onOpenChange, data, onSave }: WorkflowCommandEditDialogProps) {
  const [label, setLabel] = useState(data.label);
  const [script, setScript] = useState(data.script);
  const [cwd, setCwd] = useState(data.cwd || '');
  const [shell, setShell] = useState(data.shell || '');
  const [envKey, setEnvKey] = useState('');
  const [envValue, setEnvValue] = useState('');
  const [envPairs, setEnvPairs] = useState<{ key: string; value: string }[]>(() => {
    if (!data.env) return [];
    return Object.entries(data.env).map(([key, value]) => ({ key, value }));
  });

  useEffect(() => {
    if (open) {
      setLabel(data.label);
      setScript(data.script);
      setCwd(data.cwd || '');
      setShell(data.shell || '');
      setEnvPairs(data.env ? Object.entries(data.env).map(([key, value]) => ({ key, value })) : []);
    }
  }, [open, data]);

  const addEnvPair = useCallback(() => {
    if (!envKey.trim()) return;
    setEnvPairs((prev) => [...prev, { key: envKey.trim(), value: envValue }]);
    setEnvKey('');
    setEnvValue('');
  }, [envKey, envValue]);

  const removeEnvPair = useCallback((index: number) => {
    setEnvPairs((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSave = useCallback(() => {
    const env: Record<string, string> = {};
    for (const pair of envPairs) {
      env[pair.key] = pair.value;
    }
    onSave({
      label: label || 'Command',
      script,
      cwd: cwd || undefined,
      shell: shell || undefined,
      env: Object.keys(env).length > 0 ? env : undefined,
      failStrategy: 'stop',
    });
    onOpenChange(false);
  }, [label, script, cwd, shell, envPairs, onSave, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Terminal className="size-4" />
            Edit Command Node
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Title</label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Command" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Script</label>
            <textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              className="w-full min-h-[200px] rounded-md border bg-background px-3 py-2 text-sm font-mono resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="#!/bin/bash&#10;pnpm test"
              spellCheck={false}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Working Directory</label>
              <Input value={cwd} onChange={(e) => setCwd(e.target.value)} placeholder="Default: workspace root" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Shell</label>
              <Input value={shell} onChange={(e) => setShell(e.target.value)} placeholder="Default: system shell" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Environment Variables</label>
            {envPairs.map((pair, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input value={pair.key} readOnly className="h-8 text-xs font-mono flex-1" />
                <span className="text-muted-foreground">=</span>
                <Input value={pair.value} readOnly className="h-8 text-xs font-mono flex-1" />
                <Button variant="ghost" size="sm" className="h-8 px-2 text-destructive" onClick={() => removeEnvPair(index)}>X</Button>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <Input value={envKey} onChange={(e) => setEnvKey(e.target.value)} placeholder="KEY" className="h-8 text-xs font-mono flex-1" />
              <span className="text-muted-foreground">=</span>
              <Input value={envValue} onChange={(e) => setEnvValue(e.target.value)} placeholder="value" className="h-8 text-xs font-mono flex-1" />
              <Button variant="outline" size="sm" className="h-8 px-3" onClick={addEnvPair}>Add</Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
