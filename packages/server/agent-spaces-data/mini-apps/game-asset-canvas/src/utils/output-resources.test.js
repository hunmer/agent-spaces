import test from 'node:test';
import assert from 'node:assert/strict';
import { createOutputAssetItems, groupOutputAssetItems, removeOutputAssetItems, updateOutputVersion } from './output-resources.js';

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

test('removing the last image in one group preserves all other groups', () => {
  const images = ['idle.png', 'spark.png', 'smoke.png'];
  const resources = [
    { url: 'idle.png', groupName: '角色动画' },
    { url: 'spark.png', groupName: '特效' },
    { url: 'smoke.png', groupName: '特效' },
  ];

  assert.deepEqual(removeOutputAssetItems(images, resources, 0), {
    images: ['spark.png', 'smoke.png'],
    resources: resources.slice(1),
  });
});

test('removing a group uses one atomic index list and preserves other groups', () => {
  const images = ['idle.png', 'spark.png', 'run.png'];
  const resources = [
    { url: 'idle.png', groupName: '角色动画' },
    { url: 'spark.png', groupName: '特效' },
    { url: 'run.png', groupName: '角色动画' },
  ];

  assert.deepEqual(removeOutputAssetItems(images, resources, [0, 2]), {
    images: ['spark.png'],
    resources: [resources[1]],
  });
});

test('updating the active output version persists manual deletions across version switches', () => {
  const versions = [
    { output: { images: ['old.png'], resources: [{ url: 'old.png' }] } },
    { output: { images: ['current.png'], resources: [{ url: 'current.png' }] } },
  ];
  const next = updateOutputVersion(versions, 1, { images: [], resources: [] });

  assert.deepEqual(next[0], versions[0]);
  assert.deepEqual(next[1].output, { images: [], resources: [] });
  assert.deepEqual(versions[1].output.images, ['current.png']);
});

test('deleting an index from history 1 does not change the same index in history 2', () => {
  const versions = [
    { output: { images: ['history-1-a.png', 'history-1-b.png'] } },
    { output: { images: ['history-2-a.png', 'history-2-b.png'] } },
  ];
  const current = removeOutputAssetItems(versions[0].output.images, [], 0);
  const next = updateOutputVersion(versions, 0, current);

  assert.deepEqual(next[0].output.images, ['history-1-b.png']);
  assert.deepEqual(next[1].output.images, ['history-2-a.png', 'history-2-b.png']);
});
