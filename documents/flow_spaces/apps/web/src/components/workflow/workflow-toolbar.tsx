'use client';

import { Button } from '@/components/ui/button';
import { Download, LayoutGrid, Save, Trash2, Copy } from 'lucide-react';

interface WorkflowToolbarProps {
  onSave: () => void;
  onAutoLayout: () => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  onExport: () => void;
  isDirty: boolean;
  isSaving: boolean;
}

export function WorkflowToolbar({ onSave, onAutoLayout, onDelete, onDuplicate, onExport, isDirty, isSaving }: WorkflowToolbarProps) {
  return (
    <div className="flex items-center gap-2 border-t bg-card px-4 py-2">
      <Button variant="outline" size="sm" onClick={onAutoLayout} title="Auto Layout">
        <LayoutGrid className="h-4 w-4 mr-1" /> Auto Layout
      </Button>
      <div className="flex-1" />
      {onDuplicate && (
        <Button variant="ghost" size="sm" onClick={onDuplicate} title="Duplicate">
          <Copy className="h-4 w-4" />
        </Button>
      )}
      <Button variant="ghost" size="sm" onClick={onExport} title="Export JSON">
        <Download className="h-4 w-4" />
      </Button>
      {onDelete && (
        <Button variant="ghost" size="sm" onClick={onDelete} title="Delete" className="text-destructive hover:text-destructive">
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
      <Button size="sm" onClick={onSave} disabled={!isDirty || isSaving}>
        <Save className="h-4 w-4 mr-1" /> {isSaving ? 'Saving...' : 'Save'}
      </Button>
    </div>
  );
}
