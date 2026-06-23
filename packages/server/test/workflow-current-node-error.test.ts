import test from 'node:test';
import assert from 'node:assert/strict';
import type { Workflow, WorkflowNode } from '@agent-spaces/shared';
import { ExecutionManager } from '../src/services/execution-manager.js';

function createWorkflow(nodes: WorkflowNode[]): Workflow {
  return {
    id: 'workflow',
    name: 'Workflow',
    folderId: null,
    nodes,
    edges: [{ id: 'start-fail', source: 'start', target: 'fail' }],
    createdAt: 0,
    updatedAt: 0,
  };
}

test('workflow-level resolution errors are attributed to the current node step', async () => {
  const manager = new ExecutionManager({
    emit: () => {},
    interactionManager: {} as never,
    clientNodeManager: {} as never,
  });

  const workflow = createWorkflow([
    { id: 'start', type: 'start', label: 'Start', position: { x: 0, y: 0 }, data: {} },
    {
      id: 'fail',
      type: 'run_code',
      label: 'Fail',
      position: { x: 0, y: 0 },
      data: {
        inputFields: [
          { key: 'text', type: 'string', value: '{{ __data__["missing"].text }}' },
        ],
        code: 'async function main() { return { ok: true }; }',
      },
    },
  ]);

  const result = await manager.execute({
    workflow,
    ownerClientId: 'test',
  });

  assert.equal(result.status, 'error');
  const log = manager.getExecutionRecovery({ workflowId: workflow.id, executionId: result.executionId }, 'test').execution?.log;
  assert.ok(log);
  const failedStep = log?.steps.find(step => step.nodeId === 'fail');
  assert.ok(failedStep);
  assert.equal(failedStep?.status, 'error');
  assert.match(failedStep?.error || '', /missing node output|missing field/i);
});
