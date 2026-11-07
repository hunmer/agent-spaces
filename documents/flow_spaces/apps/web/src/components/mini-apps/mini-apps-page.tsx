'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import type { MiniAppProject } from '@agent-spaces/sdk';
import { sdk } from '@/lib/sdk';
import { pluginApi } from '@/lib/workflow-plugin-api';
import { Button } from '@/components/ui/button';
import { Search, Plus, Upload, FileQuestion, Store, CheckSquare } from 'lucide-react';
import { MiniAppCard } from './mini-apps-card';
import { MiniAppCreateDialog } from './mini-apps-create-dialog';
import { MiniAppStoreDialog } from './mini-apps-store-dialog';
import { MiniAppEditor } from './mini-app-editor';
import { MiniAppListDialog } from './mini-apps-list-dialog';
import {
  MiniAppFilterToolbar,
  useMiniAppFilters,
} from './mini-apps-filters';
import { useSearchParams } from 'next/navigation';

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

export function MiniAppPage() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get('id');

  if (projectId) {
    return <MiniAppEditor projectId={projectId} />;
  }

  return <MiniAppListPage />;
}

function MiniAppListPage() {
  const t = useTranslations('mini-apps');
  const [projects, setProjects] = useState<MiniAppProject[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [storeOpen, setStoreOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [allPlugins, setAllPlugins] = useState<{ id: string; name: string; iconPath?: string }[]>([]);
  // 多选 Dialog 状态
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSelectedIds, setPickerSelectedIds] = useState<string[]>([]);

  const filters = useMiniAppFilters({ projects, persistKey: 'miniapp-filter' });

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
      } catch (err) {
        toast.error(err instanceof Error ? err.message : '导入失败');
      }
    };
    input.click();
  }, [loadProjects]);

  // 多选 Dialog 确认回调：返回选中的完整项目数据
  const handlePickerConfirm = useCallback((selected: MiniAppProject[]) => {
    setPickerOpen(false);
    setPickerSelectedIds([]);
    toast.success(t('listDialog.selected', { count: selected.length }));
    // TODO: 在此消费 selected —— 例如绑定到工作流、批量导出等
    // eslint-disable-next-line no-console
    console.log('[mini-apps picker] selected:', selected);
  }, [t]);

  const openPicker = useCallback(() => {
    setPickerSelectedIds([]);
    setPickerOpen(true);
  }, []);

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
          <Button variant="outline" onClick={openPicker}>
            <CheckSquare className="h-4 w-4 mr-2" />
            {t('page.select')}
          </Button>
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
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={openPicker}>
            <CheckSquare className="h-4 w-4 mr-2" />
            {t('page.select')}
          </Button>
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

      {/* Filters toolbar (search / type / sort / tags) */}
      <MiniAppFilterToolbar state={filters} className="mb-4" />

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
          {t('page.loading')}
        </div>
      ) : filters.filtered.length === 0 ? (
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
          {filters.filtered.map((project) => (
            <MiniAppCard
              key={project.id}
              project={project}
              onDelete={handleDelete}
              onUpdated={handleUpdated}
              allPlugins={allPlugins}
            />
          ))}
        </div>
      )}

      <MiniAppCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
      <MiniAppStoreDialog open={storeOpen} onOpenChange={setStoreOpen} onImported={loadProjects} />
      <MiniAppListDialog
        open={pickerOpen}
        projects={projects}
        selectable
        selectedIds={pickerSelectedIds}
        onSelectedIdsChange={setPickerSelectedIds}
        onConfirm={handlePickerConfirm}
        onClose={() => setPickerOpen(false)}
        confirmLabelKey="filters.confirm"
      />
    </div>
  );
}
