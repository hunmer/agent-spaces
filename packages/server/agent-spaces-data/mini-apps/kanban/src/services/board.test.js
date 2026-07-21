import assert from 'node:assert/strict';
import test from 'node:test';
import boardService from './board.js';

test('stores each workspace board in its own config path', () => {
  const paths = [];
  const ctx = {
    updateConfig(path, update) {
      paths.push(path);
      return update(null);
    },
  };

  boardService.update_title({ title: 'A', workspaceId: 'workspace-a' }, ctx);
  boardService.update_title({ title: 'B', workspaceId: 'workspace/b' }, ctx);
  boardService.update_title({ title: 'Preview' }, ctx);

  assert.deepEqual(paths, [
    'workspaces/workspace-a/board.json',
    'workspaces/workspace%2Fb/board.json',
    'board.json',
  ]);
});
