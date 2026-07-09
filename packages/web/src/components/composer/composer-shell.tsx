'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { EditorContent, type Editor } from '@tiptap/react';
import { Button } from '@/components/ui/button';
import { Maximize2, Send, Square, X } from 'lucide-react';

interface ComposerShellProps {
  editor: Editor | null;
  canSubmit: boolean;
  onSubmit: (contextLength: number) => void;
  contextLength: number;
  onStop?: () => void;
  isProcessing?: boolean;
  actions?: ReactNode;
  voiceAction?: ReactNode;
  className?: string;
  dropzoneProps?: Record<string, unknown>;
  hiddenInput?: ReactNode;
  replyLabel?: string;
  onCancelReply?: () => void;
}

export function ComposerShell({
  editor,
  canSubmit,
  onSubmit,
  contextLength,
  onStop,
  isProcessing = false,
  actions,
  voiceAction,
  className,
  dropzoneProps,
  hiddenInput,
  replyLabel,
  onCancelReply,
}: ComposerShellProps) {
  const t = useTranslations('composer');
  const [fullscreen, setFullscreen] = useState(false);

  if (fullscreen) {
    editor?.commands.focus();
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-popover">
        <div className="absolute inset-0 bg-black/10 backdrop-blur-xs" onClick={() => setFullscreen(false)} />
        <div className="relative z-10 flex h-full max-w-3xl w-full mx-auto flex-col rounded-xl bg-popover ring-1 ring-foreground/10 m-4 overflow-hidden">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <span className="text-base font-medium">{t('shell.fullscreen')}</span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFullscreen(false)}
              >
                {t('shell.cancel')}
              </Button>
              <Button
                size="sm"
                disabled={!canSubmit}
                onClick={() => { setFullscreen(false); onSubmit(contextLength); }}
              >
                <Send className="size-3.5 mr-1.5" />
                {t('shell.send')}
              </Button>
            </div>
          </div>
          <div className="tiptap-fullscreen flex-1 flex flex-col overflow-y-auto p-4 [&>div]:flex-1 [&>div]:flex [&>div]:flex-col [&_.tiptap]:flex-1 [&_.tiptap]:min-h-0 [&_.tiptap]:outline-none">
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div
        className="bg-background border border-border rounded-2xl overflow-hidden"
        {...dropzoneProps}
      >
        {hiddenInput}
        {replyLabel ? (
          <div className="flex items-center justify-between gap-2 border-b px-3 py-1.5 text-xs text-muted-foreground">
            <span className="min-w-0 truncate">{t('shell.replyTo', { name: replyLabel })}</span>
            <button
              type="button"
              onClick={onCancelReply}
              className="inline-flex size-5 shrink-0 items-center justify-center rounded hover:bg-muted hover:text-foreground cursor-pointer"
              title={t('shell.cancelReply')}
            >
              <X className="size-3" />
            </button>
          </div>
        ) : null}
        <div className="relative px-3 pt-3 pb-2">
          <EditorContent editor={editor} />
          <button
            type="button"
            onClick={() => setFullscreen(true)}
            className="absolute top-2 right-2 inline-flex size-6 items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer"
            title={t('shell.fullscreen')}
          >
            <Maximize2 className="size-3.5" />
          </button>
        </div>
        <div className="flex items-center justify-between px-2 pb-2">
          <div className="flex items-center gap-1">
            {actions}
          </div>
          <div className="flex items-center gap-1">
            {isProcessing && onStop ? (
              <Button
                type="button"
                onClick={onStop}
                className="size-7 p-0 rounded-full bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              >
                <Square className="size-3" fill="currentColor" />
              </Button>
            ) : (
              <>
                {voiceAction}
                <Button
                  type="button"
                  onClick={() => onSubmit(contextLength)}
                  disabled={!canSubmit}
                  className="size-7 p-0 rounded-full bg-primary disabled:opacity-40 disabled:pointer-events-none"
                >
                  <Send className="size-3" />
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
