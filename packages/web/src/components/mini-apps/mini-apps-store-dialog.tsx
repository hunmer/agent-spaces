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
import { Download, Store } from 'lucide-react';
import { fetchStoreIndex, resolveStoreUrl } from '@/lib/agent-store';
import { AgentIcon } from '@/components/common/agent-icon';
import { sdk } from '@/lib/sdk';

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
}

export function WorkflowsUiStoreDialog({ open, onOpenChange, onImported }: WorkflowsUiStoreDialogProps) {
  const t = useTranslations('mini-apps');
  const [templates, setTemplates] = useState<MiniAppIndexItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);

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

  useEffect(() => {
    if (open) fetchTemplates();
  }, [open, fetchTemplates]);

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

      await sdk.miniApp.importZip({
        zip,
        name: item.name,
        type: item.type === 'html' ? 'html' : 'react',
        description: item.description,
      });

      onImported();
      onOpenChange(false);
    } finally {
      setImporting(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!w-[80vw] !max-w-none !h-[80vh] !max-h-none flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Store className="h-5 w-5" />
            {t('store.title')}
          </DialogTitle>
          <DialogDescription>{t('store.description')}</DialogDescription>
        </DialogHeader>
        <ScrollArea className="flex-1 -mx-6 px-6">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">{t('store.loading')}</div>
          ) : templates.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">{t('store.empty')}</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 pb-2">
              {templates.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-border bg-background p-4 hover:bg-accent/30 transition-colors flex flex-col gap-3"
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
                    variant="outline"
                    size="sm"
                    className="shrink-0 mt-auto w-full"
                    disabled={importing !== null}
                    onClick={() => handleImport(item)}
                  >
                    {importing === item.id ? (
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    ) : (
                      <>
                        <Download className="size-3.5 mr-1" />
                        {t('store.import')}
                      </>
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
