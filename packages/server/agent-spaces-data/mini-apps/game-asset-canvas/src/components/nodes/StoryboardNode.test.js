import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('./StoryboardNode.jsx', import.meta.url), 'utf8');
const rightPanel = fs.readFileSync(new URL('../right-panel/index.jsx', import.meta.url), 'utf8');
const characterSource = fs.readFileSync(new URL('../right-panel/CharactersTab.jsx', import.meta.url), 'utf8');
const dialogSource = fs.readFileSync(new URL('../StoryboardGenerationDialog.jsx', import.meta.url), 'utf8');
const operationSource = fs.readFileSync(new URL('../../hooks/useStoryboardOperations.js', import.meta.url), 'utf8');
const connectionDialogSource = fs.readFileSync(new URL('../ConnectionTargetDialog.jsx', import.meta.url), 'utf8');
const canvasSource = fs.readFileSync(new URL('../Canvas.jsx', import.meta.url), 'utf8');
const canvasOverlaySource = fs.readFileSync(new URL('../canvas/CanvasOverlayDialogs.jsx', import.meta.url), 'utf8');
const rendererSource = fs.readFileSync(new URL('../../../../../../../web/src/components/mini-apps/react-renderer.tsx', import.meta.url), 'utf8');

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

test('storyboard exposes one top settings button with four generation tabs and labels all scene fields', () => {
  assert.match(source, /aria-label="生成参数设置"/);
  assert.match(source, /setSettingsOpen\(true\)/);
  for (const [value, label] of [['textToImage', '文生图'], ['editImage', '图生图'], ['video', '视频'], ['voice', '配音']]) {
    assert.match(dialogSource, new RegExp(`<TabsTrigger value="${value}">${label}<\\/TabsTrigger>`));
  }
  for (const label of ['旁白 / 台词', '画面提示词', '动画提示词']) {
    assert.match(source, new RegExp(`<SceneField label="${label.replace('/', '\\/')}"`));
  }
  assert.match(source, /saveGenerationSettings/);
  assert.doesNotMatch(source, /<PresetButton/);
});

test('scene generation resolves saved presets and selects image mode from references', () => {
  assert.match(operationSource, /resolveStoryboardGenerationParams/);
  assert.match(operationSource, /referenceImages\.length \? presets\.editImage : presets\.textToImage/);
  assert.match(operationSource, /const preset = presets\.video/);
  assert.match(operationSource, /const preset = presets\.voice/);
});

test('scene media stays on the scene card instead of creating canvas display nodes', () => {
  assert.match(source, /<SceneMedia scene=\{scene\}/);
  assert.match(source, /scene\.images/);
  assert.match(source, /scene\.videos/);
  assert.match(source, /scene\.audios/);
  assert.doesNotMatch(operationSource, /addImageNodesFromUrls|addVideoNodesFromUrls|addAudioNodesFromUrls/);
});

test('scene images use host Masonry with natural image aspects', () => {
  assert.match(source, /<Masonry/);
  assert.match(source, /columns=\{3\}/);
  assert.match(source, /naturalWidth/);
  assert.match(source, /naturalHeight/);
  assert.match(source, /<SceneImageMasonry images=\{images\}/);
  assert.doesNotMatch(source, /grid grid-cols-4 gap-1\.5/);
});

test('storyboard renders a left thumbnail navigator that scrolls to scene refs', () => {
  assert.match(source, /aria-label="分镜导航"/);
  assert.match(source, /sceneRefs = useRef\(new Map\(\)\)/);
  assert.match(source, /scrollIntoView\(\{ behavior: 'smooth', block: 'start', inline: 'nearest' \}\)/);
  assert.match(source, /const firstImage = Array\.isArray\(scene\.images\)/);
  assert.match(source, /firstImage \? <img[\s\S]*: index \+ 1/);
  assert.match(source, /data-storyboard-scene-id=\{scene\.id\}/);
});

test('scene roles render as an avatar group and are edited through a checkbox picker', () => {
  assert.match(source, /<AvatarGroup/);
  assert.match(source, /setRolePickerSceneId\(scene\.id\)/);
  assert.match(source, /<Checkbox checked=\{checked\}/);
  assert.match(source, /characterImage\(character\)/);
  assert.doesNotMatch(source, /characters\.map\(\(character\) => \{ const active/);
});

test('storyboard renders one right-side source handle per scene', () => {
  assert.match(source, /aria-label="分镜输出 Handle"/);
  assert.match(source, /sceneOutputs\.map\(\(\{ scene, index, assets \}\)/);
  assert.match(source, /id=\{createStoryboardSceneHandleId\(scene\.id\)\}/);
  assert.match(source, /position=\{Position\.Right\}/);
  assert.match(source, /isConnectable=\{assets\.length > 0\}/);
  assert.match(source, /useUpdateNodeInternals/);
  assert.equal(Array.from(rendererSource.matchAll(/useUpdateNodeInternals/g)).length, 2);
});

test('storyboard output handles live outside NodeShell overflow boundaries', () => {
  assert.match(source, /<div className="relative h-full w-full overflow-visible">[\s\S]*<NodeShell/);
  assert.match(source, /<\/NodeShell>[\s\S]*aria-label="分镜输出 Handle"/);
  assert.match(source, /position: 'absolute', left: 'calc\(100% \+ 10px\)'/);
});

test('connection dialog selects multi-assets before showing compatible targets', () => {
  assert.match(connectionDialogSource, /assets\.length > 1/);
  assert.match(connectionDialogSource, /先选择该分镜中的一个素材/);
  assert.match(connectionDialogSource, /needsAssetSelection && !selectedAsset\s*\? \[\]/);
  assert.match(connectionDialogSource, /targetsByInputType\[activeInputType\]/);
  assert.match(connectionDialogSource, /onSelect\?\.\(target\.id, selectedAsset \|\| null, activeInputType, undefined\)/);
  assert.match(connectionDialogSource, /selectedTargetId === target\.id/);
  assert.match(connectionDialogSource, /替换整个字段/);
  assert.match(connectionDialogSource, /activeInputType, variable\)/);
});

test('canvas persists the selected storyboard asset on the edge', () => {
  assert.match(canvasSource, /BackgroundVariant, MarkerType, addEdge/);
  assert.match(canvasSource, /resolveStoryboardHandleAssets\(sourceNode, conn\.sourceHandle\)/);
  assert.match(canvasSource, /getConnectionTargetsByInputType/);
  assert.match(canvasSource, /\.\.\.\(sourceAsset \? \{ sourceAsset \} : \{\}\)/);
  assert.match(canvasOverlaySource, /pendingConnection\?\.assets \|\| \[\]/);
  assert.match(canvasSource, /inputVariable/);
});
