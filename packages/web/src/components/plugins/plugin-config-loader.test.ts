import assert from 'node:assert/strict';
import test from 'node:test';
import { loadPluginConfigValues } from './plugin-config-loader';

test('loadPluginConfigValues falls back to plugin defaults when referenced schemes are missing', async () => {
  const defaults = { apiKey: 'default-key' };

  const values = await loadPluginConfigValues({
    schemeName: 'missing-scheme',
    legacyWorkflowId: 'workflow-id',
    readScheme: async () => { throw new Error('global scheme missing'); },
    readLegacyScheme: async () => { throw new Error('legacy scheme missing'); },
    saveScheme: async () => undefined,
    readDefault: async () => defaults,
  });

  assert.deepEqual(values, defaults);
});

test('loadPluginConfigValues migrates and returns a legacy workflow scheme', async () => {
  const legacyValues = { apiKey: 'legacy-key' };
  let migratedValues: Record<string, string> | undefined;

  const values = await loadPluginConfigValues({
    schemeName: 'legacy-scheme',
    legacyWorkflowId: 'workflow-id',
    readScheme: async () => { throw new Error('global scheme missing'); },
    readLegacyScheme: async () => legacyValues,
    saveScheme: async nextValues => { migratedValues = nextValues; },
    readDefault: async () => ({ apiKey: 'default-key' }),
  });

  assert.deepEqual(values, legacyValues);
  assert.deepEqual(migratedValues, legacyValues);
});
