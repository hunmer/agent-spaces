import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

test('createWorkflow filters unsupported mcps, skills, and tools from agent_run agent config by preset', (t) => {
  const previousDataDir = process.env.AGENT_SPACES_DATA_DIR;
  const dataDir = mkdtempSync(join(tmpdir(), 'agent-spaces-workflow-agent-cap-'));
  process.env.AGENT_SPACES_DATA_DIR = dataDir;
  t.after(() => {
    if (previousDataDir === undefined) delete process.env.AGENT_SPACES_DATA_DIR;
    else process.env.AGENT_SPACES_DATA_DIR = previousDataDir;
    rmSync(dataDir, { recursive: true, force: true });
  });

  const presetDir = join(dataDir, 'agent-templates', 'research-agent');
  mkdirSync(presetDir, { recursive: true });
  writeFileSync(join(presetDir, 'agent.json'), JSON.stringify({
    id: 'research-agent',
    name: 'Research Agent',
    role: 'agent',
    enabled: true,
    mcps: {
      mcpServers: {
        filesystem: {},
      },
    },
    skills: ['research'],
    tools: ['ReadWorkspaceFile'],
  }), 'utf-8');

  const workflow = workflowService.createWorkflow({
    name: 'agent capability sanitize',
    nodes: [{
      id: 'node-1',
      type: 'agent_run',
      label: 'Agent',
      position: { x: 0, y: 0 },
      data: {
        agent: {
          id: 'research-agent',
          name: 'Research Agent',
          role: 'agent',
          enabled: true,
          mcps: {
            mcpServers: {
              filesystem: {},
              github: {},
            },
          },
          skills: ['research', 'writer'],
          tools: ['ReadWorkspaceFile', 'DeleteWorkspacePath', 'NotARealTool'],
        },
        prompt: 'go',
      },
    }],
    edges: [],
  });

  assert.deepEqual(workflow.nodes[0].data.agent, {
    id: 'research-agent',
    name: 'Research Agent',
    role: 'agent',
    description: undefined,
    runtimeKind: undefined,
    modelProvider: undefined,
    providerId: undefined,
    modelId: undefined,
    apiBase: undefined,
    apiKey: undefined,
    workingDir: undefined,
    mcps: {
      mcpServers: {
        filesystem: {},
      },
    },
    skills: ['research'],
    tools: ['ReadWorkspaceFile'],
    systemPrompt: undefined,
    outputStyle: undefined,
    temperature: undefined,
    maxTokens: undefined,
    sandboxDirs: undefined,
    avatarUrl: undefined,
    icon: undefined,
    enabled: true,
  });
});
