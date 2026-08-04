import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('./StoryboardNode.jsx', import.meta.url), 'utf8');
const rightPanel = fs.readFileSync(new URL('../right-panel/index.jsx', import.meta.url), 'utf8');
const characterSource = fs.readFileSync(new URL('../right-panel/CharactersTab.jsx', import.meta.url), 'utf8');
const dialogSource = fs.readFileSync(new URL('../StoryboardGenerationDialog.jsx', import.meta.url), 'utf8');
const operationSource = fs.readFileSync(new URL('../../hooks/useStoryboardOperations.js', import.meta.url), 'utf8');

test('storyboard form keeps AI import collapsed behind its entry button', () => {
  assert.match(source, /setAiOpen/);
  assert.match(source, /\{aiOpen && \(/);
  assert.doesNotMatch(source, /Agent 预设 ID/);
});

test('storyboard opens character management in a dialog and supports drag sorting', () => {
  assert.match(source, /<CharactersTab/);
  assert.match(source, /<Dialog open=\{charactersOpen\}/);
  assert.match(source, /setCharactersOpen\(true\)/);
  assert.match(source, /<GripVertical/);
  assert.match(source, /reorderStoryboardScenes/);
  assert.doesNotMatch(rightPanel, /value="characters"/);
});

test('character generation opens a two-tab image generation dialog', () => {
  assert.match(characterSource, /setGenerateOpen\(true\)/);
  assert.match(characterSource, /<CharacterImageGenerationDialog/);
  assert.match(dialogSource, /<TabsTrigger value="textToImage">文生图<\/TabsTrigger>/);
  assert.match(dialogSource, /<TabsTrigger value="editImage">图生图<\/TabsTrigger>/);
  assert.match(dialogSource, /referenceImages/);
});

test('storyboard exposes four persisted generation presets and labels all scene fields', () => {
  for (const label of ['文生图', '图生图', '生成视频', '生成配音']) {
    assert.match(source, new RegExp(`label="${label}"`));
  }
  for (const label of ['旁白 / 台词', '画面提示词', '动画提示词']) {
    assert.match(source, new RegExp(`<SceneField label="${label.replace('/', '\\/')}"`));
  }
  assert.match(source, /mergeStoryboardGenerationPreset/);
  assert.doesNotMatch(source, /<details/);
});

test('scene generation resolves saved presets and selects image mode from references', () => {
  assert.match(operationSource, /resolveStoryboardGenerationParams/);
  assert.match(operationSource, /referenceImages\.length \? presets\.editImage : presets\.textToImage/);
  assert.match(operationSource, /const preset = presets\.video/);
  assert.match(operationSource, /const preset = presets\.voice/);
});
