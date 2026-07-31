import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const textNode = fs.readFileSync(new URL('./nodes/TextNode.jsx', import.meta.url), 'utf8');
const promptReverse = fs.readFileSync(new URL('./nodes/PromptReverseNode.jsx', import.meta.url), 'utf8');
const nodeShell = fs.readFileSync(new URL('./nodes/NodeShell.jsx', import.meta.url), 'utf8');
const nodeOutput = fs.readFileSync(new URL('./nodes/NodeOutput.jsx', import.meta.url), 'utf8');

test('text node edits Markdown directly into its text product', () => {
  assert.match(textNode, /MarkdownEditor contentMarkdown=\{text\} onChange=\{handleChange\}/);
  assert.match(textNode, /output: \{ \.\.\.\(data\?\.output \|\| \{\}\), text: nextText \}/);
  assert.match(textNode, /sourceHandle/);
});

test('reverse-prompt text renders through the external node output', () => {
  assert.doesNotMatch(promptReverse, /提示词结果|<pre/);
  assert.match(nodeShell, /nodeType === NODE_TYPES\.promptReverse/);
  assert.match(nodeOutput, /<TextResult text=\{text\} onClear=\{onClearText\}/);
});
