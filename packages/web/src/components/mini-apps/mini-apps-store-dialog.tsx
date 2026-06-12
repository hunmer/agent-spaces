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
  icon?: string;
  iconUrl?: string;
  desc?: string;
  files: string[];
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
      const withDesc = await Promise.all(
        index.map(async (item) => {
          try {
            const res = await fetch(resolveStoreUrl(`mini-app/${item.id}/manifest.json`));
            if (res.ok) {
              const manifest = await res.json();
              return { ...item, desc: manifest.description as string | undefined };
            }
          } catch { /* ignore */ }
          return item;
        }),
      );
      setTemplates(withDesc);
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
      // Fetch manifest first
      const manifestRes = await fetch(resolveStoreUrl(`mini-app/${item.id}/manifest.json`));
      const manifest = manifestRes.ok ? await manifestRes.json() : {};
      const type = manifest.type === 'html' ? 'html' : 'react';

      // Create project
      const project = await sdk.miniApp.create({
        name: item.name,
        type,
        description: manifest.description,
        tags: manifest.tags,
      });

      // Write source files (under src/)
      const srcFiles = item.files.filter(f => f.startsWith('src/'));
      await Promise.all(
        srcFiles.map(async (file) => {
          const res = await fetch(resolveStoreUrl(`mini-app/${item.id}/${file}`));
          if (!res.ok) return;
          const content = await res.text();
          const relPath = file.replace(/^src\//, '');
          await sdk.miniApp.writeFile(project.id, relPath, content);
        }),
      );

      // Update project metadata from manifest
      if (manifest.enabledPlugins || manifest.agentConfigId || manifest.icon) {
        await sdk.miniApp.update(project.id, {
          enabledPlugins: manifest.enabledPlugins,
          agentConfigId: manifest.agentConfigId,
          icon: manifest.icon,
        });
      }

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
                  {item.desc && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{item.desc}</p>
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
