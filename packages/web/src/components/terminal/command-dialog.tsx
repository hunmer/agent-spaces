'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Plus, X } from 'lucide-react';
import type { QuickCommand } from '@agent-spaces/shared';
import { useTranslations } from 'next-intl';

interface CommandDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  command?: QuickCommand;
  defaultCwd?: string;
  onSubmit: (data: {
    name: string;
    command: string;
    cwd?: string;
    shell?: string;
    env?: Record<string, string>;
    autoRestart?: boolean;
  }) => Promise<void>;
}

export function CommandDialog({ open, onOpenChange, command, defaultCwd, onSubmit }: CommandDialogProps) {
  const t = useTranslations('commands');
  const [name, setName] = useState(command?.name ?? '');
  const [cmd, setCmd] = useState(command?.command ?? '');
  const [cwd, setCwd] = useState(command?.cwd ?? defaultCwd ?? '');
  const [shell, setShell] = useState(command?.shell ?? '');
  const [envPairs, setEnvPairs] = useState<{ key: string; value: string }[]>(
    command?.env ? Object.entries(command.env).map(([key, value]) => ({ key, value })) : []
  );
  const [autoRestart, setAutoRestart] = useState(command?.autoRestart ?? false);
  const [submitting, setSubmitting] = useState(false);

  // Reset form when dialog opens or command changes
  useEffect(() => {
    if (open) {
      setName(command?.name ?? '');
      setCmd(command?.command ?? '');
      setCwd(command?.cwd ?? defaultCwd ?? '');
      setShell(command?.shell ?? '');
      setEnvPairs(command?.env ? Object.entries(command.env).map(([key, value]) => ({ key, value })) : []);
      setAutoRestart(command?.autoRestart ?? false);
    }
  }, [open, command, defaultCwd]);

  const handleSubmit = async () => {
    if (!name.trim() || !cmd.trim()) return;
    setSubmitting(true);
    try {
      const env: Record<string, string> = {};
      for (const p of envPairs) {
        if (p.key.trim()) env[p.key.trim()] = p.value;
      }
      await onSubmit({
        name: name.trim(),
        command: cmd,
        cwd: cwd || undefined,
        shell: shell || undefined,
        env: Object.keys(env).length > 0 ? env : undefined,
        autoRestart: autoRestart || undefined,
      });
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{command ? t('editCommand') : t('addCommand')}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <div>
            <Label className="text-xs">{t('name')}</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="dev" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">{t('command')}</Label>
            <Input
              value={cmd}
              onChange={e => setCmd(e.target.value)}
              placeholder="pnpm dev"
              className="mt-1 font-mono text-sm"
            />
          </div>
          <div>
            <Label className="text-xs">{t('workingDirectory')}</Label>
            <Input value={cwd} onChange={e => setCwd(e.target.value)} placeholder={defaultCwd} className="mt-1 font-mono text-xs" />
          </div>
          <div>
            <Label className="text-xs">{t('shell')}</Label>
            <Input value={shell} onChange={e => setShell(e.target.value)} placeholder="Default" className="mt-1" />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">{t('environmentVariables')}</Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 px-1 text-xs"
                onClick={() => setEnvPairs(p => [...p, { key: '', value: '' }])}
              >
                <Plus size={12} />
              </Button>
            </div>
            <div className="flex flex-col gap-1 mt-1">
              {envPairs.map((pair, i) => (
                <div key={i} className="flex items-center gap-1">
                  <Input
                    value={pair.key}
                    onChange={e => setEnvPairs(p => p.map((pp, j) => j === i ? { ...pp, key: e.target.value } : pp))}
                    placeholder="KEY"
                    className="h-7 text-xs font-mono flex-1"
                  />
                  <Input
                    value={pair.value}
                    onChange={e => setEnvPairs(p => p.map((pp, j) => j === i ? { ...pp, value: e.target.value } : pp))}
                    placeholder="value"
                    className="h-7 text-xs font-mono flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 shrink-0"
                    onClick={() => setEnvPairs(p => p.filter((_, j) => j !== i))}
                  >
                    <X size={12} />
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={autoRestart} onCheckedChange={setAutoRestart} />
            <Label className="text-xs">{t('autoRestart')}</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('cancel')}</Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || !cmd.trim() || submitting}>
            {command ? t('save') : t('addCommand')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
