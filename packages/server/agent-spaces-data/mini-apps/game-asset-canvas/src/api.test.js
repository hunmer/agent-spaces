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
