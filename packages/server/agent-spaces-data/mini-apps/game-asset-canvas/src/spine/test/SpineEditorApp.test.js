import assert from 'node:assert/strict';
import test from 'node:test';

import { SpineEditorApp } from '../core/SpineEditorApp.js';

test('zoom is ignored while view interaction is locked', () => {
  const editor = {
    viewInteractionEnabled: false,
    viewScale: 1,
    viewX: 20,
    viewY: 30,
    _applyView() { throw new Error('locked zoom must not update the view'); },
  };

  SpineEditorApp.prototype.zoomAt.call(editor, 100, 100, 1.1);
  assert.deepEqual(
    { scale: editor.viewScale, x: editor.viewX, y: editor.viewY },
    { scale: 1, x: 20, y: 30 },
  );
});

test('locking view interaction clears an active pan', () => {
  const editor = {
    viewInteractionEnabled: true,
    panning: true,
    panStart: { x: 1, y: 2 },
    spaceDown: true,
    canvasElement: { style: { cursor: 'grab' } },
  };

  SpineEditorApp.prototype.setViewInteractionEnabled.call(editor, false);
  assert.equal(editor.viewInteractionEnabled, false);
  assert.equal(editor.panning, false);
  assert.equal(editor.panStart, null);
  assert.equal(editor.spaceDown, false);
  assert.equal(editor.canvasElement.style.cursor, '');
});
