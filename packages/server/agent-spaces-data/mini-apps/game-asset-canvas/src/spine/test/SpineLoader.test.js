import assert from 'node:assert/strict';
import test from 'node:test';

import { getJsonSpineVersion } from '../loaders/SpineLoader.js';

test('reads Spine 4.2 version before choosing a runtime', () => {
  assert.equal(getJsonSpineVersion('{"skeleton":{"spine":"4.2.43"}}'), '4.2.43');
});

test('returns an empty version when Spine JSON omits the version', () => {
  assert.equal(getJsonSpineVersion('{"skeleton":{}}'), '');
});

test('rejects malformed Spine JSON', () => {
  assert.throws(() => getJsonSpineVersion('{'), /Spine JSON 格式无效/);
});
