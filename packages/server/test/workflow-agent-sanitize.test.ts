import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as workflowService from '../src/services/workflow.js';

test('createWorkflow sanitizes agent_run agent JSON string into object', (t) => {
  const previousDataDir = process.env.AGENT_SPACES_DATA_DIR;
  const dataDir = mkdtempSync(join(tmpdir(), 'agent-spaces-workflow-agent-'));
  process.env.AGENT_SPACES_DATA_DIR = dataDir;
  t.after(() => {
    if (previousDataDir === undefined) delete process.env.AGENT_SPACES_DATA_DIR;
    else process.env.AGENT_SPACES_DATA_DIR = previousDataDir;
    rmSync(dataDir, { recursive: true, force: true });
  });

  const workflow = workflowService.createWorkflow({
    name: 'agent sanitize',
    nodes: [{
      id: 'node-1',
      type: 'agent_run',
      label: 'Agent',
      position: { x: 0, y: 0 },
      data: {
        agent: JSON.stringify({
          id: 'agent-1',
          name: 'Agent One',
          role: 'agent',
          enabled: true,
          systemPrompt: 'hello',
        }),
        prompt: 'go',
      },
    }],
    edges: [],
  });

  assert.deepEqual(workflow.nodes[0].data.agent, {
    id: 'agent-1',
    name: 'Agent One',
    role: 'agent',
    description: undefined,
    runtimeKind: undefined,
    modelProvider: undefined,
    providerId: undefined,
    modelId: undefined,
    apiBase: undefined,
    apiKey: undefined,
    workingDir: undefined,
    mcps: undefined,
    skills: undefined,
    tools: undefined,
    systemPrompt: 'hello',
    outputStyle: undefined,
    temperature: undefined,
    maxTokens: undefined,
    sandboxDirs: undefined,
    avatarUrl: undefined,
    icon: undefined,
    enabled: true,
  });
});
