import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('./ImageResult.jsx', import.meta.url), 'utf8');

test('output thumbnail actions share a bottom-centered hover action group', () => {
  assert.match(source, /\.game-asset-output-actions \{[\s\S]*left: 50%;[\s\S]*bottom: 2px;[\s\S]*display: flex;[\s\S]*transform: translateX\(-50%\);/);
  assert.match(source, /\.game-asset-output-thumb:hover \.game-asset-output-actions,[\s\S]*opacity: 1;[\s\S]*pointer-events: auto;/);
  assert.match(source, /<div className="game-asset-output-actions nodrag nopan nowheel">[\s\S]*<FolderPlus[\s\S]*<Trash2/);
  assert.doesNotMatch(source, /-right-1 -top-1|-bottom-1 -right-1/);
});

test('group header clears only its own output indexes', () => {
  assert.match(source, /onRemoveImage\(section\.items\.map\(\(item\) => item\.index\)\)/);
  assert.match(source, /title=\{`清空当前组产出（\$\{section\.groupName\}）`\}/);
});
