import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  GROUP_OUTPUT_FILTER_MODES,
  applyAssetToNodeStates,
  collectGroupOutputAssets,
  ensureGroupExecution,
  normalizeGroupOutputBinding,
  resolveGroupOutputFilter,
  wouldCreateGroupOutputBindingCycle,
} from './group-execution.js';

const nodes = [
  { id: 'a', type: 'textToImage', data: { label: 'A', output: { images: ['a1', 'a2'] } } },
  { id: 'b', type: 'editImage', data: { label: 'B', output: { images: ['b1'] } } },
  { id: 'c', type: 'textToImage', data: { label: 'C', output: { images: ['c1'] } } },
  { id: 'd', type: 'imageDisplay', data: { images: ['upload-only'] } },
];

test('全部模式只收集来源组节点的当前 output.images', () => {
  const result = collectGroupOutputAssets(nodes, ['a', 'b', 'd'], {
    sourceGroupId: 'source',
    filter: { mode: GROUP_OUTPUT_FILTER_MODES.all },
  });
  assert.deepEqual(result.map((item) => item.url), ['a1', 'a2', 'b1']);
});

test('指定节点模式支持多选', () => {
  const result = collectGroupOutputAssets(nodes, ['a', 'b', 'c'], {
    sourceGroupId: 'source',
    filter: { mode: GROUP_OUTPUT_FILTER_MODES.nodes, nodeIds: ['b', 'c'] },
  });
  assert.deepEqual(result.map((item) => item.url), ['b1', 'c1']);
});

test('节点类型模式支持多选并限制在来源组内', () => {
  const result = collectGroupOutputAssets(nodes, ['a', 'b'], {
    sourceGroupId: 'source',
    filter: { mode: GROUP_OUTPUT_FILTER_MODES.types, nodeTypes: ['textToImage', 'editImage'] },
  });
  assert.deepEqual(result.map((item) => item.url), ['a1', 'a2', 'b1']);
});

test('绑定配置会去重并补齐默认过滤字段', () => {
  assert.deepEqual(normalizeGroupOutputBinding({
    sourceGroupId: 'source',
    filter: { mode: 'nodes', nodeIds: ['a', 'a'] },
  }), {
    sourceGroupId: 'source',
    filter: { mode: 'nodes', nodeIds: ['a'], nodeTypes: [] },
  });
});

test('组输出绑定不能形成循环', () => {
  const groups = [
    { id: 'a' },
    { id: 'b', batchExecution: { assets: { binding: { sourceGroupId: 'a' } } } },
    { id: 'c', batchExecution: { assets: { binding: { sourceGroupId: 'b' } } } },
  ];
  assert.equal(wouldCreateGroupOutputBindingCycle(groups, 'c', 'a'), true);
  assert.equal(wouldCreateGroupOutputBindingCycle(groups, 'a', 'c'), false);
  assert.equal(wouldCreateGroupOutputBindingCycle(groups, 'a', 'a'), true);
});

test('执行模型归一化会保留持久化的绑定配置', () => {
  const execution = ensureGroupExecution({
    assets: {
      binding: { sourceGroupId: 'source', filter: { mode: 'types', nodeTypes: ['textToImage'] } },
      sourceSignature: 'signature',
      runs: [],
    },
  }, [], []);
  assert.deepEqual(execution.assets.binding, {
    sourceGroupId: 'source',
    filter: { mode: 'types', nodeIds: [], nodeTypes: ['textToImage'] },
  });
  assert.equal(execution.assets.sourceSignature, 'signature');
});

test('绑定图片会应用到目标组的上传素材槽位', () => {
  const targetNodes = [{ id: 'target', type: 'editImage', data: {} }];
  const result = applyAssetToNodeStates(
    { target: {} },
    targetNodes,
    [],
    ['target'],
    'current-output.png',
  );
  assert.deepEqual(result.target.uploadedImages, ['current-output.png']);
  assert.deepEqual(result.target.groupAssetInputUrls, ['current-output.png']);
});

test('对话框关闭时空绑定返回默认过滤器', () => {
  assert.deepEqual(resolveGroupOutputFilter(null, undefined), {
    mode: GROUP_OUTPUT_FILTER_MODES.all,
    nodeIds: [],
    nodeTypes: [],
  });
  assert.deepEqual(resolveGroupOutputFilter({
    sourceGroupId: 'source',
    filter: { mode: 'nodes', nodeIds: ['a'] },
  }, 'source'), {
    mode: GROUP_OUTPUT_FILTER_MODES.nodes,
    nodeIds: ['a'],
    nodeTypes: [],
  });
});

test('组拖线预览不依赖 renderer 未暴露的 react-dom createPortal', () => {
  const source = readFileSync(new URL('../components/canvas/GroupExecutionToolbar.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /from ['"]react-dom['"]/);
  assert.doesNotMatch(source, /\bcreatePortal\s*\(/);
  assert.match(source, /data-group-connect-id=\{groupId\}/);
  assert.match(source, /querySelectorAll\('\[data-group-connect-id\]'\)/);
});

test('共享组输出手柄支持连接到组输入手柄', () => {
  const source = readFileSync(new URL('../../../../../../web/src/components/workflow/workflow-group-node.tsx', import.meta.url), 'utf8');
  assert.match(source, /onConnectGroup\?: \(sourceGroupId: string, targetGroupId: string\)/);
  assert.match(source, /getGroupConnectTargetAtScreenPoint\(upEvent\.clientX, upEvent\.clientY\)/);
});
