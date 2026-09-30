import assert from 'node:assert/strict';
import {
  addNodeToContextGroup,
  getContextMenuGroupId,
  groupContextMenuOptions,
  selectContextMenuNode,
} from '../src/utils/canvas-context-menu.js';

const groupElement = { dataset: { workflowGroupId: 'group-a' } };
const target = { closest: (selector) => (selector === '[data-workflow-group-id]' ? groupElement : null) };
assert.equal(getContextMenuGroupId(target), 'group-a');
assert.equal(getContextMenuGroupId(null), null);

const groups = [
  { id: 'group-a', childNodeIds: ['node-a'] },
  { id: 'group-b', childNodeIds: [] },
];
assert.deepEqual(addNodeToContextGroup(groups, 'group-a', 'node-b'), [
  { id: 'group-a', childNodeIds: ['node-a', 'node-b'] },
  groups[1],
]);
assert.equal(addNodeToContextGroup(groups, null, 'node-b'), groups);

const actions = [];
selectContextMenuNode([
  { value: 'image', onSelect: () => actions.push('select') },
], 'image', () => actions.push('close'));
assert.deepEqual(actions, ['select', 'close']);

const groupedOptions = groupContextMenuOptions([
  { value: 'a', label: '节点 A', group: '基础' },
  { value: 'b', label: '节点 B', group: '图片' },
  { value: 'c', label: '节点 C', group: '基础' },
  { value: 'd', label: '节点 D' },
]);
assert.deepEqual(groupedOptions.map((group) => ({
  label: group.label,
  values: group.items.map((item) => item.value),
})), [
  { label: '基础', values: ['a', 'c'] },
  { label: '图片', values: ['b'] },
  { label: '其他', values: ['d'] },
]);
