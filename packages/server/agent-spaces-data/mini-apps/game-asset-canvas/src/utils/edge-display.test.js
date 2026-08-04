import test from 'node:test';
import assert from 'node:assert/strict';
import { decorateEdgesForSelection, getEdgeColor } from './edge-display.js';
import { NODE_TYPES } from './constants.js';

const schemas = {
  [NODE_TYPES.textToImage]: [
    { key: 'prompt', label: '提示词', type: 'textarea' },
  ],
};

test('选中目标节点时边标签显示图片输入属性名', () => {
  const nodes = [
    { id: 'source', type: NODE_TYPES.imageDisplay },
    { id: 'target', type: NODE_TYPES.editImage, selected: true },
  ];
  const edges = [{
    id: 'edge', source: 'source', target: 'target', data: { inputTarget: 'images' },
  }];

  const [edge] = decorateEdgesForSelection(edges, nodes, 'bezier', 'solid', schemas);
  assert.equal(edge.label, '输入图片');
});

test('选中来源节点时边标签显示目标节点的文本属性名', () => {
  const nodes = [
    { id: 'source', type: NODE_TYPES.text, selected: true },
    { id: 'target', type: NODE_TYPES.textToImage },
  ];
  const edges = [{
    id: 'edge',
    source: 'source',
    target: 'target',
    data: { inputType: 'text', inputTarget: 'prompt' },
  }];

  const [edge] = decorateEdgesForSelection(edges, nodes, 'bezier', 'solid', schemas);
  assert.equal(edge.label, '提示词');
});

test('变量级文本边标签同时显示目标属性和变量名', () => {
  const nodes = [
    { id: 'source', type: NODE_TYPES.text, selected: true },
    { id: 'target', type: NODE_TYPES.textToImage },
  ];
  const edges = [{
    id: 'edge',
    source: 'source',
    target: 'target',
    data: { inputType: 'text', inputTarget: 'prompt', inputVariable: 'subject' },
  }];

  const [edge] = decorateEdgesForSelection(edges, nodes, 'bezier', 'solid', schemas);
  assert.equal(edge.label, '提示词 · {subject}');
});

test('每条边使用不同颜色且路径、箭头和标签颜色一致', () => {
  const nodes = [
    { id: 'source-a', type: NODE_TYPES.text },
    { id: 'source-b', type: NODE_TYPES.text },
    { id: 'target', type: NODE_TYPES.textToImage, selected: true },
  ];
  const edges = [
    { id: 'edge-a', source: 'source-a', target: 'target', data: { inputType: 'text', inputTarget: 'prompt' } },
    { id: 'edge-b', source: 'source-b', target: 'target', data: { inputType: 'text', inputTarget: 'prompt' } },
  ];

  const decorated = decorateEdgesForSelection(edges, nodes, 'bezier', 'solid', schemas);
  assert.notEqual(decorated[0].style.stroke, decorated[1].style.stroke);
  decorated.forEach((edge, index) => {
    assert.equal(edge.style.stroke, getEdgeColor(edges[index], index));
    assert.equal(edge.markerEnd.color, edge.style.stroke);
    assert.equal(edge.data.highlightColor, edge.style.stroke);
  });
});
