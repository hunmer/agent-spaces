'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { isPlainObject } from './workflow-properties-utils';
import type { JsonPreset } from './workflow-properties-utils';

interface PresetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingPreset: JsonPreset | null;
  jsonPresets: JsonPreset[];
  selectedJsonPresetId: string;
  onSave: (presets: JsonPreset[], newPresetId?: string) => void;
}

export function PresetDialog({
  open,
  onOpenChange,
  editingPreset,
  jsonPresets,
  selectedJsonPresetId,
  onSave,
}: PresetDialogProps) {
  const [name, setName] = useState('');
  const [json, setJson] = useState('');
  const [error, setError] = useState('');

  const handleOpen = (isOpen: boolean) => {
    if (isOpen) {
      setName(editingPreset?.name ?? '');
      setJson(JSON.stringify({
        data: editingPreset?.data ?? {},
        inputs: editingPreset?.inputs ?? {},
        outputs: editingPreset?.outputs ?? {},
      }, null, 2));
      setError('');
    }
    onOpenChange(isOpen);
  };

  const handleSave = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('请输入预设名称');
      return;
    }

    try {
      const parsed = JSON.parse(json) as unknown;
      if (
        !isPlainObject(parsed)
        || !isPlainObject(parsed.data)
        || !isPlainObject(parsed.inputs)
        || (parsed.outputs !== undefined && !isPlainObject(parsed.outputs))
      ) {
        setError('JSON 必须是 { "data": {}, "inputs": {}, "outputs": {} } 格式');
        return;
      }

      const preset: JsonPreset = {
        id: editingPreset?.id ?? crypto.randomUUID(),
        name: trimmedName,
        data: parsed.data,
        inputs: parsed.inputs,
        outputs: isPlainObject(parsed.outputs) ? parsed.outputs : {},
      };
      const next = editingPreset
        ? jsonPresets.map(item => item.id === preset.id ? preset : item)
        : [...jsonPresets, preset];
      onSave(next, !selectedJsonPresetId ? preset.id : undefined);
      onOpenChange(false);
    } catch {
      setError('JSON 格式不正确，请检查输入');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm">{editingPreset ? '编辑 JSON 预设' : '添加 JSON 预设'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-xs">名称</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-7 text-xs" placeholder="预设名称" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">JSON</Label>
            <Textarea
              value={json}
              onChange={(e) => setJson(e.target.value)}
              className="min-h-[220px] text-xs font-mono"
              placeholder='{ "data": {}, "inputs": {}, "outputs": {} }'
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSave();
              }}
            />
          </div>
          {error && <p className="text-[11px] text-red-500">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onOpenChange(false)}>取消</Button>
          <Button size="sm" className="h-7 text-xs" onClick={handleSave}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
