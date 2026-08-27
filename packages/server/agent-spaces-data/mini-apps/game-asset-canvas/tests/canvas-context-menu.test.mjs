import assert from 'node:assert/strict';
import {
  addNodeToContextGroup,
  getContextMenuGroupId,
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

