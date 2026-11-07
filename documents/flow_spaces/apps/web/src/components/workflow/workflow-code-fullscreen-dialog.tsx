'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { MonacoCodeEditor as MonacoEditor } from '@/components/editor/monaco-code-editor';

function getCodeEditorOptions(readOnly: boolean) {
  return {
    readOnly,
    minimap: { enabled: false },
    fontSize: 12,
    lineNumbers: 'on' as const,
    scrollBeyondLastLine: false,
    wordWrap: 'on' as const,
    automaticLayout: true,
    scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
    padding: { top: 8, bottom: 8 },
  };
}

export function WorkflowCodeFullscreenDialog({
  open,
  onOpenChange,
  label,
  language,
  value,
  disabled,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: string;
  language: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const t = useTranslations('workflows.editor.codeFullscreen');
  const [draft, setDraft] = useState(value);
  const committedRef = useRef(value);

  const dirty = draft !== committedRef.current;

  // 同步外部 value（仅在未打开时）
  useEffect(() => {
    if (!open) {
      setDraft(value);
      committedRef.current = value;
    }
  }, [open, value]);

  // 打开时重置 draft
  useEffect(() => {
    if (open) {
      setDraft(value);
      committedRef.current = value;
    }
  }, [open]);

  const commit = useCallback(() => {
    if (draft !== committedRef.current) {
      committedRef.current = draft;
      onChange(draft);
    }
  }, [draft, onChange]);

  const handleClose = useCallback((openState: boolean) => {
    if (!openState) {
      commit();
    }
    onOpenChange(openState);
  }, [commit, onOpenChange]);

  // Ctrl+S 保存
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        commit();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, commit]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="!flex !h-[85vh] !w-[85vw] !max-w-none flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <DialogTitle className="text-sm">{label}</DialogTitle>
            <Badge variant={dirty ? 'outline' : 'secondary'} className="text-[10px] px-1.5 py-0">
              {dirty ? t('unsaved') : t('saved')}
            </Badge>
          </div>
        </DialogHeader>
        <div className="min-h-0 flex-1">
          <MonacoEditor
            height="100%"
            language={language}
            value={draft}
            onChange={(v) => setDraft(v ?? '')}
            options={getCodeEditorOptions(disabled)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
