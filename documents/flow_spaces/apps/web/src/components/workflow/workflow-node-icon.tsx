'use client';

import * as LucideIcons from 'lucide-react';
import type { ComponentType } from 'react';
import { resolveServerAssetUrl } from '@/lib/server';
import { PluginIcon } from './workflow-plugin-icon';

type IconComponent = ComponentType<{ className?: string }>;

export type WorkflowNodeIconDefinition = {
  icon?: string;
  pluginId?: string;
  pluginIconPath?: string;
} | null | undefined;

export function WorkflowNodeDefinitionIcon({
  definition,
  className,
}: {
  definition: WorkflowNodeIconDefinition;
  className: string;
}) {
  if (definition?.pluginId && definition.pluginIconPath) {
    return (
      <PluginIcon
        source={{
          type: 'url',
          url: resolveServerAssetUrl(`/api/plugins/${encodeURIComponent(definition.pluginId)}/icon`),
        }}
        className={className}
      />
    );
  }

  const Icon = definition?.icon
    ? (LucideIcons as unknown as Record<string, IconComponent | undefined>)[definition.icon]
    : undefined;

  return Icon ? <Icon className={className} /> : null;
}
