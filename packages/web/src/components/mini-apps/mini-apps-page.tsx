'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import type { MiniAppProject } from '@agent-spaces/sdk';
import { sdk } from '@/lib/sdk';
import { pluginApi } from '@/lib/workflow-plugin-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Plus, Upload, FileQuestion, Store } from 'lucide-react';
import { WorkflowsUiCard } from './mini-apps-card';
import { WorkflowsUiCreateDialog } from './mini-apps-create-dialog';
import { WorkflowsUiStoreDialog } from './mini-apps-store-dialog';

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]); // strip data:...;base64, prefix
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function WorkflowsUiPage() {
  const t = useTranslations('mini-apps');
  const [projects, setProjects] = useState<MiniAppProject[]>([]);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [storeOpen, setStoreOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [allPlugins, setAllPlugins] = useState<{ id: string; name: string; iconPath?: string }[]>([]);

  const loadProjects = useCallback(async () => {
    try {
      const list = await sdk.miniApp.list();
      setProjects(list);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // 加载插件清单（供卡片展示已启用插件图标）—— 整页只请求一次
  useEffect(() => {
    pluginApi.list().then((list) => {
      setAllPlugins(list.map(p => ({ id: p.id, name: p.name, iconPath: p.iconPath })));
    }).catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    if (!search) return projects;
    const q = search.toLowerCase();
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q) ||
        p.tags?.some((t) => t.toLowerCase().includes(q)),
    );
  }, [projects, search]);

  const handleDelete = useCallback(async (id: string) => {
    await sdk.miniApp.delete_(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const handleUpdated = useCallback((updated: MiniAppProject) => {
    setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  }, []);

  const handleImport = useCallback(async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const zip = await fileToBase64(file);
        const name = file.name.replace(/\.zip$/i, '');
        await sdk.miniApp.importZip({ zip, name });
        loadProjects();
      } catch {
        // invalid zip or import error
      }
    };
    input.click();
  }, [loadProjects]);

  return (
    <div className="p-6 h-full flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="hidden md:flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold">{t('page.title')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('page.subtitle')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setStoreOpen(true)}>
            <Store className="h-4 w-4 mr-2" />
            {t('page.store')}
          </Button>
          <Button variant="outline" onClick={handleImport}>
            <Upload className="h-4 w-4 mr-2" />
            {t('page.importZip')}
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            {t('page.create')}
          </Button>
        </div>
      </div>

      {/* Mobile header */}
      <div className="md:hidden mb-4">
        <h2 className="text-lg font-semibold">{t('page.title')}</h2>
        <p className="text-sm text-muted-foreground mb-3">
          {t('page.subtitle')}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setStoreOpen(true)}>
            <Store className="h-4 w-4 mr-2" />
            {t('page.store')}
          </Button>
          <Button variant="outline" size="sm" onClick={handleImport}>
            <Upload className="h-4 w-4 mr-2" />
            {t('page.importZip')}
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            {t('page.create')}
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t('page.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
          {t('page.loading')}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground">
          <FileQuestion className="h-10 w-10 mb-3" />
          {projects.length === 0 ? (
            <>
              <p className="text-sm mb-3">{t('page.empty')}</p>
              <Button variant="outline" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                {t('page.createFirst')}
              </Button>
            </>
          ) : (
            <p className="text-sm">{t('page.noMatch')}</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 flex-1 content-start">
          {filtered.map((project) => (
            <WorkflowsUiCard
              key={project.id}
              project={project}
              onDelete={handleDelete}
              onUpdated={handleUpdated}
              allPlugins={allPlugins}
            />
          ))}
        </div>
      )}

      <WorkflowsUiCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
      <WorkflowsUiStoreDialog open={storeOpen} onOpenChange={setStoreOpen} onImported={loadProjects} />
    </div>
  );
}
