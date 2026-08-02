import test from 'node:test';
import assert from 'node:assert/strict';
import { getGroupMiniMapBounds, getGroupMiniMapColor } from './group-minimap.js';

test('getGroupMiniMapColor resolves preset and custom colors', () => {
  assert.equal(getGroupMiniMapColor('绿色'), '#10b981');
  assert.equal(getGroupMiniMapColor('#AABBCC'), '#AABBCC');
  assert.equal(getGroupMiniMapColor('unknown'), '#3b82f6');
});

test('getGroupMiniMapBounds matches the group overlay bounds', () => {
  const bounds = getGroupMiniMapBounds({}, [
    { position: { x: 100, y: 80 }, width: 200, height: 120 },
    { position: { x: 400, y: 240 }, width: 100, height: 80 },
  ]);

  assert.deepEqual(bounds, { x: 70, y: 22, width: 460, height: 328 });
  assert.deepEqual(
    getGroupMiniMapBounds({ x: 10, y: 20, width: 320, height: 180 }, []),
    { x: 10, y: 20, width: 320, height: 180 },
  );
});
