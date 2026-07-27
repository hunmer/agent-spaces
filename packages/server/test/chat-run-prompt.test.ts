import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChatRuntimePrompt, buildStoredFullPrompt, resolveSessionFileWorkspace } from '../src/routes/chat-run.js';

test('buildStoredFullPrompt keeps system prompt ahead of user prompt', () => {
  assert.equal(
    buildStoredFullPrompt('You are a writing assistant.', 'hello'),
    'You are a writing assistant.\n\nhello',
  );
});

test('buildStoredFullPrompt falls back to prompt when system prompt is empty', () => {
  assert.equal(buildStoredFullPrompt('   ', 'hello'), 'hello');
  assert.equal(buildStoredFullPrompt(undefined, 'hello'), 'hello');
});

test('buildChatRuntimePrompt injects bound workflow context', () => {
  const prompt = buildChatRuntimePrompt({
    workspaceId: 'ws-1',
    systemPrompt: 'You are a writing assistant.',
    userPrompt: 'hello',
    historyMessages: [],
    runtimeKind: 'langchain',
    mcpServers: [],
    skills: [],
    workingDir: 'G:/agent_spaces',
    builtInTools: [{ name: 'execute_bound_workflow_plugin_tool', description: 'run bound workflow plugin tool' }],
    boundWorkflowIds: ['workflow-1'],
    boundWorkflowPluginTools: [{ pluginId: 'plugin-a', toolName: 'tool-b' }],
  });

  assert.match(prompt, /Bound workflow capabilities:/);
  assert.match(prompt, /Bound workflows: workflow-1/);
  assert.match(prompt, /Bound workflow plugin tools: plugin-a:tool-b/);
  assert.match(prompt, /execute_bound_workflow_plugin_tool/);
});

test('resolveSessionFileWorkspace keeps file tools on the agent workspace', () => {
  const agentWorkspace = {
    id: 'chat:agent-1',
    name: 'Chat Agent',
    boundDirs: ['G:/agent_spaces/packages/server/agent-spaces-data/chat/agent-1/workspaces'],
    agentspaceDir: 'G:/agent_spaces/packages/server/agent-spaces-data/chat/agent-1/workspaces',
    createdAt: '',
    updatedAt: '',
    activeChannels: [],
    activeIssues: [],
  };

  assert.deepEqual(resolveSessionFileWorkspace(agentWorkspace, {}), agentWorkspace);
  assert.deepEqual(
    resolveSessionFileWorkspace(agentWorkspace, { editorDirectoryTabs: [{ path: 'G:/extra' }] })?.boundDirs,
    [...agentWorkspace.boundDirs, 'G:/extra'],
  );
});
