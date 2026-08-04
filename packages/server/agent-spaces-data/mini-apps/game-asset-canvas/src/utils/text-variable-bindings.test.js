import test from 'node:test';
import assert from 'node:assert/strict';
import { computeTextVariableBindings } from './text-variable-bindings.js';
import { getEdgeColor } from './edge-display.js';

test('computeTextVariableBindings groups connections by target field and variable with edge colors', () => {
  const nodes = [
    { id: 'source-a', type: 'text', data: { title: '角色文本' } },
    { id: 'source-b', type: 'text', data: { label: '风格文本' } },
    { id: 'target', type: 'textToImage', data: {} },
  ];
  const edges = [
    { id: 'edge-a', source: 'source-a', target: 'target', data: { inputType: 'text', inputTarget: 'prompt', inputVariable: 'subject' } },
    { id: 'edge-b', source: 'source-b', target: 'target', data: { inputType: 'text', inputTarget: 'prompt', inputVariable: 'style' } },
    { id: 'image-edge', source: 'source-a', target: 'target', data: { inputType: 'image', inputTarget: 'images' } },
  ];

  const target = computeTextVariableBindings(nodes, edges).get('target');
  assert.deepEqual(target.prompt.subject, [{
    edgeId: 'edge-a', sourceId: 'source-a', color: getEdgeColor(edges[0], 0), label: '角色文本',
  }]);
  assert.deepEqual(target.prompt.style, [{
    edgeId: 'edge-b', sourceId: 'source-b', color: getEdgeColor(edges[1], 1), label: '风格文本',
  }]);
  assert.equal(target.images, undefined);
});
