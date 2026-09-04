import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

function loadHandler() {
  const source = fs.readFileSync(new URL('./background.js', import.meta.url), 'utf8')
    .replace(/\bexport\s+default\s+/, 'module.exports = ');
  const module = { exports: {} };
  new Function('module', 'exports', source)(module, module.exports);
  return module.exports;
}

function createContext(initial) {
  const configs = new Map(Object.entries(initial || {}));
  return {
    configs,
    ctx: {
      readConfig: (path) => configs.get(path) ?? null,
      updateConfig: (path, updater) => {
        const next = updater(configs.get(path) ?? null);
        configs.set(path, next);
        return next;
      },
      saveImage: async (url) => ({
        filePath: `C:/saved/${url.split('/').at(-1)}`,
        httpUrl: `/api/mini-apps/game-asset-canvas/data/file?path=${encodeURIComponent(url.split('/').at(-1))}`,
      }),
    },
  };
}

test('background image download replaces normal node outputs and history', async () => {
  const handler = loadHandler();
  const original = 'https://cdn.example.com/hero.png';
  const canvasPath = 'workspaces/ws-1/canvas.json';
  const historyPath = 'workspaces/ws-1/generation-history.json';
  const { ctx, configs } = createContext({
    [canvasPath]: {
      nodes: [{
        id: 'node-1',
        data: {
          output: { images: [original], resources: [{ id: 'r1', url: original, thumb: original }] },
          versions: [{ output: { images: [original] } }],
        },
      }],
      groups: [],
    },
    [historyPath]: [{ id: 'hist-1', nodeId: 'node-1', images: [original] }],
  });

  const result = await handler({
    type: 'persist-images',
    taskId: 'task-1',
    workspaceId: 'ws-1',
    nodeId: 'node-1',
    historyId: 'hist-1',
    urls: [original],
  }, ctx);

  const localUrl = result.mappings[0].localUrl;
  const data = configs.get(canvasPath).nodes[0].data;
  assert.deepEqual(data.output.images, [localUrl]);
  assert.equal(data.output.resources[0].url, localUrl);
  assert.equal(data.output.resources[0].thumb, localUrl);
  assert.deepEqual(data.versions[0].output.images, [localUrl]);
  assert.deepEqual(configs.get(historyPath)[0].images, [localUrl]);
  assert.equal(configs.get('download-queue.json')[0].status, 'done');
  assert.equal(configs.get('download-queue.json')[0].nodeUpdated, true);
});

test('background image download updates only the frozen group run', async () => {
  const handler = loadHandler();
  const original = 'https://cdn.example.com/run.png';
  const canvasPath = 'workspaces/ws-2/canvas.json';
  const target = {
    groupId: 'group-1', mode: 'assets', runId: 'run-b',
    templateNodeId: 'node-1', nodeId: 'exec-run-b-node-1',
  };
  const { ctx, configs } = createContext({
    [canvasPath]: {
      nodes: [{ id: 'node-1', data: { output: { images: ['active.png'] } } }],
      groups: [{
        id: 'group-1',
        batchExecution: {
          mode: 'assets',
          assets: {
            activeId: 'run-a',
            runs: [
              { id: 'run-a', nodeIds: { 'node-1': 'exec-run-a-node-1' }, nodeStates: { 'node-1': { output: { images: ['active.png'] } } } },
              { id: 'run-b', nodeIds: { 'node-1': 'exec-run-b-node-1' }, nodeStates: { 'node-1': { output: { images: [original] } } } },
            ],
          },
        },
      }],
    },
    'workspaces/ws-2/generation-history.json': [],
  });

  const result = await handler({
    type: 'persist-images', taskId: 'task-2', workspaceId: 'ws-2',
    nodeId: 'node-1', executionTarget: target, urls: [original],
  }, ctx);

  const canvas = configs.get(canvasPath);
  const runs = canvas.groups[0].batchExecution.assets.runs;
  assert.deepEqual(canvas.nodes[0].data.output.images, ['active.png']);
  assert.deepEqual(runs[0].nodeStates['node-1'].output.images, ['active.png']);
  assert.deepEqual(runs[1].nodeStates['node-1'].output.images, [result.mappings[0].localUrl]);
});
