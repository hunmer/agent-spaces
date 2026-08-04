import test from 'node:test';
import assert from 'node:assert/strict';
import { createOutputAssetItems, groupOutputAssetItems } from './output-resources.js';

test('output resources remain optional and legacy images stay ungrouped', () => {
  const items = createOutputAssetItems(['a.png', 'b.png']);

  assert.deepEqual(items.map(({ url, groupName, label }) => ({ url, groupName, label })), [
    { url: 'a.png', groupName: undefined, label: undefined },
    { url: 'b.png', groupName: undefined, label: undefined },
  ]);
  assert.deepEqual(groupOutputAssetItems(items).map((section) => section.groupName), [undefined]);
});

test('output resources group by optional groupName and preserve labels', () => {
  const items = createOutputAssetItems(
    ['idle.png', 'run.png', 'jump.png'],
    [
      { url: 'idle.png', thumb: 'idle-thumb.png', groupName: '角色动画', label: '待机' },
      { url: 'run.png', groupName: '角色动画', label: '奔跑' },
      { url: 'jump.png', groupName: '特效', label: '跳跃' },
    ],
  );
  const sections = groupOutputAssetItems(items);

  assert.deepEqual(sections.map((section) => [section.groupName, section.items.length]), [
    ['角色动画', 2],
    ['特效', 1],
  ]);
  assert.equal(sections[0].items[0].resource.thumb, 'idle-thumb.png');
  assert.equal(sections[0].items[1].label, '奔跑');
});

test('duplicate URLs retain distinct resource metadata by occurrence', () => {
  const items = createOutputAssetItems(
    ['same.png', 'same.png'],
    [
      { url: 'same.png', groupName: 'A', label: '第一张' },
      { url: 'same.png', groupName: 'B', label: '第二张' },
    ],
  );

  assert.deepEqual(items.map((item) => [item.groupName, item.label]), [
    ['A', '第一张'],
    ['B', '第二张'],
  ]);
});
