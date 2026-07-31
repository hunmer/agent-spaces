import test from 'node:test';
import assert from 'node:assert/strict';
import { NODE_TYPES } from './constants.js';
import {
  CONNECTION_INPUT_TYPES, DEFAULT_FILE_UPLOAD_TARGET, getConnectionTargets,
  getFileUploadTargets, getTextInputTargets, resolveFileUploadTarget,
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

test('text products discover text fields from the target node schema', () => {
  const schema = [
    { key: 'prompt', label: '提示词', type: 'text', description: '生成内容' },
    { key: 'model', label: '模型', type: 'select' },
    { key: 'fileName', label: '文件名', type: 'text' },
  ];

  assert.deepEqual(getTextInputTargets(schema).map((target) => target.id), ['prompt', 'fileName']);
  assert.deepEqual(getConnectionTargets(NODE_TYPES.text, NODE_TYPES.textToImage, schema), {
    inputType: CONNECTION_INPUT_TYPES.text,
    targets: [
      { id: 'prompt', label: '提示词', description: '生成内容' },
      { id: 'fileName', label: '文件名', description: '写入「文件名」文本输入' },
    ],
  });
});

test('reverse-prompt nodes use text targets while image products keep upload targets', () => {
  const schema = [{ key: 'prompt', label: '提示词', type: 'text' }];
  assert.equal(
    getConnectionTargets(NODE_TYPES.promptReverse, NODE_TYPES.textToImage, schema).inputType,
    CONNECTION_INPUT_TYPES.text,
  );
  assert.deepEqual(
    getConnectionTargets(NODE_TYPES.textToImage, NODE_TYPES.editImage, schema),
    {
      inputType: CONNECTION_INPUT_TYPES.image,
      targets: getFileUploadTargets(NODE_TYPES.editImage),
    },
  );
});
