import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  getDragAutoPanDelta,
  isCanvasFileDrag,
} from './drag-auto-pan.js';

const rect = { left: 100, top: 50, right: 900, bottom: 650, width: 800, height: 600 };
const canvasDropMime = 'application/x-canvas-drop-images';

test('文件和画布图片拖拽会启用自动平移', () => {
  assert.equal(isCanvasFileDrag({ types: ['Files'] }, canvasDropMime), true);
  assert.equal(isCanvasFileDrag({ types: [canvasDropMime] }, canvasDropMime), true);
  assert.equal(isCanvasFileDrag({ types: ['application/reactflow'] }, canvasDropMime), false);
});

test('靠近画布四角时返回对应的双轴位移', () => {
  const topLeft = getDragAutoPanDelta(100, 50, rect);
  const bottomRight = getDragAutoPanDelta(900, 650, rect);
  assert.ok(topLeft.x > 0 && topLeft.y > 0);
  assert.ok(bottomRight.x < 0 && bottomRight.y < 0);
});

test('热区内按距离加速，中央和画布外不移动', () => {
  const edge = getDragAutoPanDelta(100, 300, rect);
  const inner = getDragAutoPanDelta(150, 300, rect);
  assert.ok(edge.x > inner.x && inner.x > 0);
  assert.deepEqual(getDragAutoPanDelta(500, 300, rect), { x: 0, y: 0 });
  assert.deepEqual(getDragAutoPanDelta(99, 300, rect), { x: 0, y: 0 });
});

test('画布自动平移使用受控 viewport，不依赖 renderer 的 panBy API', () => {
  const canvasSource = readFileSync(new URL('../components/Canvas.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(canvasSource, /reactFlow\.panBy/);
  assert.match(canvasSource, /setViewport\(\(current\) =>/);
});
