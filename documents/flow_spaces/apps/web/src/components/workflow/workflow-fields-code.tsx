'use client';

import { useState } from 'react';
import { Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MonacoCodeEditor as MonacoEditor } from '@/components/editor/monaco-code-editor';
import { WorkflowCodeFullscreenDialog } from './workflow-code-fullscreen-dialog';

function getCodeEditorOptions(readOnly: boolean) {
  return {
    readOnly,
    minimap: { enabled: false },
    fontSize: 12,
    lineNumbers: 'on' as const,
    scrollBeyondLastLine: false,
    wordWrap: 'on' as const,
    folding: false,
    glyphMargin: false,
    overviewRulerBorder: false,
    hideCursorInOverviewRuler: true,
    overviewRulerLanes: 0,
    renderLineHighlight: 'none' as const,
    scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
    padding: { top: 4, bottom: 4 },
  };
}

export function CodePropertyEditor({
  label,
  language,
  value,
  disabled,
  onChange,
}: {
  label: string;
  language: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const [fullscreenOpen, setFullscreenOpen] = useState(false);

  return (
    <>
      <div className="relative overflow-hidden rounded-md border">
        <MonacoEditor
          height="160px"
          language={language}
          value={value}
          options={getCodeEditorOptions(true)}
        />
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="absolute bottom-2 right-2 z-10 h-7 w-7 bg-background/90 shadow-sm"
          title="全屏编辑"
          onClick={() => setFullscreenOpen(true)}
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <WorkflowCodeFullscreenDialog
        open={fullscreenOpen}
        onOpenChange={setFullscreenOpen}
        label={label}
        language={language}
        value={value}
        disabled={disabled}
        onChange={onChange}
      />
    </>
  );
}
