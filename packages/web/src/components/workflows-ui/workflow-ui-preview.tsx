"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import type { WorkflowUiProject } from '@agent-spaces/sdk';
import { sdk } from '@/lib/sdk';
import { pluginApi } from '@/lib/workflow-plugin-api';
import { resolveServerAssetUrl } from '@/lib/server';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AvatarGroup } from '@/components/ui/avatar-group';
import { PanelRightOpen, Loader2, Search } from 'lucide-react';
import { WorkflowUiRenderer } from './workflow-ui-renderer';

interface WorkflowUiPreviewProps {
  type: 'react' | 'html';
  sourceCode: string;
  error: string | null;
  onError: (error: string | null) => void;
  projectId?: string;
  projectName?: string;
  hideHeader?: boolean;
  /** List of enabled plugin IDs */
  enabledPlugins?: string[];
  /** filename -> content map for multi-file import resolution */
  files?: Record<string, string>;
  /** entry point filename */
  mainFile?: string;
}

export function WorkflowUiPreview({ type, sourceCode, error, onError, projectId, projectName, hideHeader, enabledPlugins, files, mainFile }: WorkflowUiPreviewProps) {
  const t = useTranslations('workflows-ui');
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [projects, setProjects] = useState<WorkflowUiProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [allPlugins, setAllPlugins] = useState<{ id: string; name: string; iconPath?: string }[]>([]);

  // Load plugin metadata for avatar display
  useEffect(() => {
    if (!projectId) return;
    pluginApi.list().then((list) => {
      setAllPlugins(list.map(p => ({ id: p.id, name: p.name, iconPath: p.iconPath })));
    }).catch(() => {});
  }, [projectId]);

  const enabledPluginAvatars = useMemo(() => {
    if (!enabledPlugins?.length) return [];
    const enabledSet = new Set(enabledPlugins);
    return allPlugins
      .filter(p => enabledSet.has(p.id))
      .map(p => ({
        imageUrl: p.iconPath ? resolveServerAssetUrl(`/api/plugins/${p.id}/icon`) : '',
        name: p.name,
      }));
  }, [enabledPlugins, allPlugins]);

  // Load projects when drawer opens
  const handleDrawerOpen = useCallback((open: boolean) => {
    setDrawerOpen(open);
    if (open && projects.length === 0) {
      setProjectsLoading(true);
      sdk.workflowUi.list().then((list) => {
        setProjects(list);
        setProjectsLoading(false);
      }).catch(() => setProjectsLoading(false));
    }
  }, [projects.length]);

  const handleProjectSwitch = useCallback((id: string) => {
    setDrawerOpen(false);
    router.push(`/workflows-ui-preview/${id}`);
  }, [router]);

  const showToolbar = !!projectId && !hideHeader;
  const handleRendererError = useCallback((nextError: string | null) => {
    onError(nextError === 'React custom view must export a default component.'
      ? t('preview.entryExportError')
      : nextError);
  }, [onError, t]);

  return (
    <div className="relative flex flex-col h-full">
      {showToolbar && (
        <div className="flex items-center shrink-0 px-3 py-1.5 border-b bg-background/80 backdrop-blur-sm">
          <div className="flex-1 min-w-0">
            {enabledPluginAvatars.length > 0 && (
              <AvatarGroup avatarUrls={enabledPluginAvatars} size="sm" />
            )}
          </div>
          <span className="text-sm font-medium truncate max-w-[60%] text-center">
            {projectName}
          </span>
          <div className="flex-1 flex justify-end">
            <Sheet open={drawerOpen} onOpenChange={handleDrawerOpen}>
              <SheetTrigger render={<Button variant="ghost" size="icon" className="h-7 w-7" />}>
                  <PanelRightOpen className="h-4 w-4" />
              </SheetTrigger>
              <SheetContent side="right" className="w-72 p-0">
                <SheetHeader className="px-4 pt-4 pb-2">
                  <SheetTitle className="text-sm">{t('preview.switchProject')}</SheetTitle>
                </SheetHeader>
                <div className="px-3 pb-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder={t('page.searchPlaceholder')}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="h-8 text-xs pl-8"
                    />
                  </div>
                </div>
                <ScrollArea className="h-[calc(100%-100px)]">
                  <div className="px-3 pb-3 space-y-1">
                    {projectsLoading && (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    )}
                    {!projectsLoading && projects
                      .filter((p) => {
                        if (!search) return true;
                        const q = search.toLowerCase();
                        return p.name.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q);
                      })
                      .map((p) => (
                      <button
                        key={p.id}
                        onClick={() => handleProjectSwitch(p.id)}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-left text-sm transition-colors hover:bg-accent ${
                          p.id === projectId ? 'bg-accent' : ''
                        }`}
                      >
                        <span className="truncate flex-1">{p.name}</span>
                        <Badge variant={p.type === 'react' ? 'default' : 'secondary'} className="text-[10px] shrink-0">
                          {p.type === 'react' ? 'React' : 'HTML'}
                        </Badge>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      )}
      {error && (
        <div className="shrink-0 bg-destructive/10 border-b border-destructive/30 p-2 text-xs text-destructive font-mono whitespace-pre-wrap max-h-32 overflow-auto">
          {error}
        </div>
      )}
      <WorkflowUiRenderer
        type={type}
        sourceCode={sourceCode}
        onError={handleRendererError}
        className={hideHeader ? "flex-1" : "flex-1 p-4"}
        files={files}
        mainFile={mainFile}
      />
    </div>
  );
}
