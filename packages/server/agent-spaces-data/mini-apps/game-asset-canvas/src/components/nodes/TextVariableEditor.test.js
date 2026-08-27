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
const hostStyles = fs.readFileSync(path.resolve(process.cwd(), 'packages/web/src/app/globals.css'), 'utf8');
const promptNodeSources = ['TextToImageNode.jsx', 'TextToVoiceNode.jsx', 'VideoGeneratorNode.jsx']
  .map((file) => fs.readFileSync(new URL(`./${file}`, import.meta.url), 'utf8'));

test('TextVariableEditor bridges canvas bindings, fallback values, and edge deletion', () => {
  assert.match(localSource, /textVariableBindings/);
  assert.match(localSource, /textVariableValues/);
  assert.match(localSource, /displayValue/);
  assert.match(localSource, /outputSuggestions=\{data\?\.textOutputSuggestions \|\| \[\]\}/);
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
  assert.doesNotMatch(hostSource, /delegate\(view\.dom/);
  assert.match(hostSource, /trigger: 'manual'/);
  assert.match(hostSource, /view\.dom\.addEventListener\('mouseover'/);
  assert.match(hostSource, /getReferenceClientRect:/);
  assert.match(hostSource, /data-variable-display/);
  assert.match(hostStyles, /\.prompt-variable-token\[data-variable-display\]::after/);
  assert.match(hostSource, /interactive: true/);
  assert.match(hostSource, /instance\.popperInstance\?\.update\(\)/);
  assert.doesNotMatch(hostSource, /DEBUG-prompt-variable-hover/);
  assert.doesNotMatch(hostSource, /handleDOMEvents:[\s\S]*click:/);
});

test('prompt editors are not nested in implicit labels that activate the prompt library button', () => {
  for (const source of promptNodeSources) {
    assert.doesNotMatch(source, /<label className="flex flex-col gap-1">[\s\S]{0,900}📋 提示词库[\s\S]{0,500}<TextVariableEditor/);
  }
});
