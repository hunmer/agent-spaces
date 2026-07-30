import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extensionForImageMime, imageFilesFromClipboardData, readClipboardImageFiles,
} from './clipboard-images.js';

class TestFile extends Blob {
  constructor(parts, name, options) {
    super(parts, options);
    this.name = name;
  }
}

test('extensionForImageMime normalizes common image MIME types', () => {
  assert.equal(extensionForImageMime('image/jpeg'), 'jpg');
  assert.equal(extensionForImageMime('image/svg+xml'), 'svg');
  assert.equal(extensionForImageMime(''), 'png');
});

test('readClipboardImageFiles reads only image clipboard items', async () => {
  const clipboard = {
    read: async () => [
      { types: ['text/plain'], getType: async () => new Blob(['ignored']) },
      { types: ['image/png', 'text/html'], getType: async () => new Blob(['png'], { type: 'image/png' }) },
      { types: ['image/jpeg'], getType: async () => new Blob(['jpg'], { type: 'image/jpeg' }) },
    ],
  };

  const files = await readClipboardImageFiles(clipboard, { FileClass: TestFile, now: () => 123 });

  assert.deepEqual(files.map((file) => file.name), [
    'clipboard-123-1.png',
    'clipboard-123-2.jpg',
  ]);
  assert.deepEqual(files.map((file) => file.type), ['image/png', 'image/jpeg']);
});

test('imageFilesFromClipboardData reads native paste event files', () => {
  const image = new TestFile(['png'], 'pasted.png', { type: 'image/png' });
  const text = new TestFile(['text'], 'note.txt', { type: 'text/plain' });

  assert.deepEqual(imageFilesFromClipboardData({ files: [text, image] }), [image]);
});

test('imageFilesFromClipboardData falls back to clipboard items', () => {
  const image = new TestFile(['jpg'], 'pasted.jpg', { type: 'image/jpeg' });
  const clipboardData = {
    files: [],
    items: [
      { kind: 'string', type: 'text/plain', getAsFile: () => null },
      { kind: 'file', type: 'image/jpeg', getAsFile: () => image },
    ],
  };

  assert.deepEqual(imageFilesFromClipboardData(clipboardData), [image]);
});
