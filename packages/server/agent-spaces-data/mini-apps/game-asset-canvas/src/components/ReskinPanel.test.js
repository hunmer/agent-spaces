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
  assert.match(source, /itemOne={<SpineCompareViewer assets={beforeAssets}/);
  assert.match(source, /itemTwo={<SpineCompareViewer assets={afterAssets}/);
  assert.doesNotMatch(source, /spineAfterSnapshot/);
});

test('reskin log thumbnails have stable bounded dimensions and no log icon', () => {
  assert.match(source, /className="h-20 w-full max-h-20 object-contain"/);
  assert.match(source, /className="w-24 shrink-0 overflow-hidden/);
  assert.doesNotMatch(source, /ScrollText/);
});

test('slot repaint supports multi-part references and scoped result actions', () => {
  assert.match(source, /data-testid="slot-reference-strip"/);
  assert.match(source, /selectedSlots\.includes\(part\.id\)/);
  assert.match(source, /runInpaintParts/);
  assert.match(source, /data-testid="slot-result-strip"/);
  assert.match(source, />\s*替换当前动作\s*</);
  assert.match(source, />\s*替换所有动作\s*</);
  assert.match(source, />\s*删除\s*</);
  assert.match(source, /toggleSlotResult\(result\)/);
  assert.match(source, /item\.regionName === result\.regionName \? \{ \.\.\.item, scope: null \}/);
});

test('slot repaint results are serialized and hydrated from stable image URLs', () => {
  assert.match(source, /slotResults: slotResults\.filter\(\(result\) => result\.imageUrl\)/);
  assert.match(source, /imageUrl: result\.imageUrl/);
  assert.match(source, /initialState\.slotResults/);
  assert.match(source, /drawToCanvas\(image, result\.width, result\.height\)/);
});

test('slot repaint keeps error logs and renders the current failure in the panel', () => {
  assert.match(source, /step !== 'error' && !hasReskinLogImageOutput\(data\)/);
  assert.match(source, /const message = err\?\.message \|\| String\(err\)/);
  assert.match(source, /setInpaintError\(message\)/);
  assert.match(source, /<p role="alert"[\s\S]*?\{inpaintError\}[\s\S]*?<\/p>/);
});
