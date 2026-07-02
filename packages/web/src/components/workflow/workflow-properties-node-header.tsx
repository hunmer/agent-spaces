'use client';

import type { WorkflowNode } from '@agent-spaces/shared';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Check, ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { JsonPreset } from './workflow-properties-utils';
import { SELECTED_JSON_PRESET_KEY } from './workflow-properties-utils';
import { WorkflowNodeDefinitionIcon } from './workflow-node-icon';

type PluginNodeDefinitionMeta = {
  pluginId?: string;
  pluginIconPath?: string;
};

interface NodeHeaderProps {
  node: WorkflowNode;
  data: Record<string, unknown>;
  definition: ({ description?: string; icon?: string; label?: string } & PluginNodeDefinitionMeta) | null | undefined;
  jsonPresets: JsonPreset[];
  selectedJsonPresetId: string;
  selectedJsonPreset: JsonPreset | null;
  onDataChange: (key: string, value: unknown) => void;
  onAddPreset: () => void;
  onEditPreset: (preset: JsonPreset) => void;
  onUpdatePresets: (presets: JsonPreset[]) => void;
  dragHandleClassName?: string;
  readOnly?: boolean;
}

export function NodeHeader({
  node,
  data,
  definition,
  jsonPresets,
  selectedJsonPresetId,
  selectedJsonPreset,
  onDataChange,
  onAddPreset,
  onEditPreset,
  onUpdatePresets,
  dragHandleClassName,
  readOnly = false,
}: NodeHeaderProps) {
  const t = useTranslations('workflows');
  const resolveLabel = (v: unknown) => { const s = String(v ?? ''); return s && !s.startsWith('nodes.') ? s : ''; };
  const displayLabel = resolveLabel(data.label) || resolveLabel(node.label) || '';
  const placeholder = definition?.label || node.type || '';
  return (
    <div className={cn('flex shrink-0 items-center gap-2 border-b p-3', dragHandleClassName)}>
      <WorkflowNodeDefinitionIcon definition={definition} className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        {readOnly ? (
          <div className="truncate text-sm font-medium">{displayLabel || placeholder}</div>
        ) : (
          <Input
            value={displayLabel}
            placeholder={placeholder}
            onChange={(e) => onDataChange('label', e.target.value)}
            className="h-auto border-0 bg-transparent p-0 text-sm font-medium shadow-none outline-none ring-0 focus-visible:ring-0"
          />
        )}
        {definition?.description && (
          <div className="truncate text-[10px] text-muted-foreground">{definition.description}</div>
        )}
      </div>
      {readOnly ? (
        <Badge
          variant={selectedJsonPreset ? 'default' : 'outline'}
          className="h-6 gap-1 px-2 text-[10px]"
        >
          {selectedJsonPreset ? selectedJsonPreset.name : t('editor.jsonPreset')}
        </Badge>
      ) : (
        <Popover>
          <PopoverTrigger render={<div />} nativeButton={false}>
            <Badge
              variant={selectedJsonPreset ? 'default' : 'outline'}
              className="h-6 cursor-pointer gap-1 px-2 text-[10px]"
            >
              {selectedJsonPreset ? selectedJsonPreset.name : t('editor.jsonPreset')}
              <ChevronDown className="h-3 w-3" />
            </Badge>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-2">
            <div className="max-h-72 overflow-y-auto">
              {jsonPresets.length === 0 ? (
                <div className="px-2 py-6 text-center text-xs text-muted-foreground">{t('editor.noPreset')}</div>
              ) : jsonPresets.map(preset => (
                <div key={preset.id} className="flex items-center gap-1 rounded px-2 py-1.5 hover:bg-accent">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() => onDataChange(SELECTED_JSON_PRESET_KEY, selectedJsonPresetId === preset.id ? '' : preset.id)}
                  >
                    <Check className={`h-3.5 w-3.5 shrink-0 ${selectedJsonPresetId === preset.id ? 'text-primary' : 'text-transparent'}`} />
                    <span className="truncate text-xs">{preset.name}</span>
                  </button>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onEditPreset(preset)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      onUpdatePresets(jsonPresets.filter(item => item.id !== preset.id));
                      if (selectedJsonPresetId === preset.id) onDataChange(SELECTED_JSON_PRESET_KEY, '');
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="mt-2 border-t pt-2">
              <Button variant="outline" size="sm" className="h-7 w-full gap-1 text-xs" onClick={onAddPreset}>
                <Plus className="h-3.5 w-3.5" />
                {t('editor.addPreset')}
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
