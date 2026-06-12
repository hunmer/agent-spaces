import test from 'node:test';
import assert from 'node:assert/strict';
import { compileApiJs, buildApiFunctionTools, resolveAgentCredentials, type ApiCtx } from '../src/services/mini-app-agent.js';

test('compileApiJs strips imports and converts export default to method map', () => {
  const code = `
import { something } from 'x';
export default {
  next_music: (_input, ctx) => { ctx.broadcast('miniApp.playerAction', { dir: 'next' }); return { ok: true }; },
  play_track: ({ id }, ctx) => { return { got: id }; },
};
`;
  const methods = compileApiJs(code);
  assert.deepEqual(Object.keys(methods).sort(), ['next_music', 'play_track']);
  assert.equal(typeof methods.next_music, 'function');
});

test('compileApiJs returns empty map on missing/invalid default export', () => {
  assert.deepEqual(compileApiJs('export const x = 1;'), {});
  assert.deepEqual(compileApiJs('not valid js {'), {});
});

test('buildApiFunctionTools wraps each method as an AgentFunctionTool with empty object schema', () => {
  const methods = compileApiJs(`
export default {
  next_music: () => ({ ok: true }),
};
`);
  const ctx: ApiCtx = {
    projectId: 'p1',
    broadcast: () => {},
    callPluginTool: async () => ({ ok: true }),
    readConfig: () => null,
    writeConfig: () => {},
  };
  const tools = buildApiFunctionTools(methods, () => ctx);
  assert.equal(tools.length, 1);
  assert.equal(tools[0].name, 'next_music');
  assert.deepEqual(tools[0].inputSchema, { type: 'object', properties: {} });
  // execute invokes the handler with the ctx
  return tools[0].execute({}).then((r: any) => assert.deepEqual(r, { ok: true }));
});

test('resolveAgentCredentials: agentId resolves preset creds, local fields override', () => {
  const entry: any = {
    agentId: 'preset-1',
    modelId: 'local-model',        // 本地覆盖 preset 的 model
    systemPrompt: 'local persona', // 本地人设为准
  };
  const presets: any[] = [
    {
      id: 'preset-1',
      modelProvider: 'openai-chat-completions',
      modelId: 'preset-model',
      apiKey: 'sk-preset',
      apiBase: 'https://preset',
      systemPrompt: 'preset persona',
    },
  ];
  const resolved = resolveAgentCredentials(entry, presets);
  assert.equal(resolved.modelProvider, 'openai-chat-completions'); // 来自 preset
  assert.equal(resolved.modelId, 'local-model');                   // 本地覆盖
  assert.equal(resolved.apiKey, 'sk-preset');                      // 来自 preset
  assert.equal(resolved.systemPrompt, 'local persona');            // 本地为准
});

test('resolveAgentCredentials: preset missing falls back to local only', () => {
  const entry: any = { agentId: 'nope', modelId: 'm', apiKey: 'sk' };
  const resolved = resolveAgentCredentials(entry, []);
  assert.equal(resolved.modelId, 'm');
  assert.equal(resolved.apiKey, 'sk');
});

test('resolveAgentCredentials: nothing configured → empty (caller falls back to server default)', () => {
  const resolved = resolveAgentCredentials({}, []);
  assert.equal(resolved.modelId, undefined);
  assert.equal(resolved.apiKey, undefined);
});
