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
import { PluginDetailDialog } from './plugin-detail-dialog';

export function LocalPluginCard({
  plugin,
  inWorkflow,
  disabled,
  needsUpdate,
  updateQueued,
  updating,
  updateFailed,
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
  updateQueued?: boolean;
  updating?: boolean;
  updateFailed?: boolean;
  onToggleAction: () => void;
  onConfigAction?: () => void;
  onUninstallAction?: () => void;
  onUpdateAction?: () => void;
  /** 点击图标打开插件工具对话框（需同时传入 projectId / enabledPlugins / onEnabledPluginsChange） */
  projectId?: string;
  enabledPlugins?: string[];
  onEnabledPluginsChange?: (plugins: string[]) => void;
}) {
  const t = useTranslations('workflows');
  const [toolsOpen, setToolsOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const canShowTools = Boolean(projectId && enabledPlugins && onEnabledPluginsChange);
  const iconPath = plugin.iconPath || '';
  const iconSrc = plugin.iconPath
    ? { type: 'url' as const, url: /^(?:[a-z][a-z\d+\-.]*:)?\/\//i.test(iconPath) ? iconPath : resolveServerAssetUrl(`/api/plugins/${encodeURIComponent(plugin.id)}/icon`) }
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
        containerClassName={updateFailed ? 'border-destructive ring-1 ring-destructive/40' : undefined}
        clickable
        onClick={() => setDetailOpen(true)}
        iconClickable={canShowTools}
        onIconClick={canShowTools ? () => setToolsOpen(true) : undefined}
        iconTitle={canShowTools ? t('pluginCard.tools') : undefined}
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
        {onUpdateAction && (needsUpdate || updateQueued) && (
          updateQueued ? (
            <Button variant="secondary" size="sm" className="h-7 gap-1 text-xs" disabled={updating} onClick={(e) => { e.stopPropagation(); onUpdateAction(); }}>
              <RefreshCw className={`h-3.5 w-3.5 ${updating ? 'animate-spin' : ''}`} />
              {updating ? '更新中' : '等待更新'}
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs text-orange-500 border-orange-300 hover:bg-orange-50" onClick={(e) => { e.stopPropagation(); onUpdateAction(); }}>
              <RefreshCw className="h-3.5 w-3.5" />
              {updateFailed ? '重试' : '更新'}
            </Button>
          )
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

      <PluginDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        name={plugin.name}
        version={plugin.version}
        description={plugin.description}
        tags={plugin.tags}
        type={plugin.type}
        author={plugin.author?.name}
        updatedAt={plugin.installedAt ? new Date(plugin.installedAt).toISOString() : undefined}
        iconSrc={iconSrc}
        pluginId={plugin.id}
        iconPath={plugin.iconPath}
      />
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
  const [detailOpen, setDetailOpen] = useState(false);
  const iconSrc = plugin.iconUrl
    ? { type: 'url' as const, url: resolveStoreUrl(plugin.iconUrl) }
    : { type: 'builtin' as const, variant: 'store' as const };
  // 商店插件：远程地址 + README.md
  const readmeUrl = plugin.path ? resolveStoreUrl(`plugins/${plugin.path}/README.md`) : undefined;

  return (
    <>
      <PluginCardShell
        iconSrc={iconSrc}
        name={plugin.name}
        version={plugin.version}
        description={plugin.description}
        tags={plugin.tags}
        badge={installed ? t('pluginCard.installed') : t('pluginCard.notInstalled')}
        badgeVariant={installed ? 'default' : 'outline'}
        clickable
        onClick={() => setDetailOpen(true)}
      >
        {plugin.type ? <Badge variant="secondary" className="max-w-full truncate text-[10px]">{plugin.type}</Badge> : null}
        <Button
          size="sm"
          variant={installed ? 'outline' : 'default'}
          className="ml-auto h-7 min-w-0 max-w-full gap-1 px-2 text-xs"
          disabled={installing}
          onClick={(e) => { e.stopPropagation(); onInstallAction(); }}
        >
          {installed ? (
            <>
              <Download className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{t('pluginCard.reinstall')}</span>
            </>
          ) : installing ? (
            <>
              <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin" />
              <span className="truncate">{t('pluginCard.installing')}</span>
            </>
          ) : (
            <>
              <Download className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{t('pluginCard.installAndAdd')}</span>
            </>
          )}
        </Button>
      </PluginCardShell>

      <PluginDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        name={plugin.name}
        version={plugin.version}
        description={plugin.description}
        tags={plugin.tags}
        type={plugin.type}
        author={plugin.author?.name}
        updatedAt={plugin.updatedAt}
        iconSrc={iconSrc}
        readmeUrl={readmeUrl}
      />
    </>
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
  containerClassName,
  clickable,
  onClick,
  iconClickable,
  onIconClick,
  iconTitle,
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
  containerClassName?: string;
  clickable?: boolean;
  onClick?: () => void;
  /** 图标是否作为独立入口（本地插件：点击打开工具对话框） */
  iconClickable?: boolean;
  onIconClick?: () => void;
  iconTitle?: string;
  children: React.ReactNode;
}) {
  const t = useTranslations('workflows');

  return (
    <div
      className={`group flex min-h-[156px] min-w-0 flex-col rounded-md border bg-background p-3 ${clickable ? 'cursor-pointer transition-colors hover:border-primary/40 hover:bg-muted/30' : ''} ${containerClassName || ''}`}
      onClick={onClick}
    >
      <div className="flex min-w-0 items-start gap-2">
        <div
          title={iconTitle}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted ${iconClickable ? 'cursor-pointer ring-offset-1 transition-shadow hover:ring-2 hover:ring-primary/50' : ''}`}
          onClick={iconClickable && onIconClick ? (e) => { e.stopPropagation(); onIconClick(); } : undefined}
        >
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
          <Badge variant={badgeVariant} className="max-w-[45%] shrink-0 truncate">{badge}</Badge>
        )}
      </div>
      <p className="mt-2 line-clamp-3 min-h-[48px] text-xs text-muted-foreground">{description || t('pluginCard.noDescription')}</p>
      <div className="mt-2 flex min-w-0 flex-wrap gap-1">
        {(tags || []).slice(0, 4).map(item => <Badge key={item} variant="outline" className="max-w-full truncate text-[10px]">{item}</Badge>)}
      </div>
      <div className="mt-auto flex min-w-0 flex-wrap items-center gap-2 pt-3">
        {children}
      </div>
    </div>
  );
}
