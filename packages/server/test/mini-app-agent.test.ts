import test from 'node:test';
import assert from 'node:assert/strict';
import { compileApiJs, buildApiFunctionTools, type ApiCtx } from '../src/services/mini-app-agent.js';

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
