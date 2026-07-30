import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import Babel from '@babel/standalone';

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
