import test from 'node:test';
import assert from 'node:assert/strict';
import api from './api.js';

test('add_nodes sends structured params when tool data arrives as $text', async () => {
  const requests = [];
  const ctx = {
    requestClient: async (type, payload) => {
      requests.push({ type, payload });
      return { ok: true, nodeIds: ['new-1'], edges: { created: 0, skipped: 0, invalid: 0 } };
    },
  };

  const result = await api.add_nodes({
    nodes: [{
      type: 'editImage',
      data: { $text: '{"params":{"prompt":"expression sheet","aspect":"1:1"}}' },
    }],
  }, ctx);

  assert.equal(result.ok, true);
  assert.deepEqual(requests[0].payload.nodes[0].data, {
    params: { prompt: 'expression sheet', aspect: '1:1' },
  });
});

test('update_nodes rejects malformed $text before sending an RPC', async () => {
  let requested = false;
  const result = await api.update_nodes({
    nodes: [{ nodeId: 'node-1', data: { $text: '{bad json' } }],
  }, {
    requestClient: async () => {
      requested = true;
      return { ok: true };
    },
  });

  assert.equal(result.ok, false);
  assert.equal(requested, false);
  assert.match(result.message, /不是合法 JSON/);
});

test('add_nodes forwards autoLayout options to the canvas RPC', async () => {
  const requests = [];
  const result = await api.add_nodes({
    nodes: [{ type: 'note' }, { type: 'note' }],
    autoLayout: { direction: 'TB', grid: { rows: 2, columns: 1, horizontalGap: 20, verticalGap: 30 } },
  }, {
    requestClient: async (type, payload) => {
      requests.push({ type, payload });
      return { ok: true, nodeIds: ['a', 'b'], edges: { created: 0 } };
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(requests[0].payload.autoLayout, {
    direction: 'TB',
    grid: { rows: 2, columns: 1, horizontalGap: 20, verticalGap: 30 },
  });
});

test('arrange_group accepts grid gaps greater than 300', async () => {
  const requests = [];
  const result = await api.arrange_group({
    groupName: 'large-gap',
    grid: { rows: 1, columns: 2, horizontalGap: 1200, verticalGap: 800 },
  }, {
    requestClient: async (type, payload) => {
      requests.push({ type, payload });
      return { ok: true, groupName: 'large-gap', arrangedCount: 2 };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(requests[0].payload.grid.horizontalGap, 1200);
  assert.equal(requests[0].payload.grid.verticalGap, 800);
});

test('canvas versions can be created, listed, and restored', async () => {
  const config = new Map();
  const requests = [];
  const ctx = {
    readConfig: (path) => config.get(path),
    writeConfig: (path, value) => config.set(path, value),
    broadcast: () => {},
    requestClient: async (type, payload) => {
      requests.push({ type, payload });
      if (type === 'canvas.getCanvasSnapshot') {
        return { ok: true, nodes: [{ id: 'n1', type: 'note', data: { text: 'v1' }, position: { x: 1, y: 2 } }], edges: [], groups: [] };
      }
      return { ok: true };
    },
  };
  const created = await api.create_canvas_version({ name: '版本一' }, ctx);
  const listed = await api.list_canvas_versions({}, ctx);
  const restored = await api.restore_canvas_version({ versionId: created.id }, ctx);
  assert.equal(created.ok, true);
  assert.equal(listed.total, 1);
  assert.equal(restored.ok, true);
  assert.equal(requests.at(-1).type, 'canvas.restoreCanvas');
  assert.equal(requests.at(-1).payload.nodes[0].data.text, 'v1');
});
