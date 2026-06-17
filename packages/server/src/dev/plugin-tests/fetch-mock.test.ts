import assert from 'node:assert/strict';
import type { LoadedPlugin } from '../plugin-test-harness.js';

export default async function run(plugin: LoadedPlugin) {
  assert.equal(plugin.config.defaultTimeout, 1234);

  const result = await plugin.runAction('fetch_text', {
    url: 'https://mock.local/page',
  });

  const payload = result as {
    success?: boolean;
    data?: { text?: string };
  };

  assert.equal(payload.success, true);
  assert.equal(payload.data?.text, 'mock text from https://mock.local/page');

  return { success: true };
}
