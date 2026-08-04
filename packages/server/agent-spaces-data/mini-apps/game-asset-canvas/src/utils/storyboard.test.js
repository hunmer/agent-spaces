import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeImportedStoryboard, parseStoryboardJson, reorderStoryboardScenes, runStoryboardAgent } from './storyboard.js';

test('parseStoryboardJson accepts fenced agent output', () => {
  const parsed = parseStoryboardJson('说明\n```json\n{"characters":[],"scenes":[]}\n```');
  assert.deepEqual(parsed, { characters: [], scenes: [] });
});

test('normalizeImportedStoryboard merges characters by name and maps scene references', () => {
  const existing = [{ id: 'char-a', name: '阿青', prompt: '已有描述', images: [{ id: 'img-a', url: 'a.png', selected: true }] }];
  const result = normalizeImportedStoryboard({
    characters: [
      { name: '阿青', prompt: '新描述' },
      { name: '白鹤', prompt: 'white crane' },
    ],
    scenes: [{ index: 2, narration: '出发', visualPrompt: '山谷', animationPrompt: '镜头推进', characterNames: ['阿青', '白鹤'] }],
  }, existing);

  assert.equal(result.characters.length, 2);
  assert.equal(result.characters[0].prompt, '已有描述');
  assert.equal(result.characters[0].images[0].url, 'a.png');
  assert.equal(result.scenes[0].index, 2);
  assert.deepEqual(result.scenes[0].characterIds, ['char-a', result.characters[1].id]);
  assert.deepEqual(result.scenes[0].images, []);
  assert.deepEqual(result.scenes[0].videos, []);
  assert.deepEqual(result.scenes[0].audios, []);
});

test('runStoryboardAgent uses the configured preset and sends the source copy', async () => {
  const calls = [];
  global.window = {
    AgentSpaces: {
      async callPluginTool(_plugin, tool, args) {
        calls.push({ tool, args });
        return { result: { result: '{"characters":[],"scenes":[]}' } };
      },
    },
  };
  try {
    await runStoryboardAgent('一个人在雨中行走', 'preset-1');
    const runCall = calls.find((call) => call.tool === 'agent_run');
    assert.equal(runCall.args.agentConfigId, 'preset-1');
    assert.match(runCall.args.prompt, /一个人在雨中行走/);
    assert.doesNotMatch(runCall.args.prompt, /角色名必须前后一致/);
    assert.equal('systemPrompt' in runCall.args, false);
  } finally {
    delete global.window;
  }
});

test('runStoryboardAgent requires the globally configured Agent id', async () => {
  await assert.rejects(() => runStoryboardAgent('测试文案', ''), /画布设置中配置分镜创作 Agent/);
});

test('reorderStoryboardScenes moves by id and normalizes indexes', () => {
  const scenes = [{ id: 'a', index: 7 }, { id: 'b', index: 3 }, { id: 'c', index: 9 }];
  assert.deepEqual(reorderStoryboardScenes(scenes, 'c', 'a').map((scene) => [scene.id, scene.index]), [
    ['c', 1], ['a', 2], ['b', 3],
  ]);
  assert.equal(reorderStoryboardScenes(scenes, 'missing', 'a'), scenes);
});
