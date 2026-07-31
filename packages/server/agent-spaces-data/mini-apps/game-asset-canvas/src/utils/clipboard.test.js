import test from 'node:test';
import assert from 'node:assert/strict';
import { copyNodes, pasteNodes } from './clipboard.js';

test('copy and paste preserves a selected FileUpload connection target', () => {
  const nodes = [
    { id: 'source', type: 'textToImage', position: { x: 0, y: 0 }, data: {} },
    { id: 'target', type: 'editImage', position: { x: 100, y: 0 }, data: {} },
  ];
  const edges = [{
    id: 'edge', source: 'source', target: 'target', data: { inputTarget: 'mask' },
  }];
  let id = 0;

  copyNodes(nodes, edges);
  const pasted = pasteNodes({ genId: (prefix) => `${prefix}-${++id}` });

  assert.equal(pasted?.edges[0]?.data?.inputTarget, 'mask');
});
