import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CANVAS_IMAGE_DROP_MIME,
  getCanvasImageDropUrls,
  setCanvasImageDragData,
} from './file-upload-drop';

function createDataTransfer() {
  const values = new Map<string, string>();
  return {
    getData(type: string) {
      return values.get(type) || '';
    },
    setData(type: string, value: string) {
      values.set(type, value);
    },
  };
}

test('node image drag payload round-trips image URLs', () => {
  const dataTransfer = createDataTransfer();

  assert.equal(setCanvasImageDragData(dataTransfer, ['https://cdn.test/a.png', '', 'https://cdn.test/b.webp']), true);
  assert.deepEqual(getCanvasImageDropUrls(dataTransfer), [
    'https://cdn.test/a.png',
    'https://cdn.test/b.webp',
  ]);
  assert.match(dataTransfer.getData(CANVAS_IMAGE_DROP_MIME), /a\.png/);
});

test('node image drop parser ignores malformed or empty payloads', () => {
  const dataTransfer = createDataTransfer();
  dataTransfer.setData(CANVAS_IMAGE_DROP_MIME, '{bad json');
  assert.deepEqual(getCanvasImageDropUrls(dataTransfer), []);

  dataTransfer.setData(CANVAS_IMAGE_DROP_MIME, JSON.stringify({ urls: [null, '', 42] }));
  assert.deepEqual(getCanvasImageDropUrls(dataTransfer), []);
});
