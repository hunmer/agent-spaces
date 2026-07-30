import assert from 'node:assert/strict';
import test from 'node:test';

import { hasReskinLogImageOutput } from './reskinLogData.js';

test('keeps only reskin log events with image outputs', () => {
  assert.equal(hasReskinLogImageOutput({ done: 2, total: 18 }), false);
  assert.equal(hasReskinLogImageOutput({ error: true }), false);
  assert.equal(hasReskinLogImageOutput({ imageFlow: { inputs: [{ src: 'input.png' }] } }), false);
  assert.equal(hasReskinLogImageOutput({ imageFlow: { outputs: [{ src: 'output.png' }] } }), true);
  assert.equal(hasReskinLogImageOutput({ images: [{ url: 'atlas.png' }] }), true);
});
