import assert from 'node:assert/strict';
import type { LoadedPlugin } from '../plugin-test-harness.js';

export default async function run(plugin: LoadedPlugin) {
  const result = await plugin.runAction('fetch_text', {
    url: 'https://example.com',
    timeout: 10000,
  });

  assert.equal(typeof result, 'object');
  assert.notEqual(result, null);

  const payload = result as {
    success?: boolean;
    data?: { text?: string; url?: string };
  };

  assert.equal(payload.success, true);
  assert.equal(payload.data?.url, 'https://example.com');
  assert.match(payload.data?.text || '', /Example Domain/);

  return {
    success: true,
    textLength: payload.data?.text?.length || 0,
  };
}
