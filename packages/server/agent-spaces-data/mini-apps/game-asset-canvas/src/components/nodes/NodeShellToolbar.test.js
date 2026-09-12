import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const shellSource = fs.readFileSync(new URL('./NodeShell.jsx', import.meta.url), 'utf8');
const decorationSource = fs.readFileSync(
  new URL('../../hooks/useDecoratedNodes.js', import.meta.url),
  'utf8',
);
const handlesSource = fs.readFileSync(new URL('./NodeHandles.jsx', import.meta.url), 'utf8');
const menuSource = fs.readFileSync(new URL('./NodeHoverMenu.jsx', import.meta.url), 'utf8');
const toolbarSource = fs.readFileSync(new URL('../Toolbar.jsx', import.meta.url), 'utf8');
const textToVoiceSource = fs.readFileSync(new URL('./TextToVoiceNode.jsx', import.meta.url), 'utf8');
const canvasSource = fs.readFileSync(new URL('../Canvas.jsx', import.meta.url), 'utf8');

test('node actions appear in a vertical top-right menu on node hover', () => {
  assert.doesNotMatch(shellSource, /<NodeToolbar/);
  assert.match(shellSource, /toolbarHovered \|\| nodeMenuOpen/);
  assert.match(shellSource, /<NodeHoverMenu[\s\S]*actions=\{menuActions\}/);
  assert.match(menuSource, /absolute right-2 top-2[\s\S]*flex flex-col/);
  assert.match(menuSource, /<MoreVertical className="h-3\.5 w-3\.5" \/>/);
  assert.match(menuSource, /aria-label="运行节点"/);
  assert.match(menuSource, /aria-label="删除节点"/);
  // 菜单弹层用宿主 DropdownMenu；action.children 渲染为 hover 展开的 SubMenu
  assert.doesNotMatch(menuSource, /<Popover/);
  assert.match(menuSource, /<DropdownMenu open=\{open\} onOpenChange=\{onOpenChange\}/);
  assert.match(menuSource, /<DropdownMenuSub[\s\S]*<DropdownMenuSubTrigger/);
  assert.match(shellSource, /onRun=\{onRun \|\| data\?\.onRunNode\}/);
  assert.match(shellSource, /onDelete=\{data\?\.onDeleteNode\}/);
  assert.match(canvasSource, /onRunNode: handleRunNode/);
  assert.match(canvasSource, /onDeleteNode: handleDeleteNodeWithHistoryCheck/);
  assert.match(shellSource, /label: '复制节点信息'/);
  assert.match(shellSource, /navigator\.clipboard\.writeText\(nodeJson\)/);
  assert.match(decorationSource, /nodeJson: JSON\.stringify\(nd, null, 2\)/);
});

test('depth extract nodes receive the execution callback', () => {
  assert.match(decorationSource, /onCutout, onCutoutCreate, onDepth, onCancelProcess/);
  assert.match(decorationSource, /onCutoutCreate,\n\s+onDepth,\n\s+onCancelProcess/);
});

test('unrestricted nodes render two blue inputs and two green outputs', () => {
  assert.equal((handlesSource.match(/type="target"/g) || []).length, 2);
  assert.equal((handlesSource.match(/type="source"/g) || []).length, 2);
  assert.match(handlesSource, /INPUT_COLOR = '#3b82f6'/);
  assert.match(handlesSource, /OUTPUT_COLOR = '#10b981'/);
  assert.match(handlesSource, /id="target-top"[\s\S]*left: '50%'/);
  assert.match(handlesSource, /id="source-bottom"[\s\S]*left: '50%'/);
  assert.match(handlesSource, /type="target"[\s\S]*position=\{Position\.Left\}[\s\S]*type="source"[\s\S]*position=\{Position\.Right\}/);
  assert.match(textToVoiceSource, /<NodeShell[^>]*targetHandle sourceHandle onRun=\{handleRun\}>/);
});

test('bottom output handle is rendered after the external NodeOutput content', () => {
  const outputIndex = shellSource.lastIndexOf('<NodeOutput');
  const bottomHandleIndex = shellSource.lastIndexOf('<NodeHandles sourceBottom');
  assert.ok(outputIndex > 0);
  assert.ok(bottomHandleIndex > outputIndex);
  assert.match(shellSource, /observer\.observe\(output\)/);
  assert.match(shellSource, /updateNodeInternals\(id\)/);
});

test('restored loading nodes render the running placeholder on first mount', () => {
  assert.match(shellSource, /const status = data\?\.status \|\| \(data\?\.loading \? 'running' : 'idle'\)/);
});

test('running placeholders do not overwrite the persisted node size', () => {
  assert.match(shellSource, /if \(status === 'running' \|\| !viewportActivated/);
  assert.match(shellSource, /\}, \[status, viewportActivated, data\?\.onAutoSizeToContent/);
  assert.match(shellSource, /isRunning \? '100%' : 'fit-content'/);
  assert.match(shellSource, /<Skeleton className="absolute inset-0 h-full w-full rounded-none opacity-70" \/>/);
  assert.match(shellSource, /data-node-card className=\{`mx-auto h-full w-full/);
});

test('node header renders icon beside title and subtitle', () => {
  assert.match(shellSource, /aria-hidden="true"[\s\S]*\{meta\.icon\}/);
  assert.match(shellSource, /<EditableNodeTitle[\s\S]*\{data\?\.subtitle \|\| meta\.subtitle \|\| '画布节点'\}/);
});

test('canvas menu no longer exposes a handle position switch', () => {
  assert.doesNotMatch(toolbarSource, /Handle 位置|attributionPosition|handlePosition/);
  assert.doesNotMatch(decorationSource, /floatingHandlePosition|attributionPosition/);
});
