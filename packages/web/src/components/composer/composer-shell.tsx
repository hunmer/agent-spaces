'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { EditorContent, type Editor } from '@tiptap/react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { useInspectorHistoryStore } from '@/stores/inspector-history';
import { Code2, History, Maximize2, Send, Square, X } from 'lucide-react';

interface ComposerShellProps {
  workspaceId: string;
  editor: Editor | null;
  canSubmit: boolean;
  onSubmit: (contextLength: number) => void;
  contextLength: number;
  onContextLengthChange: (contextLength: number) => void;
  enableContextControl?: boolean;
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

const EMPTY_HISTORY: never[] = [];
const DEFAULT_CONTEXT_LENGTH = 20;

export function ComposerShell({
  workspaceId,
  editor,
  canSubmit,
  onSubmit,
  contextLength,
  onContextLengthChange,
  enableContextControl = true,
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
  const [historyOpen, setHistoryOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const history = useInspectorHistoryStore((s) => s.histories[workspaceId] ?? EMPTY_HISTORY);
  const loadHistory = useInspectorHistoryStore((s) => s.loadHistory);
  const clearHistory = useInspectorHistoryStore((s) => s.clearHistory);

  const insertCodeLocation = (path: string, line: number, column: number) => {
    editor?.chain().focus().insertContent(`${path}:${line}:${column}`).run();
    setHistoryOpen(false);
  };

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
            <Popover
              open={historyOpen}
              onOpenChange={(open) => {
                setHistoryOpen(open);
                if (open) loadHistory(workspaceId);
              }}
            >
              <PopoverTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 rounded-full border border-border hover:bg-accent text-muted-foreground"
                    title={t('shell.recentCode')}
                  />
                }
              >
                <Code2 className="size-3" />
              </PopoverTrigger>
              <PopoverContent align="start" sideOffset={6} className="w-80 p-1.5 gap-0">
                <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                  <span className="text-xs font-medium text-muted-foreground">{t('shell.recentCode')}</span>
                  <button
                    type="button"
                    onClick={() => clearHistory(workspaceId)}
                    disabled={history.length === 0}
                    className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                  >
                    {t('shell.clear')}
                  </button>
                </div>
                {history.length === 0 ? (
                  <div className="px-2 py-6 text-center text-xs text-muted-foreground">{t('shell.noRecords')}</div>
                ) : (
                  <div className="max-h-72 overflow-y-auto">
                    {history.map((item) => {
                      const label = item.name || item.path.split('/').pop() || item.path;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => insertCodeLocation(item.path, item.line, item.column)}
                          className="flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-accent"
                        >
                          <span className="w-full truncate text-xs font-medium">{label}</span>
                          <span className="w-full truncate font-mono text-[11px] text-muted-foreground">
                            {item.path}:{item.line}:{item.column}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </PopoverContent>
            </Popover>
            {enableContextControl ? (
              <Popover open={contextOpen} onOpenChange={setContextOpen}>
                <PopoverTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 rounded-full border border-border hover:bg-accent text-muted-foreground"
                      title={contextLength === 0 ? t('shell.newAgent') : t('shell.contextN', { count: contextLength })}
                    />
                  }
                >
                  <History className="size-3" />
                  <span className="text-xs">{contextLength}</span>
                </PopoverTrigger>
                <PopoverContent align="start" sideOffset={6} className="w-64 p-3">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground">{t('shell.contextLength')}</span>
                    <span className="text-xs font-mono text-foreground">
                      {contextLength === 0 ? t('shell.newAgent') : t('shell.contextCount', { count: contextLength })}
                    </span>
                  </div>
                  <Slider
                    value={contextLength}
                    min={0}
                    max={20}
                    step={1}
                    onValueChange={(value) => {
                      const nextValue = Array.isArray(value) ? value[0] : value;
                      onContextLengthChange(nextValue ?? DEFAULT_CONTEXT_LENGTH);
                    }}
                  />
                  <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
                    <span>0</span>
                    <span>20</span>
                  </div>
                </PopoverContent>
              </Popover>
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            {isProcessing ? (
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
