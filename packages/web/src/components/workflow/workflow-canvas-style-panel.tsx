'use client';

import { useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { FieldLabel } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  CUSTOM_WORKFLOW_CANVAS_THEME,
  WORKFLOW_CANVAS_CUSTOM_THEME_PLACEHOLDER,
  WORKFLOW_CANVAS_THEME_PRESETS,
} from './workflow-canvas-theme';

interface WorkflowCanvasStylePanelProps {
  canvasPrefs: Record<string, unknown>;
  onCanvasPreferencesChange: (prefs: Record<string, unknown>) => void;
  onAutoLayout?: (direction: 'LR' | 'TB', options?: { layoutEngine?: string }) => void;
  isCanvasLocked: boolean;
}

export function WorkflowCanvasStylePanel({
  canvasPrefs,
  onCanvasPreferencesChange,
  onAutoLayout,
  isCanvasLocked,
}: WorkflowCanvasStylePanelProps) {
  const t = useTranslations('workflows');

  const bgVariantKey = (canvasPrefs.bgVariant as string) || 'dots';
  const snapEnabled = canvasPrefs.snapGrid !== false;
  const layoutEngine = (canvasPrefs.layoutEngine as string) || 'dagre';
  const handlePosition = (canvasPrefs.attributionPosition as string) || 'top-bottom';
  const floatingHandles = canvasPrefs.floatingHandles === true;
  const autoMergeNodeOnEdge = canvasPrefs.autoMergeNodeOnEdge !== false;
  const autoConnectAfterNodeDelete = canvasPrefs.autoConnectAfterNodeDelete !== false;
  const autoPreviewLastRun = canvasPrefs.autoPreviewLastRun === true;
  const collisionBoxEnabled = canvasPrefs.collisionBoxEnabled !== false;
  const pasteClipboardImagesAsGallery = canvasPrefs.pasteClipboardImagesAsGallery !== false;
  const themeKey = (canvasPrefs.canvasTheme as string) || 'default';
  const customThemeCss = (canvasPrefs.canvasCustomThemeCss as string) || '';
  const edgeLineStyle = (canvasPrefs.edgeLineStyle as string) || 'solid';
  const logPanelLayout = (canvasPrefs.logPanelLayout as string) || 'vertical';
  const nodeDisplayMode = (canvasPrefs.nodeDisplayMode as string) || 'normal';
  const propertyModeBadgePosition = (canvasPrefs.propertyModeBadgePosition as string) || 'center';

  const update = useCallback((patch: Record<string, unknown>) => {
    onCanvasPreferencesChange({ ...canvasPrefs, ...patch });
  }, [canvasPrefs, onCanvasPreferencesChange]);

  const handleLayoutEngineChange = useCallback((next: string) => {
    update({ layoutEngine: next });
    if (!isCanvasLocked) onAutoLayout?.('LR', { layoutEngine: next });
  }, [isCanvasLocked, onAutoLayout, update]);

  const sections: {
    id: string;
    title: string;
    value: string;
    options: readonly { value: string; label: string }[];
    onChange: (value: string) => void;
  }[] = useMemo(() => {
    const themeOptions = [
      ...WORKFLOW_CANVAS_THEME_PRESETS.map(preset => ({
        value: preset.value,
        label: t(`canvasStyle.themes.${preset.value}.label`),
      })),
      {
        value: CUSTOM_WORKFLOW_CANVAS_THEME,
        label: t('canvasStyle.themes.custom.label'),
      },
    ];

    const bgOptions = (['dots', 'lines', 'cross'] as const).map(v => ({
      value: v,
      label: t(`canvasStyle.background.${v}.label`),
    }));

    const snapOptions = [
      { value: 'true', label: t('canvasStyle.snap.on.label') },
      { value: 'false', label: t('canvasStyle.snap.off.label') },
    ];

    const layoutOptions = (['dagre', 'elk'] as const).map(v => ({
      value: v,
      label: t(`canvasStyle.layout.${v}.label`),
    }));

    const handleOptions = (['top-bottom', 'left-right', 'bottom-top', 'right-left'] as const).map(v => ({
      value: v,
      label: t(`canvasStyle.handle.${v}.label`),
    }));

    const edgeOptions = (['bezier', 'straight', 'step', 'smoothstep'] as const).map(v => ({
      value: v,
      label: t(`canvasStyle.edge.${v}.label`),
    }));

    const edgeLineOptions = (['solid', 'dashed'] as const).map(v => ({
      value: v,
      label: t(`canvasStyle.edgeLine.${v}.label`),
    }));

    const logPanelLayoutOptions = (['vertical', 'tabs'] as const).map(v => ({
      value: v,
      label: t(`canvasStyle.logPanel.${v}.label`),
    }));

    const nodeDisplayModeOptions = (['normal', 'properties'] as const).map(v => ({
      value: v,
      label: t(`canvasStyle.nodeDisplayModeOptions.${v}.label`),
    }));

    const propertyModeBadgePositionOptions = (['top', 'center', 'bottom'] as const).map(v => ({
      value: v,
      label: t(`canvasStyle.propertyModeBadgePositionOptions.${v}.label`),
    }));

    return [
      {
        id: 'nodeDisplayMode',
        title: t('canvasStyle.nodeDisplayMode'),
        value: nodeDisplayModeOptions.some(o => o.value === nodeDisplayMode) ? nodeDisplayMode : 'normal',
        options: nodeDisplayModeOptions,
        onChange: (v: string) => update({ nodeDisplayMode: v }),
      },
      {
        id: 'propertyModeBadgePosition',
        title: t('canvasStyle.propertyModeBadgePosition'),
        value: propertyModeBadgePositionOptions.some(o => o.value === propertyModeBadgePosition) ? propertyModeBadgePosition : 'center',
        options: propertyModeBadgePositionOptions,
        onChange: (v: string) => update({ propertyModeBadgePosition: v }),
      },
      {
        id: 'canvasTheme',
        title: t('canvasStyle.canvasTheme'),
        value: themeOptions.some(o => o.value === themeKey) ? themeKey : 'default',
        options: themeOptions,
        onChange: (v: string) => update({ canvasTheme: v }),
      },
      {
        id: 'backgroundStyle',
        title: t('canvasStyle.backgroundStyle'),
        value: bgVariantKey,
        options: bgOptions,
        onChange: (v: string) => update({ bgVariant: v }),
      },
      {
        id: 'snapToGrid',
        title: t('canvasStyle.snapToGrid'),
        value: String(snapEnabled),
        options: snapOptions,
        onChange: (v: string) => update({ snapGrid: v === 'true' }),
      },
      {
        id: 'layoutEngine',
        title: t('canvasStyle.layoutEngine'),
        value: layoutEngine,
        options: layoutOptions,
        onChange: handleLayoutEngineChange,
      },
      {
        id: 'handleDirection',
        title: t('canvasStyle.handleDirection'),
        value: handleOptions.some(o => o.value === handlePosition) ? handlePosition : 'top-bottom',
        options: handleOptions,
        onChange: (v: string) => update({ attributionPosition: v }),
      },
      {
        id: 'edgeStyle',
        title: t('canvasStyle.edgeStyle'),
        value: (canvasPrefs.edgePathType as string) || 'bezier',
        options: edgeOptions,
        onChange: (v: string) => update({ edgePathType: v }),
      },
      {
        id: 'edgeLineStyle',
        title: t('canvasStyle.edgeLineStyle'),
        value: edgeLineOptions.some(o => o.value === edgeLineStyle) ? edgeLineStyle : 'solid',
        options: edgeLineOptions,
        onChange: (v: string) => update({ edgeLineStyle: v }),
      },
      {
        id: 'logPanelLayout',
        title: t('canvasStyle.logPanelLayout'),
        value: logPanelLayoutOptions.some(o => o.value === logPanelLayout) ? logPanelLayout : 'vertical',
        options: logPanelLayoutOptions,
        onChange: (v: string) => update({ logPanelLayout: v }),
      },
    ];
  }, [t, nodeDisplayMode, propertyModeBadgePosition, themeKey, bgVariantKey, snapEnabled, layoutEngine, handlePosition, canvasPrefs.edgePathType, edgeLineStyle, logPanelLayout, update, handleLayoutEngineChange]);

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-4">
      {sections.map(section => (
        <div key={section.id} className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground">{section.title}</h3>
          <Select value={section.value} onValueChange={(value) => { if (value) section.onChange(value); }}>
            <SelectTrigger className="h-8 w-full text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {section.options.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}

      {themeKey === CUSTOM_WORKFLOW_CANVAS_THEME && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground">{t('canvasStyle.customThemeVars')}</h3>
          <Textarea
            value={customThemeCss}
            placeholder={WORKFLOW_CANVAS_CUSTOM_THEME_PLACEHOLDER}
            onChange={(event) => update({ canvasCustomThemeCss: event.target.value })}
            className="min-h-40 resize-y font-mono text-xs"
            spellCheck={false}
          />
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-xs font-medium text-muted-foreground">{t('canvasStyle.floatingHandle')}</h3>
        <FieldLabel
          htmlFor="floating-handles"
          className="flex items-center justify-between gap-3 rounded-md border px-2.5 py-2 text-sm"
        >
          <span>{t('canvasStyle.floatingHandleDesc')}</span>
          <Switch
            id="floating-handles"
            checked={floatingHandles}
            onCheckedChange={(checked) => update({ floatingHandles: checked })}
          />
        </FieldLabel>
      </div>
      <div className="space-y-2">
        <h3 className="text-xs font-medium text-muted-foreground">{t('canvasStyle.nodeMerge')}</h3>
        <FieldLabel
          htmlFor="auto-merge-node-on-edge"
          className="flex items-center justify-between gap-3 rounded-md border px-2.5 py-2 text-sm"
        >
          <span>{t('canvasStyle.nodeMergeDesc')}</span>
          <Switch
            id="auto-merge-node-on-edge"
            checked={autoMergeNodeOnEdge}
            onCheckedChange={(checked) => update({ autoMergeNodeOnEdge: checked })}
          />
        </FieldLabel>
      </div>
      <div className="space-y-2">
        <h3 className="text-xs font-medium text-muted-foreground">{t('canvasStyle.collision')}</h3>
        <FieldLabel
          htmlFor="collision-box-enabled"
          className="flex items-center justify-between gap-3 rounded-md border px-2.5 py-2 text-sm"
        >
          <span>{t('canvasStyle.collisionDesc')}</span>
          <Switch
            id="collision-box-enabled"
            checked={collisionBoxEnabled}
            onCheckedChange={(checked) => update({ collisionBoxEnabled: checked })}
          />
        </FieldLabel>
      </div>
      <div className="space-y-2">
        <h3 className="text-xs font-medium text-muted-foreground">{t('canvasStyle.deleteReconnect')}</h3>
        <FieldLabel
          htmlFor="auto-connect-after-node-delete"
          className="flex items-center justify-between gap-3 rounded-md border px-2.5 py-2 text-sm"
        >
          <span>{t('canvasStyle.deleteReconnectDesc')}</span>
          <Switch
            id="auto-connect-after-node-delete"
            checked={autoConnectAfterNodeDelete}
            onCheckedChange={(checked) => update({ autoConnectAfterNodeDelete: checked })}
          />
        </FieldLabel>
      </div>
      <div className="space-y-2">
        <h3 className="text-xs font-medium text-muted-foreground">{t('canvasStyle.clipboardPaste')}</h3>
        <div className="space-y-2">
          <FieldLabel
            htmlFor="paste-clipboard-images-as-gallery"
            className="flex items-center justify-between gap-3 rounded-md border px-2.5 py-2 text-sm"
          >
            <span>{t('canvasStyle.clipboardPasteImageDesc')}</span>
            <Switch
              id="paste-clipboard-images-as-gallery"
              checked={pasteClipboardImagesAsGallery}
              onCheckedChange={(checked) => update({ pasteClipboardImagesAsGallery: checked })}
            />
          </FieldLabel>
        </div>
      </div>
      <div className="space-y-2">
        <h3 className="text-xs font-medium text-muted-foreground">{t('canvasStyle.autoPreviewLastRun')}</h3>
        <FieldLabel
          htmlFor="auto-preview-last-run"
          className="flex items-center justify-between gap-3 rounded-md border px-2.5 py-2 text-sm"
        >
          <span>{t('canvasStyle.autoPreviewLastRunDesc')}</span>
          <Switch
            id="auto-preview-last-run"
            checked={autoPreviewLastRun}
            onCheckedChange={(checked) => update({ autoPreviewLastRun: checked })}
          />
        </FieldLabel>
      </div>
    </div>
  );
}
