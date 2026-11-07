import type { NodeTypeDefinition, NodeProperty, ArrayFieldItem } from '@agent-spaces/shared';
import { useTranslations } from 'next-intl';
import { getAllNodeDefinitions, getNodeDefinition as _getNodeDefinition } from './registry';

type TranslateFn = (key: string, fallback?: string) => string;

function wrapT(t: ReturnType<typeof useTranslations>): TranslateFn {
  return (key: string, fallback?: string) => {
    // Only translate strings that look like our i18n keys
    if (!key || typeof key !== 'string') return fallback ?? String(key ?? '');
    if (!key.startsWith('nodes.')) return fallback ?? key;
    try {
      return t(key as Parameters<typeof t>[0]);
    } catch {
      return fallback ?? key;
    }
  };
}

function translateDef(def: NodeTypeDefinition, t: TranslateFn): NodeTypeDefinition {
  return {
    ...def,
    label: t(def.label, def.label),
    category: t(def.category, def.category),
    description: t(def.description, def.description),
    properties: translateProperties(def.properties, t),
    handles: def.handles
      ? {
          ...def.handles,
          sourceHandles: def.handles.sourceHandles?.map(sh => ({
            ...sh,
            label: sh.label ? t(sh.label, sh.label) : sh.label,
          })),
        }
      : def.handles,
    compound: def.compound
      ? {
          ...def.compound,
          children: def.compound.children.map(c => ({
            ...c,
            label: c.label ? t(c.label, c.label) : c.label,
          })),
        }
      : def.compound,
  };
}

function translateProperties(properties: NodeProperty[], t: TranslateFn): NodeProperty[] {
  return properties.map(prop => {
    const p: NodeProperty = {
      ...prop,
      label: t(prop.label, prop.label),
    };
    if (prop.tooltip) p.tooltip = t(prop.tooltip, prop.tooltip);
    if (typeof prop.default === 'string' && prop.default.startsWith('nodes.')) {
      p.default = t(prop.default, prop.default);
    }
    if (prop.options) {
      p.options = prop.options.map(opt => ({
        ...opt,
        label: t(opt.label, opt.label),
      }));
    }
    if (prop.fields) {
      p.fields = translateFields(prop.fields, t);
    }
    return p;
  });
}

function translateFields(fields: ArrayFieldItem[], t: TranslateFn): ArrayFieldItem[] {
  return fields.map(field => {
    const f: ArrayFieldItem = {
      ...field,
      label: t(field.label, field.label),
    };
    if (field.placeholder) f.placeholder = t(field.placeholder, field.placeholder);
    if (field.options) {
      f.options = field.options.map(opt => ({
        ...opt,
        label: t(opt.label, opt.label),
      }));
    }
    return f;
  });
}

function translateAll(defs: NodeTypeDefinition[], t: TranslateFn): NodeTypeDefinition[] {
  return defs.map(d => translateDef(d, t));
}

/**
 * React hook: returns all node definitions with i18n keys translated.
 */
export function useLocalizedAllNodeDefinitions(): NodeTypeDefinition[] {
  const t = wrapT(useTranslations('workflows'));
  return translateAll(getAllNodeDefinitions(), t);
}

/**
 * React hook: returns node definitions grouped by translated category.
 */
export function useLocalizedNodeDefinitionsByCategory(): Record<string, NodeTypeDefinition[]> {
  const t = wrapT(useTranslations('workflows'));
  const all = translateAll(getAllNodeDefinitions(), t);
  const groups: Record<string, NodeTypeDefinition[]> = {};
  for (const def of all) {
    if (def.manualCreate === false) continue;
    if (!groups[def.category]) groups[def.category] = [];
    groups[def.category].push(def);
  }
  return groups;
}

/**
 * React hook: returns a single translated node definition.
 */
export function useLocalizedNodeDefinition(type: string): NodeTypeDefinition | undefined {
  const t = wrapT(useTranslations('workflows'));
  const def = _getNodeDefinition(type);
  return def ? translateDef(def, t) : undefined;
}

/**
 * React hook: search node definitions with translated labels.
 */
export function useLocalizedSearchNodeDefinitions(query: string): NodeTypeDefinition[] {
  const t = wrapT(useTranslations('workflows'));
  const all = translateAll(getAllNodeDefinitions(), t);
  const q = query.toLowerCase();
  return all.filter(
    d => d.label.toLowerCase().includes(q) || d.type.toLowerCase().includes(q),
  );
}
