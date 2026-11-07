'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import {
  AlertCircle,
  CheckCircle,
  FileText,
  XCircle,
} from 'lucide-react';
import type { ExecutionStep } from '@agent-spaces/shared';
import {
  HoverCard, HoverCardContent, HoverCardTrigger,
} from '@/components/ui/hover-card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { JsonViewer } from '@/components/viewers/json-viewer';
import { cn } from '@/lib/utils';
import { formatDuration } from './workflow-node-types';

function PlainValue({ value, empty }: { value: unknown; empty: string }) {
  if (value === undefined || value === null || value === '') {
    return <div className="text-[10px] text-muted-foreground">{empty}</div>;
  }
  if (typeof value === 'object') {
    return (
      <JsonViewer
        data={value as Parameters<typeof JsonViewer>[0]['data']}
        className="max-h-36 overflow-auto rounded-md border border-border bg-background text-[10px] shadow-none"
        defaultExpanded={2}
      />
    );
  }
  return (
    <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted/50 p-2 text-[10px]">
      {String(value)}
    </pre>
  );
}

export function ExecutionResultHoverCard({
  step,
  visible,
  triggerClassName,
}: {
  step: ExecutionStep;
  visible: boolean;
  triggerClassName?: string;
}) {
  const t = useTranslations('workflows');
  const isError = step.status === 'error';
  const hasLogs = (step.logs || []).length > 0;

  return (
    <HoverCard openDelay={100} closeDelay={150}>
      <HoverCardTrigger
        render={(
          <button
            type="button"
            className={cn(
              'nodrag nopan absolute z-30 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition-opacity hover:bg-muted hover:text-foreground',
              triggerClassName || '-bottom-2 -right-2',
              visible ? 'opacity-100' : 'opacity-0',
              isError && 'text-destructive hover:text-destructive',
            )}
            onClick={(event) => event.stopPropagation()}
            aria-label={t('nodeUi.viewResult')}
            title={t('nodeUi.viewResult')}
          />
        )}
      >
        {isError ? <XCircle className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
      </HoverCardTrigger>
      <HoverCardContent
        side="bottom"
        sideOffset={8}
        align="end"
        className="nodrag nopan w-80 gap-0 overflow-hidden p-0"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          {isError ? (
            <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
          ) : (
            <CheckCircle className="h-3.5 w-3.5 shrink-0 text-green-500" />
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-medium">{t('nodeUi.executionResult')}</div>
            <div className="text-[10px] text-muted-foreground">
              {step.status}{step.finishedAt ? ` · ${formatDuration(step.startedAt, step.finishedAt)}` : ''}
            </div>
          </div>
        </div>

        <ScrollArea className="max-h-[420px]">
          <div className="space-y-3 p-3">
            {step.error ? (
              <div className="flex gap-1.5 rounded-md bg-destructive/10 p-2 text-[10px] text-destructive">
                <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                <span className="break-all">{step.error}</span>
              </div>
            ) : null}

            <section className="space-y-1.5">
              <div className="text-[10px] font-medium text-muted-foreground">{t('nodeUi.output')}</div>
              <PlainValue value={step.output} empty={t('nodeUi.noOutput')} />
            </section>

            <section className="space-y-1.5">
              <div className="text-[10px] font-medium text-muted-foreground">{t('nodeUi.logs')}</div>
              {hasLogs ? (
                <div className="space-y-1">
                  {step.logs!.map((entry, index) => (
                    <div
                      key={`${entry.timestamp}-${index}`}
                      className={cn(
                        'rounded px-2 py-1 text-[10px]',
                        entry.level === 'error' && 'bg-destructive/10 text-destructive',
                        entry.level === 'warning' && 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-300',
                        entry.level === 'info' && 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
                      )}
                    >
                      <span className="font-medium">{entry.level}</span>
                      <span className="ml-1 break-all">{entry.message}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[10px] text-muted-foreground">{t('nodeUi.noLogs')}</div>
              )}
            </section>

            <section className="space-y-1.5">
              <div className="text-[10px] font-medium text-muted-foreground">{t('nodeUi.input')}</div>
              <PlainValue value={step.input} empty={t('nodeUi.noInput')} />
            </section>
          </div>
        </ScrollArea>
      </HoverCardContent>
    </HoverCard>
  );
}
