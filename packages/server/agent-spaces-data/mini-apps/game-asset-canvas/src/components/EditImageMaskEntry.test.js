import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const editNodeSource = fs.readFileSync(new URL('./nodes/EditImageNode.jsx', import.meta.url), 'utf8');
const fileUploadSource = fs.readFileSync(new URL('./FileUpload.jsx', import.meta.url), 'utf8');

test('Edit Image thumbnails open mask painting and save the exported mask', () => {
  const uploadTriggerIndex = fileUploadSource.indexOf('data-upload-trigger');
  const thumbnailMapIndex = fileUploadSource.indexOf('displayItems.map((item, i)');
  assert.ok(uploadTriggerIndex >= 0 && uploadTriggerIndex < thumbnailMapIndex);
  assert.equal(fileUploadSource.match(/data-upload-trigger/g)?.length, 1);
  assert.match(fileUploadSource, /onEditItem\?\.\(item\.src\)/);
  assert.match(fileUploadSource, /title="蒙版绘制"/);
  assert.match(fileUploadSource, /\.game-asset-upload-thumb-actions \{[\s\S]*opacity: 0;[\s\S]*pointer-events: none;/);
  assert.match(fileUploadSource, /\.game-asset-upload-thumb-actions \{[\s\S]*position: absolute;[\s\S]*left: 50%;[\s\S]*bottom: 2px;[\s\S]*transform: translateX\(-50%\);[\s\S]*display: flex;/);
  assert.match(fileUploadSource, /\.game-asset-upload-thumb-action \{[\s\S]*width: 20px;[\s\S]*height: 20px;/);
  assert.match(fileUploadSource, /\.game-asset-upload-thumb:hover \.game-asset-upload-thumb-actions,[\s\S]*opacity: 1;[\s\S]*pointer-events: auto;/);
  assert.doesNotMatch(fileUploadSource, /\[DEBUG-mask-actions\]/);
  assert.match(fileUploadSource, /<Trash2 className="h-3 w-3"/);
  assert.match(editNodeSource, /onEditItem=\{setMaskPaintSource\}/);
  assert.match(editNodeSource, /inputImages=\{maskPaintSource \? \[maskPaintSource\] : \[\]\}/);
  assert.match(editNodeSource, /onSave=\{setMaskImage\}/);
  assert.match(editNodeSource, /editMaskPaintData/);
  assert.match(editNodeSource, /placeholder="上传蒙版图片（白色=编辑区域）"[\s\S]*bottomActions/);
});

test('Edit Image stores rich editor content only in params.prompt', () => {
  assert.doesNotMatch(editNodeSource, /promptHtml/);
  assert.match(editNodeSource, /const prompt = storedParams\.prompt \|\| ''/);
  assert.match(editNodeSource, /<TextVariableEditor[\s\S]*field="prompt"[\s\S]*resolvedValue=\{params\.prompt \|\| ''\}[\s\S]*valueFormat="html"/);
  assert.match(editNodeSource, /editPromptToText\(params\.prompt \|\| ''\)/);
  assert.match(editNodeSource, /onChange=\{\(html\) => set\(\{ prompt: html \}\)\}/);
  assert.match(editNodeSource, /set\(\{ prompt: newPrompt \}\)/);
});

test('Edit Image serializes reference mentions as one-based hash keys', () => {
  assert.match(editNodeSource, /key: `#\$\{i \+ 1\}`/);
  assert.match(editNodeSource, /\^R\(\\d\+\)\$[\s\S]*`#\$\{Number\(match\[1\]\) \+ 1\}`/);
  assert.doesNotMatch(editNodeSource, /key: `R\$\{i\}`/);
});
