import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ensurePluginSidecar, stopPluginSidecar } from '../src/services/plugin-sidecar.js';

async function waitForFile(filePath: string): Promise<void> {
  const deadline = Date.now() + 3000;
  while (!existsSync(filePath) && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.equal(existsSync(filePath), true);
}

test('plugin sidecar starts once on its configured trigger', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'agent-spaces-sidecar-'));
  const marker = path.join(dir, 'started.txt');
  const pluginId = 'test.sidecar';
  const config = {
    command: process.execPath,
    args: ['-e', `require('fs').appendFileSync(${JSON.stringify(marker)}, '1'); setInterval(() => {}, 1000)`],
    cwd: '.',
    trigger: 'first-request' as const,
  };

  try {
    await ensurePluginSidecar(pluginId, dir, config, 'server-load');
    assert.equal(existsSync(marker), false);

    const first = ensurePluginSidecar(pluginId, dir, config, 'first-request');
    const second = ensurePluginSidecar(pluginId, dir, config, 'first-request');
    assert.equal(first, second);
    await Promise.all([first, second]);
    await waitForFile(marker);
    assert.equal(readFileSync(marker, 'utf8'), '1');
  } finally {
    stopPluginSidecar(pluginId);
    await new Promise(resolve => setTimeout(resolve, 100));
    rmSync(dir, { recursive: true, force: true });
  }
});

test('plugin sidecar rejects a working directory outside the plugin', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'agent-spaces-sidecar-'));
  try {
    await assert.rejects(
      ensurePluginSidecar('test.invalid-cwd', dir, {
        command: process.execPath,
        cwd: '..',
        trigger: 'first-request',
      }, 'first-request'),
      /must stay inside the plugin directory/,
    );
  } finally {
    stopPluginSidecar('test.invalid-cwd');
    rmSync(dir, { recursive: true, force: true });
  }
});
