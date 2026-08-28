import test from 'node:test';
import assert from 'node:assert/strict';
import { createOutputAssetItems, createOutputResourceId, groupOutputAssetItems, removeEmptyOutputVersions, removeOutputAssetItems, removeOutputVersionImages, updateOutputVersion } from './output-resources.js';

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

  const [removedId] = createOutputAssetItems(images, resources).map((item) => item.id);
  const expectedResources = createOutputAssetItems(images, resources).slice(1).map((item) => item.resource);
  assert.deepEqual(removeOutputAssetItems(images, resources, removedId), {
    images: ['spark.png', 'smoke.png'],
    resources: expectedResources,
  });
});

test('removing a group uses one atomic index list and preserves other groups', () => {
  const images = ['idle.png', 'spark.png', 'run.png'];
  const resources = [
    { url: 'idle.png', groupName: '角色动画' },
    { url: 'spark.png', groupName: '特效' },
    { url: 'run.png', groupName: '角色动画' },
  ];

  const ids = createOutputAssetItems(images, resources).filter((item) => item.groupName === '角色动画').map((item) => item.id);
  const expectedResources = [createOutputAssetItems(images, resources)[1].resource];
  assert.deepEqual(removeOutputAssetItems(images, resources, ids), {
    images: ['spark.png'],
    resources: expectedResources,
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

test('permanently removing an image from one history version preserves other versions', () => {
  const versions = [
    { output: { images: ['a.png'], resources: [{ id: 'a', url: 'a.png', groupName: '1' }] } },
    { output: { images: ['b.png', 'c.png'], resources: [
      { id: 'b', url: 'b.png', groupName: '1' },
      { id: 'c', url: 'c.png', groupName: '2' },
    ] } },
  ];
  const next = removeOutputVersionImages(versions, 1, 'b');
  assert.deepEqual(next[0], versions[0]);
  assert.deepEqual(next[1].output.images, ['c.png']);
  assert.deepEqual(next[1].output.resources.map((item) => item.id), ['c']);
});

test('deleting an ID from history 1 does not change the same index in history 2', () => {
  const versions = [
    { output: { images: ['history-1-a.png', 'history-1-b.png'] } },
    { output: { images: ['history-2-a.png', 'history-2-b.png'] } },
  ];
  const id = createOutputAssetItems(versions[0].output.images, [])[0].id;
  const current = removeOutputAssetItems(versions[0].output.images, [], id);
  const next = updateOutputVersion(versions, 0, current);

  assert.deepEqual(next[0].output.images, ['history-1-b.png']);
  assert.deepEqual(next[1].output.images, ['history-2-a.png', 'history-2-b.png']);
});

test('new output resource IDs are unique', () => {
  const first = createOutputResourceId();
  const second = createOutputResourceId();
  assert.notEqual(first, second);
});

test('removing the last image prunes the empty output version and keeps a nearby active version', () => {
  const versions = [
    { output: { images: ['a.png'] } },
    { output: { images: ['b.png'] } },
    { output: { images: ['c.png'] } },
  ];
  const result = removeEmptyOutputVersions(
    updateOutputVersion(versions, 1, { images: [], resources: [] }),
    1,
  );
  assert.deepEqual(result.versions.map((version) => version.output.images), [['a.png'], ['c.png']]);
  assert.equal(result.activeVersion, 0);
});
