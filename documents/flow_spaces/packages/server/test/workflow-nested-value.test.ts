import test from 'node:test';
import assert from 'node:assert/strict';
import { getNestedValue } from '../src/services/execution-manager.js';
import { mergeLoopItemResult } from '../src/services/execution-composite-helpers.js';

test('getNestedValue projects object fields across arrays and flattens array field values', () => {
  const data = {
    items: [
      { url: ['https://example.test/blue-1.png', 'https://example.test/blue-2.png'] },
      { url: ['https://example.test/red-1.png', 'https://example.test/red-2.png'] },
    ],
  };

  assert.deepEqual(getNestedValue(data, 'items.url'), [
    'https://example.test/blue-1.png',
    'https://example.test/blue-2.png',
    'https://example.test/red-1.png',
    'https://example.test/red-2.png',
  ]);
});

test('getNestedValue keeps explicit array indexes intact', () => {
  const data = {
    items: [
      { url: ['https://example.test/blue-1.png', 'https://example.test/blue-2.png'] },
      { url: ['https://example.test/red-1.png', 'https://example.test/red-2.png'] },
    ],
  };

  assert.deepEqual(getNestedValue(data, 'items[0].url'), [
    'https://example.test/blue-1.png',
    'https://example.test/blue-2.png',
  ]);
  assert.equal(getNestedValue(data, 'items[1].url[0]'), 'https://example.test/red-1.png');
});

test('mergeLoopItemResult preserves loop item fields while appending iteration result', () => {
  const item = {
    text: '咖啡杯已经见底',
    image: '',
    audio: 'https://example.test/audio.mp3',
    duration: 1.848,
  };
  const result = {
    images: ['https://example.test/image.png'],
    requestId: 'req-1',
    success: true,
    data: {
      images: ['https://example.test/image.png'],
      requestId: 'req-1',
    },
  };

  assert.deepEqual(mergeLoopItemResult(item, result), {
    text: '咖啡杯已经见底',
    image: '',
    audio: 'https://example.test/audio.mp3',
    duration: 1.848,
    images: ['https://example.test/image.png'],
    requestId: 'req-1',
    success: true,
    data: {
      images: ['https://example.test/image.png'],
      requestId: 'req-1',
    },
  });
});
