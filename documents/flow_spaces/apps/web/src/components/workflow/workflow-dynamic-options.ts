import { useState, useEffect } from 'react';
import { sdk } from '@/lib/sdk';
import type { NodePropertyDynamicOptions } from '@agent-spaces/shared';

const SQLITE_FIELD_META_TABLE = '__sqlite_field_meta__';

export function useDynamicOptions(
  cfg: NodePropertyDynamicOptions | undefined,
  nodeData: Record<string, unknown>,
): { options: { label: string; value: string }[]; loading: boolean; placeholderKey?: string } {
  const [options, setOptions] = useState<{ label: string; value: string }[]>([]);
  const [loading, setLoading] = useState(false);

  const dbId = cfg ? String(nodeData[cfg.dependsOn] ?? '') : '';
  const table = cfg?.dependsOnTableKey ? String(nodeData[cfg.dependsOnTableKey] ?? '') : '';

  useEffect(() => {
    if (!cfg) { setOptions([]); return; }
    if (cfg.source !== 'mini-apps' && !dbId) { setOptions([]); return; }
    if (cfg.source === 'sqlite-columns' && !table) { setOptions([]); return; }

    setLoading(true);
    const request = cfg.source === 'sqlite-tables'
      ? sdk.sqlite.listTables(dbId).then((ts) => ts
          .filter((t) => t.name !== SQLITE_FIELD_META_TABLE)
          .map((t) => ({ label: `${t.name} (${t.rowCount})`, value: t.name })))
      : cfg.source === 'sqlite-columns'
        ? sdk.sqlite.describeTable(dbId, table).then((cs) => {
            const opts = cs.map((c) => ({ label: c.name, value: c.name }));
            return cfg.allOption ? [{ label: '* (All)', value: '*' }, ...opts] : opts;
          })
        : sdk.miniApp.list().then((apps) => apps.map((app) => ({
            label: app.name || app.id,
            value: app.id,
          })));

    request.then(setOptions).catch(() => setOptions([])).finally(() => setLoading(false));
  }, [dbId, table, cfg?.source, cfg?.allOption]);

  return { options, loading, placeholderKey: cfg?.placeholder };
}
