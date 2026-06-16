'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Download, Store, Check, RefreshCw, ArrowLeft } from 'lucide-react';
import { fetchStoreIndex, resolveStoreUrl } from '@/lib/agent-store';
import { AgentIcon } from '@/components/common/agent-icon';
import { sdk } from '@/lib/sdk';
import { Markdown } from '@/components/ui/markdown';

interface WorkflowsUiStoreDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

interface MiniAppIndexItem {
  id: string;
  name: string;
  type?: 'react' | 'html';
  icon?: string;
  iconUrl?: string;
  description?: string;
  zipUrl?: string;
  md5?: string;
  updatedAt?: string;
  hasIntro?: boolean;
  version?: string;
  tags?: string[];
}

function formatLocalDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}`;
}

type InstallStatus = 'not-installed' | 'updatable' | 'installed';

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex w-full text-left text-sm">
      <span className="w-16 shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 break-all">{value}</span>
    </div>
  );
}

function MiniAppDetail({ item, onBack }: { item: MiniAppIndexItem; onBack: () => void }) {
  const t = useTranslations('mini-apps');
  const [intro, setIntro] = useState<{ loading: boolean; content: string; error: boolean }>({
    loading: false,
    content: '',
    error: false,
  });

  useEffect(() => {
    let cancelled = false;
    if (!item.hasIntro) {
      setIntro({ loading: false, content: '', error: false });
      return;
    }
    setIntro({ loading: true, content: '', error: false });
    fetch(resolveStoreUrl(`mini-app/intro/${item.id}.md`))
      .then((res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        return res.text();
      })
      .then((text) => {
        if (!cancelled) setIntro({ loading: false, content: text, error: false });
      })
      .catch(() => {
        if (!cancelled) setIntro({ loading: false, content: '', error: true });
      });
    return () => {
      cancelled = true;
    };
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

export function WorkflowsUiStoreDialog({ open, onOpenChange, onImported }: WorkflowsUiStoreDialogProps) {
  const t = useTranslations('mini-apps');
  const [templates, setTemplates] = useState<MiniAppIndexItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  // 已安装项目：id -> updatedAt（ISO 字符串）。用于判断「已导入 / 有更新」
  const [installedMap, setInstalledMap] = useState<Record<string, string>>({});
  // 当前查看详情的插件；null = 列表视图，非 null = 详情视图
  const [selected, setSelected] = useState<MiniAppIndexItem | null>(null);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const index = await fetchStoreIndex<MiniAppIndexItem>('mini-app/index.json');
      setTemplates(index);
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, []);

  // 拉取本地已安装清单，建立 id -> updatedAt 映射
  const refreshInstalled = useCallback(async () => {
    try {
      const list = await sdk.miniApp.list();
      const map: Record<string, string> = {};
      for (const p of list) map[p.id] = p.updatedAt;
      setInstalledMap(map);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchTemplates();
      refreshInstalled();
    }
  }, [open, fetchTemplates, refreshInstalled]);

  // 三态：未安装 / 有更新（商店 updatedAt > 已安装 updatedAt）/ 已导入（已安装且无更新）
  const getStatus = useCallback(
    (item: MiniAppIndexItem): InstallStatus => {
      const installedAt = installedMap[item.id];
      if (!installedAt) return 'not-installed';
      if (item.updatedAt && item.updatedAt > installedAt) return 'updatable';
      return 'installed';
    },
    [installedMap],
  );

  const handleImport = async (item: MiniAppIndexItem) => {
    setImporting(item.id);
    try {
      // Download the template zip and let the server unpack it (manifest + src + icon)
      const zipUrl = resolveStoreUrl(item.zipUrl || `mini-app/${item.id}.zip`);
      const res = await fetch(zipUrl);
      if (!res.ok) throw new Error(`download failed: ${res.status}`);

      const bytes = new Uint8Array(await res.arrayBuffer());
      let binary = '';
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as unknown as number[]);
      }
      const zip = btoa(binary);

      // 传 id / storeUrl / storeChecksum：服务端据此判断新建或更新，保证按 id 关联已安装项
      await sdk.miniApp.importZip({
        zip,
        name: item.name,
        type: item.type === 'html' ? 'html' : 'react',
        description: item.description,
        id: item.id,
        storeUrl: zipUrl,
        storeChecksum: item.md5,
      });

      // 刷新「已安装」状态与外层列表；不关闭对话框，便于连续导入 / 查看状态
      await refreshInstalled();
      onImported();
    } finally {
      setImporting(null);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) setSelected(null);
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="!w-[80vw] !max-w-none !h-[80vh] !max-h-none flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Store className="h-5 w-5" />
            {t('store.title')}
          </DialogTitle>
          <DialogDescription>{t('store.description')}</DialogDescription>
        </DialogHeader>
        <ScrollArea className="flex-1 -mx-6 px-6">
          {selected ? (
            <MiniAppDetail item={selected} onBack={() => setSelected(null)} />
          ) : loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">{t('store.loading')}</div>
          ) : templates.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">{t('store.empty')}</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 pb-2">
              {templates.map((item) => {
                const status = getStatus(item);
                const isImporting = importing === item.id;
                return (
                  <div
                    key={item.id}
                    onClick={() => setSelected(item)}
                    className="rounded-xl border border-border bg-background p-4 hover:bg-accent/30 transition-colors flex flex-col gap-3 cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <AgentIcon
                        name={item.name}
                        avatarUrl={item.iconUrl ? resolveStoreUrl(item.iconUrl) : undefined}
                        icon={item.icon}
                        className="size-6 rounded shrink-0"
                      />
                      <span className="font-medium text-sm truncate">{item.name}</span>
                    </div>
                    {item.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{item.description}</p>
                    )}
                    <Button
                      variant={status === 'installed' ? 'secondary' : status === 'updatable' ? 'default' : 'outline'}
                      size="sm"
                      className="shrink-0 mt-auto w-full"
                      disabled={importing !== null || status === 'installed'}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleImport(item);
                      }}
                    >
                      {isImporting ? (
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      ) : status === 'installed' ? (
                        <>
                          <Check className="size-3.5 mr-1" />
                          {t('store.installed')}
                        </>
                      ) : status === 'updatable' ? (
                        <>
                          <RefreshCw className="size-3.5 mr-1" />
                          {t('store.update')}
                        </>
                      ) : (
                        <>
                          <Download className="size-3.5 mr-1" />
                          {t('store.import')}
                        </>
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
