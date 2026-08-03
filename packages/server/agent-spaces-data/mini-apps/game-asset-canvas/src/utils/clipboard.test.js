import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyGroupClipboardProperties, copyNodes, getClipboardProperties, pasteNodes,
} from './clipboard.js';

test('copy and paste preserves a selected FileUpload connection target', () => {
  const nodes = [
    { id: 'source', type: 'textToImage', position: { x: 0, y: 0 }, data: {} },
    { id: 'target', type: 'editImage', position: { x: 100, y: 0 }, data: {} },
  ];
  const edges = [{
    id: 'edge', source: 'source', target: 'target', data: { inputTarget: 'mask' },
  }];
  let id = 0;

  copyNodes(nodes, edges);
  const pasted = pasteNodes({ genId: (prefix) => `${prefix}-${++id}` });

  assert.equal(pasted?.edges[0]?.data?.inputTarget, 'mask');
});

test('group property apply replaces manual uploads without touching group or upstream images', () => {
  const source = {
    uploadedImages: ['source-group.png', 'source-manual.png'],
    groupAssetInputUrls: ['source-group.png'],
  };
  const target = {
    uploadedImages: ['target-group.png', 'target-manual.png'],
    groupAssetInputUrls: ['target-group.png'],
    images: ['upstream.png'],
  };

  assert.deepEqual(
    applyGroupClipboardProperties(target, source, ['uploadedImages']),
    {
      uploadedImages: ['target-group.png', 'source-manual.png'],
      groupAssetInputUrls: ['target-group.png'],
      images: ['upstream.png'],
    },
  );
});

test('group property apply protects both image compare upload slots', () => {
  const source = {
    first: { uploadedImages: ['source-group.png', 'first-manual.png'], label: 'first' },
    second: { uploadedImages: ['source-group.png', 'second-manual.png'], label: 'second' },
    groupAssetInputUrls: ['source-group.png'],
  };
  const target = {
    first: { uploadedImages: ['target-group.png', 'old-first.png'] },
    second: { uploadedImages: ['target-group.png', 'old-second.png'] },
    groupAssetInputUrls: ['target-group.png'],
  };
  const result = applyGroupClipboardProperties(target, source, ['first', 'second']);

  assert.deepEqual(result.first, { uploadedImages: ['target-group.png', 'first-manual.png'], label: 'first' });
  assert.deepEqual(result.second, { uploadedImages: ['target-group.png', 'second-manual.png'], label: 'second' });
});

test('obsolete upload toggle and group asset markers are not selectable properties', () => {
  const properties = getClipboardProperties({
    data: {
      uploadedImages: ['manual.png'],
      uploadHidden: true,
      groupAssetInputUrls: ['group.png'],
    },
  });

  assert.deepEqual(properties, [{ path: 'uploadedImages', label: 'uploadedImages' }]);
});
