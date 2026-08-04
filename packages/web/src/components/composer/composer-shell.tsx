'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { EditorContent, type Editor } from '@tiptap/react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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

  useEffect(() => {
    if (fullscreen) {
      editor?.commands.focus();
    }
  }, [fullscreen, editor]);

  if (fullscreen) {
    // 早返回：编辑器仅在 Dialog 内挂载，关闭瞬间卸载后再挂载主区域，
    // 保证同一时刻只有一个 EditorContent，避免 tiptap view 双挂载导致内容丢失。
    return (
      <div className={className}>
        <Dialog open onOpenChange={(open) => { if (!open) setFullscreen(false); }}>
          <DialogContent
            showCloseButton={false}
            className="sm:max-w-3xl flex flex-col gap-0 p-0 overflow-hidden"
            style={{ maxHeight: 'calc(var(--app-content-height) - 2rem)' }}
          >
            <DialogHeader className="flex-row items-center justify-between border-b px-4 py-3 gap-2">
              <DialogTitle>{t('shell.fullscreen')}</DialogTitle>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setFullscreen(false)}>
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
            </DialogHeader>
            <div className="tiptap-fullscreen flex-1 flex flex-col overflow-y-auto p-4 min-h-[40vh] [&>div]:flex-1 [&>div]:flex [&>div]:flex-col [&_.tiptap]:flex-1 [&_.tiptap]:min-h-0 [&_.tiptap]:outline-none">
              <EditorContent editor={editor} />
            </div>
          </DialogContent>
        </Dialog>
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
              <X className="size-3.5" />
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
