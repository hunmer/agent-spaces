import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('./ReskinPanel.jsx', import.meta.url), 'utf8');

test('initial reskin form state is not persisted during editor mount', () => {
  assert.match(source, /persistenceEnabledRef\.current = false/);
  assert.match(source, /if \(!persistenceEnabledRef\.current\)/);
  assert.match(source, /const enablePersistence = useCallback/);
  assert.match(source, /skipped initial reskin form persistence/);
});

test('deleting a reskin history item restores the original atlas', () => {
  assert.match(source, /await deletePersistedHistory\(item\.id\)/);
  assert.match(source, /replaceAtlas\?\.\(assets\.png, '默认皮肤'\)/);
  assert.match(source, /setActiveSkin\(null\)/);
});

test('reskin history comparison uses ReactCompareSlider with material and Spine tabs', () => {
  assert.match(source, /<ReactCompareSlider/);
  assert.match(source, /<TabsTrigger value="material">材质图对比<\/TabsTrigger>/);
  assert.match(source, /<TabsTrigger value="spine">Spine 对比<\/TabsTrigger>/);
  assert.match(source, /spineAfterSnapshot/);
});
