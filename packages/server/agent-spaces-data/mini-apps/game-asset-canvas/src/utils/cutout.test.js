import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import Babel from '@babel/standalone';

import { mapWithConcurrency, clampConcurrency } from './concurrency.js';

function loadCutout() {
  const source = fs.readFileSync(new URL('./cutout.js', import.meta.url), 'utf8');
  const { code } = Babel.transform(source, {
    plugins: ['transform-modules-commonjs'],
    sourceType: 'module',
  });
  const exports = {};
  const localRequire = (id) => {
    if (id === './image-ops') return { runProcessor: async () => [] };
    if (id === './constants') return { WORKFLOWS: { image_enchanter: 'default-cutout' } };
    if (id === './workflow') return { normalizeImageUrls: (urls) => urls };
    if (id === './concurrency') return { mapWithConcurrency, clampConcurrency };
    return {};
  };
  new Function('exports', 'require', code)(exports, localRequire);
  return exports;
}

test('workflow cutout accepts the standard images output from runWorkflow', async () => {
  const { runCutout } = loadCutout();
  const calls = [];
  const urls = await runCutout('workflow', ['https://example.com/input.png'], {}, {
    workflowId: 'cutout-workflow',
    runWorkflowFn: async (workflowId, input) => {
      calls.push({ workflowId, input });
      return { images: ['https://example.com/output.png'] };
    },
  });
  assert.deepEqual(urls, ['https://example.com/output.png']);
  assert.deepEqual(calls, [{
    workflowId: 'cutout-workflow',
    input: { image_url: 'https://example.com/input.png', process_type: 'segment' },
  }]);
});

test('workflow cutout accepts image_urls and result output variants', async () => {
  const { runCutout } = loadCutout();
  const outputs = [
    { image_urls: ['https://example.com/a.png'] },
    { result: ['https://example.com/b.png'] },
    { result: 'https://example.com/c.png' },
  ];
  for (const [index, output] of outputs.entries()) {
    const urls = await runCutout('workflow', [`https://example.com/${index}.png`], {}, {
      runWorkflowFn: async () => output,
    });
    assert.equal(urls.length, 1);
  }
});

test('workflow cutout reports returned keys when completed output has no images', async () => {
  const { runCutout } = loadCutout();
  const originalError = console.error;
  console.error = () => {};
  try {
    await assert.rejects(
      runCutout('workflow', ['https://example.com/input.png'], {}, {
        runWorkflowFn: async () => ({ status: 'completed', result: null }),
      }),
      /返回：keys=\[status,result\], result=object/,
    );
  } finally {
    console.error = originalError;
  }
});

test('lumimatte cutout calls lumimatte_matting per image and extracts imageUrl', async () => {
  const { runCutout } = loadCutout();
  const calls = [];
  globalThis.window = {
    AgentSpaces: {
      callPluginTool: async (pluginId, action, args) => {
        calls.push({ pluginId, action, args });
        return {
          success: true,
          message: 'Matting done',
          data: { imageUrl: args.image.replace('/in/', '/out/'), model: 'BiRefNet-General-Matting' },
        };
      },
    },
  };
  try {
    const urls = await runCutout('lumimatte', ['https://example.com/in/1.png', 'https://example.com/in/2.png'], {}, {});
    assert.deepEqual(urls, ['https://example.com/out/1.png', 'https://example.com/out/2.png']);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0], {
      pluginId: 'workflow.lumimatte',
      action: 'lumimatte_matting',
      args: { image: 'https://example.com/in/1.png' },
    });
  } finally {
    delete globalThis.window;
  }
});

test('lumimatte cutout keeps succeeded images and surfaces first error when all fail', async () => {
  const { runCutout } = loadCutout();
  globalThis.window = {
    AgentSpaces: {
      callPluginTool: async (_pluginId, _action, args) => {
        if (args.image.endsWith('bad.png')) throw new Error('LumiMatte HTTP 500: fetch failed');
        return { success: true, data: { imageUrl: args.image.replace('/in/', '/out/') } };
      },
    },
  };
  try {
    const urls = await runCutout('lumimatte', ['https://example.com/in/1.png', 'https://example.com/bad.png'], {}, {});
    assert.deepEqual(urls, ['https://example.com/out/1.png']);

    await assert.rejects(
      runCutout('lumimatte', ['https://example.com/bad.png'], {}, {}),
      /LumiMatte HTTP 500/,
    );
  } finally {
    delete globalThis.window;
  }
});

test('lumimatte cutout caps concurrent plugin calls at concurrency param', async () => {
  const { runCutout } = loadCutout();
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  let inFlight = 0;
  let peak = 0;
  globalThis.window = {
    AgentSpaces: {
      callPluginTool: async (_pluginId, _action, args) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await delay(15);
        inFlight -= 1;
        return { success: true, data: { imageUrl: args.image.replace('/in/', '/out/') } };
      },
    },
  };
  try {
    const items = Array.from({ length: 7 }, (_, i) => `https://example.com/in/${i}.png`);
    const urls = await runCutout('lumimatte', items, { concurrency: 2 }, {});
    assert.equal(urls.length, 7);
    assert.ok(peak <= 2, `并发峰值 ${peak} 超过上限 2`);
    assert.ok(peak === 2, `多图时应达到并发上限（峰值 ${peak}）`);
  } finally {
    delete globalThis.window;
  }
});

test('rembg cutout also respects concurrency param', async () => {
  const { runCutout } = loadCutout();
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  let inFlight = 0;
  let peak = 0;
  globalThis.window = {
    AgentSpaces: {
      callPluginTool: async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await delay(15);
        inFlight -= 1;
        return { success: true, data: { imageUrl: 'https://example.com/out.png' } };
      },
    },
  };
  try {
    const items = Array.from({ length: 6 }, (_, i) => `https://example.com/in/${i}.png`);
    const urls = await runCutout('rembg', items, { concurrency: 3 });
    assert.equal(urls.length, 6);
    assert.ok(peak <= 3, `并发峰值 ${peak} 超过上限 3`);
  } finally {
    delete globalThis.window;
  }
});

test('lumimatte cutout forwards onProgress with done/total', async () => {
  const { runCutout } = loadCutout();
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  globalThis.window = {
    AgentSpaces: {
      callPluginTool: async (_p, _a, args) => {
        await delay(5);
        return { success: true, data: { imageUrl: args.image.replace('/in/', '/out/') } };
      },
    },
  };
  try {
    const events = [];
    const urls = await runCutout(
      'lumimatte',
      Array.from({ length: 4 }, (_, i) => `https://example.com/in/${i}.png`),
      {},
      { onProgress: (done, total) => events.push([done, total]) },
    );
    assert.equal(urls.length, 4);
    assert.deepEqual(events.map((e) => e[0]).sort((a, b) => a - b), [1, 2, 3, 4]);
    assert.ok(events.every((e) => e[1] === 4));
  } finally {
    delete globalThis.window;
  }
});
