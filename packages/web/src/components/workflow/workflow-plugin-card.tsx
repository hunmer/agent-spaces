'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { resolveStoreUrl } from '@/lib/agent-store';
import { resolveServerAssetUrl } from '@/lib/server';
import type { StoreWorkflowPlugin, WorkflowPlugin } from '@/lib/workflow-plugin-api';
import { Download, RefreshCw, Settings, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { PluginIcon } from './workflow-plugin-icon';
import { PluginToolDialog } from './plugin-tool-dialog';

export function LocalPluginCard({
  plugin,
  inWorkflow,
  disabled,
  needsUpdate,
  onToggleAction,
  onConfigAction,
  onUninstallAction,
  onUpdateAction,
  projectId,
  enabledPlugins,
  onEnabledPluginsChange,
}: {
  plugin: WorkflowPlugin;
  inWorkflow: boolean;
  disabled: boolean;
  needsUpdate?: boolean;
  onToggleAction: () => void;
  onConfigAction?: () => void;
  onUninstallAction?: () => void;
  onUpdateAction?: () => void;
  /** 传入后点击卡片主体打开插件工具对话框 */
  projectId?: string;
  enabledPlugins?: string[];
  onEnabledPluginsChange?: (plugins: string[]) => void;
}) {
  const t = useTranslations('workflows');
  const [toolsOpen, setToolsOpen] = useState(false);
  const canShowTools = Boolean(projectId && enabledPlugins && onEnabledPluginsChange);
  const iconSrc = plugin.iconPath
    ? { type: 'url' as const, url: resolveServerAssetUrl(`/api/plugins/${encodeURIComponent(plugin.id)}/icon`) }
    : { type: 'builtin' as const, variant: 'local' as const };

  return (
    <>
      <PluginCardShell
        iconSrc={iconSrc}
        name={plugin.name}
        version={plugin.version}
        description={plugin.description}
        tags={plugin.tags}
        badge={inWorkflow ? t('pluginCard.added') : t('pluginCard.notAdded')}
        badgeVariant={inWorkflow ? 'default' : 'secondary'}
        clickable={canShowTools}
        onClick={canShowTools ? () => setToolsOpen(true) : undefined}
        headerExtra={onUninstallAction ? (
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); onUninstallAction(); }}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        ) : undefined}
      >
        {plugin.config?.length ? (
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={(e) => { e.stopPropagation(); onConfigAction?.(); }}>
            <Settings className="h-3.5 w-3.5" />
          </Button>
        ) : null}
        {needsUpdate && onUpdateAction && (
          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs text-orange-500 border-orange-300 hover:bg-orange-50" onClick={(e) => { e.stopPropagation(); onUpdateAction(); }}>
            <RefreshCw className="h-3.5 w-3.5" />
            更新
          </Button>
        )}
        <Button size="sm" variant={inWorkflow ? 'outline' : 'default'} className="ml-auto h-7 text-xs" disabled={disabled} onClick={(e) => { e.stopPropagation(); onToggleAction(); }}>
          {inWorkflow ? t('pluginCard.remove') : t('pluginCard.addToWorkflow')}
        </Button>
      </PluginCardShell>

      {canShowTools && (
        <PluginToolDialog
          open={toolsOpen}
          onOpenChange={setToolsOpen}
          projectId={projectId!}
          enabledPlugins={enabledPlugins!}
          onEnabledPluginsChange={onEnabledPluginsChange!}
          defaultPluginId={plugin.id}
          persistEnabledPlugins={false}
        />
      )}
    </>
  );
}

export function StorePluginCard({
  plugin,
  installed,
  installing,
  onInstallAction,
}: {
  plugin: StoreWorkflowPlugin;
  installed: boolean;
  installing: boolean;
  onInstallAction: () => void;
}) {
  const t = useTranslations('workflows');
  const iconSrc = plugin.iconUrl
    ? { type: 'url' as const, url: resolveStoreUrl(plugin.iconUrl) }
    : { type: 'builtin' as const, variant: 'store' as const };

  return (
    <PluginCardShell
      iconSrc={iconSrc}
      name={plugin.name}
      version={plugin.version}
      description={plugin.description}
      tags={plugin.tags}
      badge={installed ? t('pluginCard.installed') : t('pluginCard.notInstalled')}
      badgeVariant={installed ? 'default' : 'outline'}
    >
      {plugin.type ? <Badge variant="secondary" className="text-[10px]">{plugin.type}</Badge> : null}
      <Button
        size="sm"
        variant={installed ? 'outline' : 'default'}
        className="ml-auto h-7 text-xs"
        disabled={installing}
        onClick={onInstallAction}
      >
        {installed ? (
          <>
            <Download className="h-3.5 w-3.5" />
            {t('pluginCard.reinstall')}
          </>
        ) : installing ? (
          <>
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            {t('pluginCard.installing')}
          </>
        ) : (
          <>
            <Download className="h-3.5 w-3.5" />
            {t('pluginCard.installAndAdd')}
          </>
        )}
      </Button>
    </PluginCardShell>
  );
}

function PluginCardShell({
  iconSrc,
  name,
  version,
  description,
  tags,
  badge,
  badgeVariant,
  headerExtra,
  clickable,
  onClick,
  children,
}: {
  iconSrc: Parameters<typeof PluginIcon>[0]['source'];
  name: string;
  version: string;
  description?: string;
  tags?: string[];
  badge: string;
  badgeVariant: 'default' | 'secondary' | 'outline';
  headerExtra?: React.ReactNode;
  clickable?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const t = useTranslations('workflows');

  return (
    <div
      className={`group flex min-h-[156px] flex-col rounded-md border bg-background p-3 ${clickable ? 'cursor-pointer transition-colors hover:border-primary/40 hover:bg-muted/30' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-start gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted">
          <PluginIcon source={iconSrc} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{name}</div>
          <div className="text-[11px] text-muted-foreground">v{version}</div>
        </div>
        {headerExtra ? (
          <div className="flex shrink-0 items-center gap-1">
            <Badge variant={badgeVariant} className="group-hover:hidden">{badge}</Badge>
            <div className="hidden group-hover:block">
              {headerExtra}
            </div>
          </div>
        ) : (
          <Badge variant={badgeVariant}>{badge}</Badge>
        )}
      </div>
      <p className="mt-2 line-clamp-3 min-h-[48px] text-xs text-muted-foreground">{description || t('pluginCard.noDescription')}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {(tags || []).slice(0, 4).map(item => <Badge key={item} variant="outline" className="text-[10px]">{item}</Badge>)}
      </div>
      <div className="mt-auto flex items-center gap-2 pt-3">
        {children}
      </div>
    </div>
  );
}
