import test from 'node:test';
import assert from 'node:assert/strict';
import { NODE_TYPES } from './constants.js';
import {
  DEFAULT_FILE_UPLOAD_TARGET, getFileUploadTargets, resolveFileUploadTarget,
} from './connection-targets.js';

test('edit image exposes both regular image and mask connection targets', () => {
  assert.deepEqual(
    getFileUploadTargets(NODE_TYPES.editImage).map((target) => target.id),
    ['images', 'mask'],
  );
});

test('single-upload nodes and invalid persisted targets fall back to regular images', () => {
  assert.deepEqual(getFileUploadTargets(NODE_TYPES.imageProcess).map((target) => target.id), ['images']);
  assert.equal(resolveFileUploadTarget(NODE_TYPES.editImage, 'unknown'), DEFAULT_FILE_UPLOAD_TARGET);
});
