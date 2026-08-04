import test from 'node:test';
import assert from 'node:assert/strict';
import { NODE_TYPES } from './constants.js';
import {
  CONNECTION_INPUT_TYPES, DEFAULT_FILE_UPLOAD_TARGET, getConnectionTargets,
  getConnectionTargetsByInputType, getConnectionTargetsForInputType,
  extractTemplateVariables, getFileUploadTargets, getTextInputTargets,
  resolveFileUploadTarget, withTextTargetVariables,
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

test('text targets expose unique template variables from plain text or html values', () => {
  assert.deepEqual(
    extractTemplateVariables('<p>让 {角色} 使用 {武器}，保持 {角色}</p>'),
    ['角色', '武器'],
  );
  assert.deepEqual(extractTemplateVariables('忽略 {two words} 和 {}'), []);
  assert.deepEqual(withTextTargetVariables(
    [{ id: 'prompt', label: '提示词' }, { id: 'fileName', label: '文件名' }],
    { prompt: '生成 {subject}', fileName: 'hero.png' },
  ), [
    { id: 'prompt', label: '提示词', variables: ['subject'] },
    { id: 'fileName', label: '文件名', variables: [] },
  ]);
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

test('media display nodes expose media-specific connection targets', () => {
  assert.deepEqual(getConnectionTargets(NODE_TYPES.videoDisplay, NODE_TYPES.videoEditor), {
    inputType: CONNECTION_INPUT_TYPES.video,
    targets: [{ id: 'videos', label: '输入视频', description: '作为节点的视频输入' }],
  });
  assert.deepEqual(getConnectionTargets(NODE_TYPES.audioDisplay, NODE_TYPES.audioDisplay), {
    inputType: CONNECTION_INPUT_TYPES.audio,
    targets: [{ id: 'audios', label: '输入音频', description: '作为节点的音频输入' }],
  });
});

test('explicit storyboard asset types only expose compatible target inputs', () => {
  assert.deepEqual(
    getConnectionTargetsForInputType(CONNECTION_INPUT_TYPES.video, NODE_TYPES.editImage),
    { inputType: CONNECTION_INPUT_TYPES.video, targets: [] },
  );
  assert.deepEqual(
    getConnectionTargetsForInputType(CONNECTION_INPUT_TYPES.image, NODE_TYPES.videoGenerator),
    { inputType: CONNECTION_INPUT_TYPES.image, targets: getFileUploadTargets(NODE_TYPES.videoGenerator) },
  );
  assert.deepEqual(
    getConnectionTargets(NODE_TYPES.storyboard, NODE_TYPES.videoEditor, [], CONNECTION_INPUT_TYPES.video),
    {
      inputType: CONNECTION_INPUT_TYPES.video,
      targets: [{ id: 'videos', label: '输入视频', description: '作为节点的视频输入' }],
    },
  );
  assert.deepEqual(
    getConnectionTargetsByInputType(['image', 'video', 'audio', 'video'], NODE_TYPES.videoGenerator),
    {
      image: getFileUploadTargets(NODE_TYPES.videoGenerator),
      video: [{ id: 'videos', label: '输入视频', description: '作为节点的视频输入' }],
      audio: [],
    },
  );
});
