import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const shellSource = fs.readFileSync(new URL('./NodeShell.jsx', import.meta.url), 'utf8');
const decorationSource = fs.readFileSync(
  new URL('../../hooks/useDecoratedNodes.js', import.meta.url),
  'utf8',
);

test('node toolbar uses icon-only actions and exposes node JSON from the dots popover', () => {
  assert.doesNotMatch(shellSource, /\{action\.label\}\s*<\/button>/);
  assert.match(shellSource, /<MoreVertical className="h-3\.5 w-3\.5" \/>/);
  assert.match(shellSource, /<PopoverContent[\s\S]*onClick=\{handleCopyNodeInfo\}[\s\S]*复制节点信息/);
  assert.match(shellSource, /navigator\.clipboard\.writeText\(nodeJson\)/);
  assert.match(decorationSource, /nodeJson: JSON\.stringify\(nd, null, 2\)/);
});
