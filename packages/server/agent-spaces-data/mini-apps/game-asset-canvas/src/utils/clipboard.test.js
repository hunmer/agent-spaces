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

test('paste reconnects a copied node to its existing upstream node', () => {
  const target = {
    id: 'target', type: 'editImage', position: { x: 100, y: 0 }, data: {},
  };
  copyNodes([target], [{
    id: 'upstream-edge',
    source: 'upstream',
    target: 'target',
    sourceHandle: 'image-output',
    targetHandle: 'image-input',
    data: { inputTarget: 'images' },
  }]);

  const pasted = pasteNodes({
    genId: (prefix) => `${prefix}-copy`,
    existingNodeIds: ['upstream', 'target'],
  });

  assert.deepEqual(pasted.edges, [{
    source: 'upstream',
    target: 'editImage-copy',
    sourceHandle: 'image-output',
    targetHandle: 'image-input',
    data: { inputTarget: 'images' },
    id: 'edge-copy',
    markerEnd: { type: 'arrowclosed' },
    animated: true,
  }]);
});

test('paste drops an upstream connection when its source is absent from the target canvas', () => {
  copyNodes([
    { id: 'target', type: 'editImage', position: { x: 100, y: 0 }, data: {} },
  ], [{ source: 'other-workspace-node', target: 'target' }]);

  const pasted = pasteNodes({
    genId: (prefix) => `${prefix}-copy`,
    existingNodeIds: ['target'],
  });

  assert.deepEqual(pasted.edges, []);
});

test('paste centers the copied node bounds around the requested viewport point', () => {
  const nodes = [
    { id: 'left', type: 'textToImage', position: { x: 100, y: 200 }, width: 200, height: 100, data: {} },
    { id: 'right', type: 'editImage', position: { x: 400, y: 300 }, width: 100, height: 200, data: {} },
  ];
  let id = 0;

  copyNodes(nodes, []);
  const pasted = pasteNodes({
    genId: (prefix) => `${prefix}-${++id}`,
    targetCenter: { x: 1000, y: 800 },
  });

  assert.deepEqual(pasted.nodes.map((node) => node.position), [
    { x: 800, y: 650 },
    { x: 1100, y: 750 },
  ]);
});

test('explicit paste offset still takes precedence for clone operations', () => {
  copyNodes([
    { id: 'source', type: 'textToImage', position: { x: 10, y: 20 }, data: {} },
  ], []);

  const pasted = pasteNodes({
    genId: (prefix) => `${prefix}-copy`,
    offset: { x: 40, y: 40 },
    targetCenter: { x: 1000, y: 800 },
  });

  assert.deepEqual(pasted.nodes[0].position, { x: 50, y: 60 });
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
