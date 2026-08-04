import assert from 'node:assert/strict';
import test from 'node:test';
import type { WorkflowEdge } from '@agent-spaces/shared';
import { countsTowardTargetConnectionLimit } from './workflow-edge-capacity';
import { remapPastedNodeData } from '../../hooks/workflow-clipboard';

test('generated runtime reference edges do not occupy the default target handle', () => {
  const referenceRuntimeEdge: WorkflowEdge = {
    id: 'edge-source-target--reference-runtime',
    source: 'source',
    target: 'target',
    edgeKind: 'runtime',
    composite: { generated: true, hidden: false, locked: false },
  };

  assert.equal(countsTowardTargetConnectionLimit(referenceRuntimeEdge), false);
  assert.equal(countsTowardTargetConnectionLimit({
    ...referenceRuntimeEdge,
    id: 'edge-source-target',
    composite: undefined,
  }), true);
});

test('pasted node data remaps internal references and clears external references', () => {
  const data = remapPastedNodeData({
    prompt: 'Use {{ __data__["copied-source"].result }}',
    fallback: '{{ __data__["external-source"].result }}',
  }, new Map([['copied-source', 'new-source']]));

  assert.equal(data.prompt, 'Use {{ __data__["new-source"].result }}');
  assert.equal(data.fallback, '');
});
