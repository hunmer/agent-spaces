'use client';

import { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FolderPicker } from '@/components/ui/folder-picker';
import { Check, Loader2 } from 'lucide-react';
import { fetchWithAuth } from '@/lib/auth';
import { useTranslations } from 'next-intl';

interface ParsedScript {
  name: string;
  command: string;
  selected: boolean;
}

interface ImportCommandsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (scripts: { name: string; command: string; folder: string }[]) => Promise<void>;
}

export function ImportCommandsDialog({ open, onOpenChange, onImport }: ImportCommandsDialogProps) {
  const t = useTranslations('commands');
  const [folder, setFolder] = useState('');
  const [scripts, setScripts] = useState<ParsedScript[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleFolderChange = useCallback(async (newFolder: string) => {
    setFolder(newFolder);
    if (!newFolder) {
      setScripts([]);
      return;
    }

    setLoading(true);
    try {
      const res = await fetchWithAuth(
        `/api/folder/read-file?path=${encodeURIComponent(newFolder + '/package.json')}`
      );
      if (!res.ok) {
        setScripts([]);
        return;
      }
      const pkg = await res.json();
      if (pkg.scripts && typeof pkg.scripts === 'object') {
        setScripts(
          Object.entries(pkg.scripts).map(([name, command]) => ({
            name,
            command: String(command),
            selected: true,
          }))
        );
      } else {
        setScripts([]);
      }
    } catch {
      setScripts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const toggleScript = (i: number) => {
    setScripts(prev => prev.map((s, idx) => idx === i ? { ...s, selected: !s.selected } : s));
  };

  const toggleAll = () => {
    const allSelected = scripts.every(s => s.selected);
    setScripts(prev => prev.map(s => ({ ...s, selected: !allSelected })));
  };

  const handleImport = async () => {
    const selected = scripts.filter(s => s.selected);
    if (selected.length === 0) return;
    setSubmitting(true);
    try {
      await onImport(selected.map(s => ({ name: s.name, command: s.command, folder })));
      onOpenChange(false);
      setFolder('');
      setScripts([]);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{t('importTitle')}</DialogTitle>
          <DialogDescription>{t('importDescription')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{t('selectProject')}</label>
            <FolderPicker value={folder} onChange={handleFolderChange} />
          </div>

          {scripts.length > 0 && (
            <div className="flex flex-col border border-border rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b border-border">
                <button
                  onClick={toggleAll}
                  className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                    scripts.every(s => s.selected)
                      ? 'bg-primary border-primary text-primary-foreground'
                      : 'border-border hover:border-primary'
                  }`}
                >
                  {scripts.every(s => s.selected) && <Check size={10} />}
                </button>
                <span className="text-xs font-medium">{t('parsedScripts')} ({scripts.length})</span>
              </div>
              <div className="max-h-[280px] overflow-y-auto">
                {scripts.map((script, i) => (
                  <div
                    key={script.name}
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-accent cursor-pointer border-b border-border last:border-b-0"
                    onClick={() => toggleScript(i)}
                  >
                    <button
                      className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                        script.selected
                          ? 'bg-primary border-primary text-primary-foreground'
                          : 'border-border hover:border-primary'
                      }`}
                    >
                      {script.selected && <Check size={10} />}
                    </button>
                    <span className="text-xs font-medium w-24 truncate shrink-0">{script.name}</span>
                    <span className="text-xs text-muted-foreground font-mono truncate flex-1">{script.command}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!loading && folder && scripts.length === 0 && (
            <div className="text-xs text-muted-foreground text-center py-4">{t('noScripts')}</div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('cancel')}</Button>
          <Button
            onClick={handleImport}
            disabled={scripts.filter(s => s.selected).length === 0 || submitting}
          >
            {t('addSelected')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
