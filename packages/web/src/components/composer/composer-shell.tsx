'use client';

import type { ReactNode } from 'react';
import { EditorContent, type Editor } from '@tiptap/react';
import { Button } from '@/components/ui/button';
import { Send } from 'lucide-react';

interface ComposerShellProps {
  editor: Editor | null;
  canSubmit: boolean;
  onSubmit: () => void;
  actions?: ReactNode;
  className?: string;
  dropzoneProps?: Record<string, unknown>;
  hiddenInput?: ReactNode;
}

export function ComposerShell({
  editor,
  canSubmit,
  onSubmit,
  actions,
  className,
  dropzoneProps,
  hiddenInput,
}: ComposerShellProps) {
  return (
    <div className={className}>
      <div
        className="bg-background border border-border rounded-2xl overflow-hidden"
        {...dropzoneProps}
      >
        {hiddenInput}
        <div className="px-3 pt-3 pb-2">
          <EditorContent editor={editor} />
        </div>
        <div className="flex items-center justify-between px-2 pb-2">
          <div className="flex items-center gap-1">{actions}</div>
          <Button
            disabled={!canSubmit}
            onClick={onSubmit}
            className="size-7 p-0 rounded-full bg-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="size-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}
