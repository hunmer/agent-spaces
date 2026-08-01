import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const toolbarSource = read('./canvas/ImageSelectionToolbar.jsx');
const contextMenuSource = read('./canvas/CanvasContextMenu.jsx');
const menuItemsSource = read('./canvas/ImageSelectionMenuItems.jsx');
const selectionSource = read('../hooks/useImageSelection.js');
const thumbnailSources = [
  read('./nodes/ImageResult.jsx'),
  read('./nodes/UpstreamImageList.jsx'),
  read('./FileUpload.jsx'),
];

test('toolbar and thumbnail context menu reuse the same image actions', () => {
  assert.match(toolbarSource, /<ImageSelectionMenuItems/);
  assert.match(contextMenuSource, /<ImageSelectionMenuItems/);
  for (const label of ['编辑', '抠图', '放大', '下载', '素材库', '取消选择']) {
    assert.match(menuItemsSource, new RegExp(`label: '${label}'`));
  }
});

test('image context menu label is rendered inside a Base UI menu group', () => {
  assert.match(contextMenuSource, /showImageMenu \? \([\s\S]*<ContextMenuGroup>[\s\S]*<ContextMenuLabel>[\s\S]*<ImageSelectionMenuItems[\s\S]*<\/ContextMenuGroup>/);
});

test('input and output thumbnails expose their image selection identity', () => {
  for (const source of thumbnailSources) {
    assert.match(source, /data-image-selection-node-id=/);
    assert.match(source, /data-image-selection-url=/);
  }
});

test('context-click keeps an existing multi-selection and otherwise selects the target image', () => {
  assert.match(selectionSource, /selectForContextMenu[\s\S]*prev\.some[\s\S]*\? prev : \[\{ nodeId, url \}\]/);
  assert.match(contextMenuSource, /onSelectContextImage\?\.\(nodeId, url\)/);
});
