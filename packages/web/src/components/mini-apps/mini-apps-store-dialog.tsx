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
import { Download, Store, Check, RefreshCw } from 'lucide-react';
import { fetchStoreIndex, resolveStoreUrl } from '@/lib/agent-store';
import { AgentIcon } from '@/components/common/agent-icon';
import { sdk } from '@/lib/sdk';
import { MiniAppDetail } from './mini-apps-store-detail';

interface MiniAppStoreDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

export interface MiniAppIndexItem {
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

type InstallStatus = 'not-installed' | 'updatable' | 'installed';

export function MiniAppStoreDialog({ open, onOpenChange, onImported }: MiniAppStoreDialogProps) {
  const t = useTranslations('mini-apps');
  const [templates, setTemplates] = useState<MiniAppIndexItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  // 已安装项目：id -> version（版本号字符串）。用于判断「已导入 / 有更新」
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

  // 拉取本地已安装清单，建立 id -> version 映射
  const refreshInstalled = useCallback(async () => {
    try {
      const list = await sdk.miniApp.list();
      const map: Record<string, string> = {};
      for (const p of list) map[p.id] = p.version;
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

  // 三态：未安装 / 有更新（商店 version ≠ 已安装 version）/ 已导入（已安装且版本一致）
  const getStatus = useCallback(
    (item: MiniAppIndexItem): InstallStatus => {
      const installedVersion = installedMap[item.id];
      if (!installedVersion) return 'not-installed';
      if (item.version && item.version !== installedVersion) return 'updatable';
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
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelected(item)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelected(item);
                      }
                    }}
                    className="rounded-xl border border-border bg-background p-4 hover:bg-accent/30 transition-colors flex flex-col gap-3 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
