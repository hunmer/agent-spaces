import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('./SpineEditorDialog.jsx', import.meta.url), 'utf8');

test('viewer initialization depends on the asset URL signature, not the assets object identity', () => {
  assert.match(source, /getSpineAssetsSignature/);
  assert.match(source, /\[open, assetsSignature, canvasElement, loadAssets, touchRevision\]/);
  assert.doesNotMatch(source, /\[open, assets, canvasElement, loadAssets, touchRevision\]/);
});

test('right sidebar exposes embedded reskin logs and binary mask repaint', () => {
  assert.match(source, /<TabsTrigger value="logs"/);
  assert.match(source, /<ReskinLogsPanel/);
  assert.match(source, /mode="binary-mask"/);
  assert.match(source, /repaintRegionMask/);
  assert.match(source, /callbacksRef\.current\.onReskinComplete/);
  assert.match(source, /restoreReskinLogs\(initialReskinLogs, assetsSignature\)/);
  assert.match(source, /onReskinLogsChange\?\.\(persisted\)/);
});

test('reskin panel receives the current animation for scoped part replacement', () => {
  assert.match(source, /currentAnimation=\{animation\}/);
  assert.match(source, /cutoutWorkflowId=\{canvasSettings\.imageEnchanterWorkflowId\}/);
});

test('right sidebar is resizable and the log tab has no icon', () => {
  assert.match(source, /<ResizablePanelGroup direction="horizontal"/);
  assert.match(source, /<ResizableHandle withHandle/);
  assert.match(source, /id="spine-right-panel"/);
  assert.doesNotMatch(source, /<ScrollText/);
});

test('toolbar exposes an explicit bone drag toggle limited to pose mode', () => {
  assert.match(source, /aria-pressed=\{boneDragEnabled\}/);
  assert.match(source, /开启骨骼拖拽/);
  assert.match(source, /setBoneDragEnabled\(enabled && mode === 'pose'\)/);
  assert.match(source, /disabled=\{!spine \|\| mode !== 'pose' \|\| recording\}/);
});

test('viewer body selection activates the bone tree and exposes nearby quick actions', () => {
  assert.match(source, /if \(boneValue\) setLeftTab\('bones'\)/);
  assert.match(source, /ref=\{boneActionsRef\}/);
  assert.match(source, /aria-label="移动骨骼"/);
  assert.match(source, /aria-label="水平翻转骨骼"/);
  assert.match(source, /gizmo\.flashBoneGroup\(boneValue\)/);
});
