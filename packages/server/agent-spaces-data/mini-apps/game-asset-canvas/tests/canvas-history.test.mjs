import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/utils/canvas-history.js', import.meta.url), 'utf8');
const { canvasHistorySignature, createCanvasSnapshot, describeCanvasChange, restoreHistoryNodes } = await import(
  `data:text/javascript,${encodeURIComponent(source)}`
);

const base = createCanvasSnapshot(
  [{ id: 'a', type: 'note', position: { x: 0, y: 0 }, selected: false, data: { text: 'A' } }],
  [],
  [],
);
const moved = createCanvasSnapshot(
  [{ ...base.nodes[0], position: { x: 100, y: 50 }, selected: true }],
  [],
  [],
);
assert.equal(canvasHistorySignature(base), canvasHistorySignature(moved));

const edited = createCanvasSnapshot([{ ...base.nodes[0], data: { text: 'B' } }], [], []);
assert.equal(describeCanvasChange(base, edited).label, '修改节点表单');
assert.equal(describeCanvasChange(base, createCanvasSnapshot([...base.nodes, { id: 'b', type: 'note', data: {} }], [], [])).label, '新增节点');
assert.equal(describeCanvasChange(base, createCanvasSnapshot(base.nodes, [{ id: 'e', source: 'a', target: 'b' }], [])).label, '新增连线');

const restored = restoreHistoryNodes(moved.nodes, base.nodes);
assert.deepEqual(restored[0].position, moved.nodes[0].position);
assert.deepEqual(restored[0].data, base.nodes[0].data);
