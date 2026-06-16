'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { resolveStoreUrl } from '@/lib/agent-store';
import { AgentIcon } from '@/components/common/agent-icon';
import { Markdown } from '@/components/ui/markdown';
import type { MiniAppIndexItem } from './mini-apps-store-dialog';

function formatLocalDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}`;
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex w-full text-left text-sm">
      <span className="w-16 shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 break-all">{value}</span>
    </div>
  );
}

export function MiniAppDetail({ item, onBack }: { item: MiniAppIndexItem; onBack: () => void }) {
  const t = useTranslations('mini-apps');
  const [intro, setIntro] = useState<{ loading: boolean; content: string; error: boolean }>({
    loading: false,
    content: '',
    error: false,
  });

  useEffect(() => {
    if (!item.hasIntro) {
      setIntro({ loading: false, content: '', error: false });
      return;
    }
    const controller = new AbortController();
    setIntro({ loading: true, content: '', error: false });
    fetch(resolveStoreUrl(`mini-app/intro/${item.id}.md`), { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        return res.text();
      })
      .then((text) => {
        setIntro({ loading: false, content: text, error: false });
      })
      .catch((err) => {
        if (controller.signal.aborted || err?.name === 'AbortError') return;
        setIntro({ loading: false, content: '', error: true });
      });
    return () => controller.abort();
  }, [item.id, item.hasIntro]);

  return (
    <div className="flex flex-col gap-4 pb-2">
      <Button variant="ghost" size="sm" className="self-start" onClick={onBack}>
        <ArrowLeft className="size-4 mr-1" />
        {t('detail.back')}
      </Button>
      <div className="flex gap-6">
        {/* 左栏：插件信息 */}
        <aside className="w-60 shrink-0 flex flex-col items-center text-center gap-3 rounded-xl border border-border bg-background p-4 self-start">
          <AgentIcon
            name={item.name}
            avatarUrl={item.iconUrl ? resolveStoreUrl(item.iconUrl) : undefined}
            icon={item.icon}
            className="size-16 rounded"
          />
          <span className="font-semibold text-base break-all">{item.name}</span>
          {item.description && (
            <p className="text-xs text-muted-foreground break-all">{item.description}</p>
          )}
          <div className="w-full border-t my-1" />
          <Meta label={t('detail.type')} value={item.type || '-'} />
          <Meta label={t('detail.version')} value={item.version || '-'} />
          <Meta
            label={t('detail.tags')}
            value={Array.isArray(item.tags) && item.tags.length ? item.tags.join(', ') : '-'}
          />
          <Meta label={t('detail.updatedAt')} value={formatLocalDate(item.updatedAt) || '-'} />
        </aside>
        {/* 右栏：Markdown 介绍 */}
        <div className="flex-1 min-w-0">
          {item.hasIntro ? (
            intro.loading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                <span className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent" />
                {t('detail.loading')}
              </div>
            ) : intro.error ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                {t('detail.error')}
              </div>
            ) : (
              <Markdown content={intro.content} />
            )
          ) : (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
              {t('detail.empty')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
