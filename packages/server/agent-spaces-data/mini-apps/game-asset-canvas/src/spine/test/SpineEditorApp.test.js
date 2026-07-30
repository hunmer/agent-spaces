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

test('atlas texture replacement updates the existing resource repeatedly', async () => {
  const loadListeners = new Set();
  const source = {
    value: 'original.png',
    addEventListener(type, listener) {
      if (type === 'load') loadListeners.add(listener);
    },
    removeEventListener(type, listener) {
      if (type === 'load') loadListeners.delete(listener);
    },
    set src(value) {
      this.value = value;
      queueMicrotask(() => [...loadListeners].forEach((listener) => listener()));
    },
    get src() { return this.value; },
  };
  let resourceUpdates = 0;
  let baseTextureUpdates = 0;
  let renders = 0;
  const editor = {
    spine: {
      _baseTexture: {
        resource: { source, update: () => { resourceUpdates += 1; } },
        setResource: () => { throw new Error('Resource can be set only once'); },
        update: () => { baseTextureUpdates += 1; },
      },
    },
    app: { render: () => { renders += 1; } },
    gizmo: { redraw: () => {} },
  };

  await SpineEditorApp.prototype.replaceAtlasTexture.call(editor, 'first.png');
  await SpineEditorApp.prototype.replaceAtlasTexture.call(editor, 'second.png');

  assert.equal(source.src, 'second.png');
  assert.equal(resourceUpdates, 2);
  assert.equal(baseTextureUpdates, 2);
  assert.equal(renders, 2);
});
