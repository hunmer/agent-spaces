import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { NODE_TYPES } from '../src/utils/constants.js';
import {
  decorateEdgesForSelection, INPUT_EDGE_COLOR, OUTPUT_EDGE_COLOR,
} from '../src/utils/edge-display.js';

const floatingEdgeSource = await readFile(new URL('../src/components/canvas/FloatingEdge.jsx', import.meta.url), 'utf8');
const rendererSource = await readFile(new URL('../../../../../web/src/components/mini-apps/react-renderer.tsx', import.meta.url), 'utf8');

const xyflowImports = floatingEdgeSource.match(/import\s*{([^}]+)}\s*from\s*['"]@xyflow\/react['"]/)?.[1]
  .split(',').map((name) => name.trim()).filter(Boolean) || [];
const xyflowHostExports = rendererSource.match(/if \(id === '@xyflow\/react'\) \{[\s\S]*?return \{([\s\S]*?)\n\s*};/)?.[1] || '';
assert.deepEqual(
  xyflowImports.filter((name) => !new RegExp(`\\b${name}\\b`).test(xyflowHostExports)),
  [],
  'FloatingEdge 只能导入 mini-app 宿主实际暴露的 xyflow 组件',
);

const edges = [
  { id: 'a-b', source: 'a', target: 'b', markerEnd: { type: 'arrowclosed' } },
  { id: 'c-b', source: 'c', target: 'b', markerEnd: { type: 'arrowclosed' } },
  { id: 'b-d', source: 'b', target: 'd', markerEnd: { type: 'arrowclosed' } },
  { id: 'b-e', source: 'b', target: 'e', markerEnd: { type: 'arrowclosed' } },
  { id: 'x-y', source: 'x', target: 'y', markerEnd: { type: 'arrowclosed' } },
];
const result = decorateEdgesForSelection(edges, [{ id: 'b', selected: true }], 'bezier', 'solid');

assert.deepEqual(result.map((edge) => edge.label), ['输入1', '输入2', '输出1', '输出2', null]);
assert.deepEqual(result.map((edge) => edge.style.stroke), [
  INPUT_EDGE_COLOR, INPUT_EDGE_COLOR, OUTPUT_EDGE_COLOR, OUTPUT_EDGE_COLOR, undefined,
]);
assert.deepEqual(result.map((edge) => edge.markerEnd.color), [
  INPUT_EDGE_COLOR, INPUT_EDGE_COLOR, OUTPUT_EDGE_COLOR, OUTPUT_EDGE_COLOR, undefined,
]);
assert.deepEqual(
  decorateEdgesForSelection(edges, [], 'bezier', 'solid').map((edge) => edge.label),
  [null, null, null, null, null],
);

const storyboardVideoEdge = {
  id: 'story-video', source: 'story', target: 'editor',
  data: { inputType: 'video', inputTarget: 'videos' },
};
assert.equal(decorateEdgesForSelection([storyboardVideoEdge], [
  { id: 'story', type: NODE_TYPES.storyboard, selected: true },
  { id: 'editor', type: NODE_TYPES.videoEditor },
], 'bezier', 'solid')[0].label, '输入视频');
