import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const localSource = fs.readFileSync(new URL('./TextVariableEditor.jsx', import.meta.url), 'utf8');
const decoratedSource = fs.readFileSync(new URL('../../hooks/useDecoratedNodes.js', import.meta.url), 'utf8');
const hostSource = fs.readFileSync(
  path.resolve(process.cwd(), 'packages/web/src/components/common/editors/prompt-text-editor.tsx'),
  'utf8',
);

test('TextVariableEditor bridges canvas bindings, fallback values, and edge deletion', () => {
  assert.match(localSource, /textVariableBindings/);
  assert.match(localSource, /textVariableValues/);
  assert.match(localSource, /onVariableValueChange=\{handleVariableValueChange\}/);
  assert.match(localSource, /onVariableDisconnect=\{data\?\.onDeleteEdge\}/);
  assert.match(decoratedSource, /computeTextVariableBindings/);
  assert.match(decoratedSource, /onDeleteEdge/);
});

test('host PromptTextEditor decorates variable tokens and opens an interactive hover card', () => {
  assert.match(hostSource, /Decoration\.inline/);
  assert.match(hostSource, /data-prompt-variable/);
  assert.match(hostSource, /PromptVariablePopover/);
  assert.match(hostSource, /onVariableDisconnect/);
  assert.match(hostSource, /valueFormat\?: 'html' \| 'text'/);
  assert.match(hostSource, /delegate\(view\.dom/);
  assert.match(hostSource, /trigger: 'mouseenter focus'/);
  assert.match(hostSource, /interactive: true/);
  assert.match(hostSource, /createStableReferenceClientRect\(instance\.reference\)/);
  assert.match(hostSource, /reference\.isConnected \? reference\.getBoundingClientRect\(\) : snapshot/);
  assert.match(hostSource, /instance\.popperInstance\?\.update\(\)/);
  assert.doesNotMatch(hostSource, /handleDOMEvents:[\s\S]*click:/);
});
