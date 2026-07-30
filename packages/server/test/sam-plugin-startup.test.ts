import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const pluginRoot = fileURLToPath(new URL('../../templates/plugins/sam/', import.meta.url));

test('SAM plugin includes a selectable built-in service startup configuration', () => {
  const info = JSON.parse(readFileSync(`${pluginRoot}/info.json`, 'utf8'));
  assert.deepEqual(info.startup, {
    command: 'python',
    args: ['sam_server.py'],
    cwd: 'sam_server',
    trigger: 'first-request',
    readyUrl: 'http://127.0.0.1:30231/health',
    readyTimeoutMs: 600000,
  });
  for (const file of ['sam_server.py', 'requirements.txt', 'README.md', '.env.example']) {
    assert.equal(existsSync(`${pluginRoot}/sam_server/${file}`), true, file);
  }
  assert.equal(existsSync(`${pluginRoot}/sam_server/.env`), false);
});
