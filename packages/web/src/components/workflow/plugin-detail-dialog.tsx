'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Markdown } from '@/components/ui/markdown';
import { Package } from 'lucide-react';
import { resolveServerAssetUrl } from '@/lib/server';
import { PluginIcon } from './workflow-plugin-icon';

interface PluginDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  version: string;
  description?: string;
  tags?: string[];
  type?: string;
  author?: string;
  updatedAt?: string;
  iconSrc: Parameters<typeof PluginIcon>[0]['source'];
  /** 远程 README 地址（商店插件：远程地址 + README.md） */
  readmeUrl?: string;
  /** 本地插件 id（通过 /api/plugins/:id/readme 读取插件目录下的 README.md） */
  pluginId?: string;
}

type ReadmeState = { loading: boolean; content: string; error: boolean; empty: boolean };

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
      <span className="min-w-0 break-all">{value || '-'}</span>
    </div>
  );
}

export function PluginDetailDialog({
  open,
  onOpenChange,
  name,
  version,
  description,
  tags,
  type,
  author,
  updatedAt,
  iconSrc,
  readmeUrl,
  pluginId,
}: PluginDetailDialogProps) {
  const t = useTranslations('workflows');
  const [readme, setReadme] = useState<ReadmeState>({
    loading: false,
    content: '',
    error: false,
    empty: false,
  });

  useEffect(() => {
    if (!open) return;

    // 远程 README（商店）优先；否则本地插件目录 README
    const url = readmeUrl
      || (pluginId ? resolveServerAssetUrl(`/api/plugins/${encodeURIComponent(pluginId)}/readme`) : '');

    if (!url) {
      setReadme({ loading: false, content: '', error: false, empty: true });
      return;
    }

    const controller = new AbortController();
    setReadme({ loading: true, content: '', error: false, empty: false });
    fetch(url, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        return res.text();
      })
      .then((text) => {
        setReadme({
          loading: false,
          content: text,
          error: false,
          empty: !text.trim(),
        });
      })
      .catch((err) => {
        if (controller.signal.aborted || err?.name === 'AbortError') return;
        // 404 视为暂无说明文档，其它视为加载失败
        const isMissing = String(err?.message || '').includes('status 404');
        setReadme({ loading: false, content: '', error: !isMissing, empty: isMissing });
      });
    return () => controller.abort();
  }, [open, readmeUrl, pluginId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!w-[80vw] !max-w-none !h-[85vh] !max-h-[85vh] !flex !flex-col !overflow-hidden !p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            {t('pluginDetail.title')}
          </DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 gap-6 overflow-hidden px-6 pb-6">
          {/* 左栏：插件信息 */}
          <aside className="w-60 shrink-0 flex flex-col items-center text-center gap-3 rounded-xl border border-border bg-background p-4 self-start">
            <div className="flex h-16 w-16 items-center justify-center rounded bg-muted">
              <PluginIcon source={iconSrc} />
            </div>
            <span className="break-all text-base font-semibold">{name}</span>
            {description ? (
              <p className="break-all text-xs text-muted-foreground">{description}</p>
            ) : null}
            <div className="my-1 w-full border-t" />
            <Meta label={t('pluginDetail.type')} value={type || '-'} />
            <Meta label={t('pluginDetail.version')} value={version || '-'} />
            <Meta label={t('pluginDetail.author')} value={author || '-'} />
            <Meta
              label={t('pluginDetail.tags')}
              value={Array.isArray(tags) && tags.length ? tags.join(', ') : '-'}
            />
            {updatedAt ? (
              <Meta label={t('pluginDetail.updatedAt')} value={formatLocalDate(updatedAt) || '-'} />
            ) : null}
          </aside>

          {/* 右栏：README markdown */}
          <div className="min-w-0 flex-1">
            <ScrollArea className="h-full">
              <div className="min-w-0 pb-2 pr-2">
                {readme.loading ? (
                  <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                    <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    {t('pluginDetail.loading')}
                  </div>
                ) : readme.error ? (
                  <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                    {t('pluginDetail.error')}
                  </div>
                ) : readme.empty ? (
                  <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                    {t('pluginDetail.empty')}
                  </div>
                ) : (
                  <Markdown content={readme.content} />
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
