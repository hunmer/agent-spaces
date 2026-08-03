import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const compactNodeSources = [
  '../components/nodes/NodeShell.jsx',
  '../components/nodes/ImageDisplayNode.jsx',
  '../components/nodes/NoteNode.jsx',
].map((path) => readFileSync(new URL(path, import.meta.url), 'utf8'));

test('all compact node renderers retain a visible selected style', () => {
  for (const source of compactNodeSources) {
    assert.match(source, /selected[\s\S]*?border-primary ring-4 ring-primary\/70/);
  }
});

test('note nodes receive the React Flow selected prop', () => {
  assert.match(compactNodeSources[2], /function NoteNode\(\{ id, data, selected \}\)/);
});
