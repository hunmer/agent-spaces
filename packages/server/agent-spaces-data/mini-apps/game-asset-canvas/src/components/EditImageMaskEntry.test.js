import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const editNodeSource = fs.readFileSync(new URL('./nodes/EditImageNode.jsx', import.meta.url), 'utf8');
const fileUploadSource = fs.readFileSync(new URL('./FileUpload.jsx', import.meta.url), 'utf8');

test('Edit Image thumbnails open mask painting and save the exported mask', () => {
  assert.match(fileUploadSource, /onEditItem\?\.\(item\.src\)/);
  assert.match(fileUploadSource, /title="蒙版绘制"/);
  assert.match(editNodeSource, /onEditItem=\{setMaskPaintSource\}/);
  assert.match(editNodeSource, /inputImages=\{maskPaintSource \? \[maskPaintSource\] : \[\]\}/);
  assert.match(editNodeSource, /onSave=\{setMaskImage\}/);
  assert.match(editNodeSource, /editMaskPaintData/);
});
