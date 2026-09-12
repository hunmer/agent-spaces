// enhance 处理器引擎分流单测：cloud（image_enchanter 工作流） / lumimatte（插件超分）。
// mock window.AgentSpaces.callPluginTool 与 runWorkflowFn，验证调用参数、产出提取与部分失败容错。
// image-ops/index.js 的内部 import 无扩展名（bundler 风格），与 cutout.test.js 同款 Babel 加载。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import Babel from '@babel/standalone';

import { mapWithConcurrency, clampConcurrency } from '../concurrency.js';

function loadImageOps() {
  const source = fs.readFileSync(new URL('./index.js', import.meta.url), 'utf8');
  const { code } = Babel.transform(source, {
    plugins: ['transform-modules-commonjs'],
    sourceType: 'module',
  });
  const exports = {};
  // enhance 路径只用 ctx/urls 与 window.AgentSpaces，算法子模块 mock 为空即可
  const localRequire = (id) => {
    if (id === '../concurrency') return { mapWithConcurrency, clampConcurrency };
    return {};
  };
  new Function('exports', 'require', code)(exports, localRequire);
  return exports;
}

function setupHost(plugins) {
  const calls = [];
  globalThis.window = {
    AgentSpaces: {
      callPluginTool: async (pluginId, action, args, opts) => {
        calls.push({ pluginId, action, args, opts });
        const impl = plugins[`${pluginId}:${action}`];
        if (!impl) throw new Error(`unexpected tool ${pluginId}:${action}`);
        return impl(args);
      },
    },
  };
  return calls;
}

test.afterEach(() => { delete globalThis.window; });

test('enhance defaults to cloud workflow when engine missing (legacy nodes)', async () => {
  const { runProcessor } = loadImageOps();
  const wfCalls = [];
  const urls = await runProcessor('enhance', ['http://a.png'], {}, {
    workflowId: 'wf-1',
    runWorkflowFn: async (wfId, input) => {
      wfCalls.push({ wfId, input });
      return { urls: ['http://out.png'] };
    },
  });
  assert.deepEqual(urls, ['http://out.png']);
  assert.equal(wfCalls.length, 1);
  assert.equal(wfCalls[0].wfId, 'wf-1');
  assert.equal(wfCalls[0].input.process_type, 'enhance');
});

test('enhance lumimatte engine calls lumimatte_super_res with parsed params', async () => {
  const { runProcessor } = loadImageOps();
  const calls = setupHost({
    'workflow.lumimatte:lumimatte_super_res': (args) => ({
      success: true, message: 'ok',
      data: { imageUrl: `http://out-${args.scale}x.png`, model: 'Real-ESRGAN-Compact-v2' },
    }),
  });
  const urls = await runProcessor('enhance', ['http://a.png'], {
    engine: 'lumimatte', scale: '4', denoiseLevel: '0.3', faceEnhance: false, tileSize: '128',
  }, {});
  assert.deepEqual(urls, ['http://out-4x.png']);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].pluginId, 'workflow.lumimatte');
  assert.equal(calls[0].action, 'lumimatte_super_res');
  // scale 字符串 '4' → 数字 4；denoiseLevel/tileSize 转数字；faceEnhance false 透传
  assert.equal(calls[0].args.scale, 4);
  assert.equal(calls[0].args.denoiseLevel, 0.3);
  assert.equal(calls[0].args.tileSize, 128);
  assert.equal(calls[0].args.faceEnhance, false);
  assert.equal(calls[0].args.image, 'http://a.png');
});

test('enhance lumimatte defaults scale to 2 and omits unset numeric params', async () => {
  const { runProcessor } = loadImageOps();
  const calls = setupHost({
    'workflow.lumimatte:lumimatte_super_res': (args) => ({
      success: true, data: { imageUrl: 'http://out.png' },
    }),
  });
  await runProcessor('enhance', ['http://a.png'], { engine: 'lumimatte' }, {});
  const args = calls[0].args;
  assert.equal(args.scale, 2);
  assert.equal('denoiseLevel' in args, false);
  assert.equal('tileSize' in args, false);
  // faceEnhance 未设置 → 不传，由插件侧默认开启
  assert.equal('faceEnhance' in args, false);
});

test('enhance lumimatte batch keeps succeeded images when some fail', async () => {
  const { runProcessor } = loadImageOps();
  setupHost({
    'workflow.lumimatte:lumimatte_super_res': (args) => {
      if (args.image.endsWith('bad.png')) throw new Error('boom');
      return { success: true, data: { imageUrl: args.image.replace('in', 'out') } };
    },
  });
  const urls = await runProcessor('enhance', ['http://in-1.png', 'http://bad.png'], { engine: 'lumimatte' }, {});
  assert.deepEqual(urls, ['http://out-1.png']);
});

test('enhance lumimatte throws with first error when all images fail', async () => {
  const { runProcessor } = loadImageOps();
  setupHost({
    'workflow.lumimatte:lumimatte_super_res': () => { throw new Error('LumiMatte HTTP 500'); },
  });
  await assert.rejects(
    () => runProcessor('enhance', ['http://a.png'], { engine: 'lumimatte' }, {}),
    /LumiMatte HTTP 500/,
  );
});

test('enhance lumimatte reports failure when plugin returns no imageUrl', async () => {
  const { runProcessor } = loadImageOps();
  setupHost({
    'workflow.lumimatte:lumimatte_super_res': () => ({ success: false, message: 'fetch failed' }),
  });
  await assert.rejects(
    () => runProcessor('enhance', ['http://a.png'], { engine: 'lumimatte' }, {}),
    /fetch failed/,
  );
});

test('enhance lumimatte caps concurrent plugin calls at concurrency param', async () => {
  const { runProcessor } = loadImageOps();
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  let inFlight = 0;
  let peak = 0;
  setupHost({
    'workflow.lumimatte:lumimatte_super_res': async (args) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await delay(15);
      inFlight -= 1;
      return { success: true, data: { imageUrl: args.image.replace('/in/', '/out/') } };
    },
  });
  const items = Array.from({ length: 7 }, (_, i) => `http://in-${i}.png`);
  const urls = await runProcessor('enhance', items, { engine: 'lumimatte', concurrency: 2 }, {});
  assert.equal(urls.length, 7);
  assert.ok(peak <= 2, `并发峰值 ${peak} 超过上限 2`);
  assert.ok(peak === 2, `多图时应达到并发上限（峰值 ${peak}）`);
});

test('enhance cloud engine stays unlimited (legacy behavior)', async () => {
  const { runProcessor } = loadImageOps();
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  let inFlight = 0;
  let peak = 0;
  const items = Array.from({ length: 6 }, (_, i) => `http://in-${i}.png`);
  await runProcessor('enhance', items, {}, {
    workflowId: 'wf-1',
    runWorkflowFn: async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await delay(10);
      inFlight -= 1;
      return { urls: ['http://out.png'] };
    },
  });
  assert.equal(peak, items.length, 'cloud 引擎应保持不限并发');
});

test('enhance lumimatte engine forwards ctx.onProgress', async () => {
  const { runProcessor } = loadImageOps();
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  setupHost({
    'workflow.lumimatte:lumimatte_super_res': async (args) => {
      await delay(5);
      return { success: true, data: { imageUrl: args.image.replace('/in/', '/out/') } };
    },
  });
  const events = [];
  const items = Array.from({ length: 5 }, (_, i) => `http://in-${i}.png`);
  const urls = await runProcessor('enhance', items, { engine: 'lumimatte' }, {
    onProgress: (done, total) => events.push([done, total]),
  });
  assert.equal(urls.length, 5);
  assert.deepEqual(events.map((e) => e[0]).sort((a, b) => a - b), [1, 2, 3, 4, 5]);
  assert.ok(events.every((e) => e[1] === 5));
});
