import test from 'node:test';
import assert from 'node:assert/strict';
import { serializePreset, instantiatePreset, presetBoundingBox } from './node-preset.js';

// 模拟节点（含函数回调和瞬时数据，验证剥离）
const makeNode = (id, type, position, extra = {}) => ({
  id,
  type,
  position,
  width: 280,
  height: 220,
  style: { width: 280, height: 220 },
  data: {
    label: type,
    params: { prompt: 'hello' },
    output: { images: ['should-be-stripped.png'] },
    status: 'done',
    loading: false,
    onUpdate: () => {},
    ...extra,
  },
});

test('serializePreset strips transient data and injected callbacks', () => {
  const nodes = [makeNode('n1', 'textToImage', { x: 100, y: 50 })];
  const preset = serializePreset(nodes, [], [], '我的预设', 'preset-1');
  assert.equal(preset.id, 'preset-1');
  assert.equal(preset.name, '我的预设');
  assert.equal(preset.nodes.length, 1);
  const data = preset.nodes[0].data;
  assert.equal(data.output, undefined, 'output 应被剥离');
  assert.equal(data.status, undefined, 'status 应被剥离');
  assert.equal(data.loading, undefined, 'loading 应被剥离');
  assert.equal(data.onUpdate, undefined, '函数回调应被剥离');
  assert.deepEqual(data.params, { prompt: 'hello' }, 'params 应保留');
});

test('serializePreset normalizes coordinates to origin', () => {
  const nodes = [
    makeNode('n1', 'textToImage', { x: 300, y: 200 }),
    makeNode('n2', 'imageDisplay', { x: 100, y: 50 }),
  ];
  const preset = serializePreset(nodes, [], [], '预设');
  // 左上角 (100, 50) 归一化为 (0, 0)
  assert.deepEqual(preset.nodes[0].position, { x: 200, y: 150 });
  assert.deepEqual(preset.nodes[1].position, { x: 0, y: 0 });
});

test('serializePreset keeps only internal edges', () => {
  const nodes = [makeNode('n1', 'textToImage', { x: 0, y: 0 }), makeNode('n2', 'imageDisplay', { x: 320, y: 0 })];
  const edges = [
    { source: 'n1', target: 'n2', sourceHandle: 'out', targetHandle: 'in' }, // 内部
    { source: 'n1', target: 'n3' }, // 外部（n3 不在选中集）
    { source: 'n3', target: 'n2' }, // 外部
  ];
  const preset = serializePreset(nodes, edges, [], '预设');
  assert.equal(preset.edges.length, 1);
  assert.equal(preset.edges[0].source, 'n1');
  assert.equal(preset.edges[0].target, 'n2');
});

test('serializePreset keeps only groups overlapping selection', () => {
  const nodes = [makeNode('n1', 'textToImage', { x: 0, y: 0 }), makeNode('n2', 'imageDisplay', { x: 320, y: 0 })];
  const groups = [
    { id: 'g1', name: '组1', childNodeIds: ['n1', 'n2'], childGroupIds: [] }, // 命中
    { id: 'g2', name: '组2', childNodeIds: ['n3'], childGroupIds: [] },       // 未命中
  ];
  const preset = serializePreset(nodes, [], groups, '预设');
  assert.equal(preset.groups.length, 1);
  assert.equal(preset.groups[0].name, '组1');
  assert.deepEqual(preset.groups[0].childNodeIds, ['n1', 'n2']);
});

test('instantiatePreset assigns new ids and remaps edges + groups', () => {
  const nodes = [
    makeNode('old1', 'textToImage', { x: 0, y: 0 }),
    makeNode('old2', 'imageDisplay', { x: 320, y: 0 }),
  ];
  const edges = [{ source: 'old1', target: 'old2', sourceHandle: 'out', targetHandle: 'in' }];
  const groups = [{ name: '组1', childNodeIds: ['old1', 'old2'], childGroupIds: [] }];
  const preset = serializePreset(nodes, edges, groups, '预设');

  let counter = 0;
  const fakeGenId = (prefix) => `${prefix}-${++counter}`;
  const result = instantiatePreset(preset, { genId: fakeGenId, offset: { x: 1000, y: 1000 } });

  assert.equal(result.nodes.length, 2);
  // 新 id 不等于旧 id
  assert.notEqual(result.nodes[0].id, 'old1');
  assert.notEqual(result.nodes[1].id, 'old2');
  // 坐标按 offset 平移
  assert.deepEqual(result.nodes[0].position, { x: 1000, y: 1000 });
  assert.deepEqual(result.nodes[1].position, { x: 1320, y: 1000 });
  // 边的端点映射到新 id
  assert.equal(result.edges.length, 1);
  assert.equal(result.edges[0].source, result.nodes[0].id);
  assert.equal(result.edges[0].target, result.nodes[1].id);
  // 分组 childNodeIds 映射到新 id
  assert.equal(result.groups.length, 1);
  assert.deepEqual(result.groups[0].childNodeIds, [result.nodes[0].id, result.nodes[1].id]);
});

test('instantiatePreset with empty preset returns empty arrays', () => {
  let counter = 0;
  const fakeGenId = (prefix) => `${prefix}-${++counter}`;
  const result = instantiatePreset({ nodes: [], edges: [], groups: [] }, { genId: fakeGenId });
  assert.deepEqual(result, { nodes: [], edges: [], groups: [] });
});

test('presetBoundingBox computes max extent', () => {
  const preset = {
    nodes: [
      { position: { x: 0, y: 0 }, width: 200, height: 100 },
      { position: { x: 300, y: 100 }, width: 100, height: 50 },
    ],
  };
  const box = presetBoundingBox(preset);
  // maxX = 300+100=400, maxY = 100+50=150
  assert.deepEqual(box, { width: 400, height: 150 });
});
