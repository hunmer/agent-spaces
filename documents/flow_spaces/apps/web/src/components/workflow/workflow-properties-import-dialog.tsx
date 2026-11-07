'use client';

import { useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toOutputFields } from './workflow-properties-utils';

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (outputs: unknown) => void;
}

export function ImportDialog({ open, onOpenChange, onImport }: ImportDialogProps) {
  const [json, setJson] = useState('');
  const [error, setError] = useState('');

  const handleImport = () => {
    setError('');
    try {
      const parsed = JSON.parse(json) as unknown;
      onImport(toOutputFields(parsed));
      onOpenChange(false);
      setJson('');
    } catch {
      setError('JSON 格式不正确，请检查输入');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">导入输出字段</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground">粘贴 JSON 对象，将自动解析为输出字段结构。</p>
          <Textarea
            value={json}
            onChange={(e) => setJson(e.target.value)}
            placeholder='{"key1": "value1", "key2": 123}'
            className="min-h-[160px] text-xs font-mono"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleImport();
            }}
          />
          {error && <p className="text-[11px] text-red-500">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onOpenChange(false)}>取消</Button>
          <Button size="sm" className="h-7 text-xs" disabled={!json.trim()} onClick={handleImport}>确认导入</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
