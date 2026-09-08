import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { NODE_TYPES } from '../src/utils/constants.js';
import {
  decorateEdgesForSelection, getEdgeColor,
} from '../src/utils/edge-display.js';

const floatingEdgeSource = await readFile(new URL('../src/components/canvas/FloatingEdge.jsx', import.meta.url), 'utf8');
const connectionLineSource = await readFile(new URL('../src/components/ConnectionLine.jsx', import.meta.url), 'utf8');
const toolbarSource = await readFile(new URL('../src/components/Toolbar.jsx', import.meta.url), 'utf8');
const canvasSource = await readFile(new URL('../src/components/Canvas.jsx', import.meta.url), 'utf8');
const rendererSource = await readFile(new URL('../../../../../web/src/components/mini-apps/react-renderer.tsx', import.meta.url), 'utf8');

const xyflowImports = floatingEdgeSource.match(/import\s*{([^}]+)}\s*from\s*['"]@xyflow\/react['"]/)?.[1]
  .split(',').map((name) => name.trim()).filter(Boolean) || [];
const xyflowHostExports = rendererSource.match(/if \(id === '@xyflow\/react'\) \{[\s\S]*?return \{([\s\S]*?)\n\s*};/)?.[1] || '';
assert.deepEqual(
  xyflowImports.filter((name) => !new RegExp(`\\b${name}\\b`).test(xyflowHostExports)),
  [],
  'FloatingEdge 只能导入 mini-app 宿主实际暴露的 xyflow 组件',
);

assert.match(floatingEdgeSource, /Math\.abs\(sourceX - targetX\) > 100/);
assert.match(floatingEdgeSource, /Math\.abs\(sourceY - targetY\) > 80/);
assert.match(floatingEdgeSource, /getSmoothStepPath\([\s\S]*borderRadius: 18/);
assert.match(floatingEdgeSource, /getBezierPath\(/);
assert.doesNotMatch(floatingEdgeSource, /pathStyle|straight|smoothstep/);
assert.doesNotMatch(connectionLineSource, /pathStyle/);
assert.doesNotMatch(toolbarSource, /edgePathStyle|edgePathStyles|onEdgePathStyleChange/);
assert.doesNotMatch(canvasSource, /EDGE_PATH_STYLES|edgePathStyle|setEdgePathStyle/);

const edges = [
  { id: 'a-b', source: 'a', target: 'b', markerEnd: { type: 'arrowclosed' } },
  { id: 'c-b', source: 'c', target: 'b', markerEnd: { type: 'arrowclosed' } },
  { id: 'b-d', source: 'b', target: 'd', markerEnd: { type: 'arrowclosed' } },
  { id: 'b-e', source: 'b', target: 'e', markerEnd: { type: 'arrowclosed' } },
  { id: 'x-y', source: 'x', target: 'y', markerEnd: { type: 'arrowclosed' } },
];
const result = decorateEdgesForSelection(edges, [{ id: 'b', selected: true }], 'solid', {}, 'b');

assert.deepEqual(result.map((edge) => edge.label), ['输入1', '输入2', '输出1', '输出2', null]);
assert.deepEqual(result.map((edge) => edge.style.stroke), edges.map((edge, index) => getEdgeColor(edge, index)));
assert.deepEqual(result.map((edge) => edge.markerEnd.color), edges.map((edge, index) => getEdgeColor(edge, index)));
assert.deepEqual(
  decorateEdgesForSelection(edges, [], 'solid').map((edge) => edge.label),
  [null, null, null, null, null],
);

const storyboardVideoEdge = {
  id: 'story-video', source: 'story', target: 'editor',
  data: { inputType: 'video', inputTarget: 'videos' },
};
assert.equal(decorateEdgesForSelection([storyboardVideoEdge], [
  { id: 'story', type: NODE_TYPES.storyboard, selected: true },
  { id: 'editor', type: NODE_TYPES.videoEditor },
], 'solid', {}, 'story')[0].label, '输入视频');
