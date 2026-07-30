import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../spine/components/SpinePanels.jsx', import.meta.url), 'utf8');

test('transform panel displays Spine bone rotation as degrees without conversion', () => {
  assert.match(source, /rotation: round\(bone\?\.rotation \|\| 0\)/);
  assert.doesNotMatch(source, /bone\?\.rotation \|\| 0\) \* 180\) \/ Math\.PI/);
});
