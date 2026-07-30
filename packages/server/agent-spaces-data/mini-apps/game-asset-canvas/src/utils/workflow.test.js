import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import Babel from '@babel/standalone';

function loadWorkflowModule() {
  const source = fs.readFileSync(new URL('./workflow.js', import.meta.url), 'utf8');
  const { code } = Babel.transform(source, {
    plugins: ['transform-modules-commonjs'],
    sourceType: 'module',
  });
  const exports = {};
  const localRequire = (id) => {
    if (id === './constants') {
      return { BUILTIN_PLUGIN: '@agent-spaces/builtin', EXEC_TOOL: 'execute_workflow_sync' };
    }
    if (id === './image-ops/cdn') return { getImageCompression: async () => null };
    throw new Error(`Unexpected import: ${id}`);
  };
  new Function('exports', 'require', code)(exports, localRequire);
  return exports;
}

test('runWorkflow rejects failed executions before extracting stale input images', async () => {
  const { runWorkflow } = loadWorkflowModule();
  const previousWindow = globalThis.window;
  globalThis.window = {
    AgentSpaces: {
      callPluginTool: async () => ({
        success: true,
        result: {
          status: 'error',
          timedOut: false,
          steps: [
            {
              nodeType: 'start',
              status: 'completed',
              output: { images: ['/static/uploads/composite.png'] },
            },
            {
              nodeType: 'upload',
              status: 'error',
              error: 'upload failed',
            },
          ],
        },
      }),
    },
  };

  try {
    await assert.rejects(
      runWorkflow('edit-image', { images: ['/static/uploads/composite.png'] }),
      /upload failed/,
    );
  } finally {
    globalThis.window = previousWindow;
  }
});

test('generateImages normalizes relative input images before workflow execution', async () => {
  const { generateImages } = loadWorkflowModule();
  const previousWindow = globalThis.window;
  let receivedArgs;
  globalThis.window = {
    location: { origin: 'http://localhost:3000' },
    AgentSpaces: {
      downloadImage: async (url) => ({ httpUrl: url }),
      callPluginTool: async (_plugin, _tool, args) => {
        receivedArgs = args;
        return {
          success: true,
          result: {
            status: 'completed',
            timedOut: false,
            steps: [{
              nodeType: 'end',
              status: 'completed',
              output: { images: ['/static/uploads/generated.png'] },
            }],
          },
        };
      },
    },
  };

  try {
    await generateImages('edit-image', {
      images: ['/static/uploads/composite.png'],
      prompt: 'reskin',
    });
    assert.deepEqual(receivedArgs.input.images, [
      'http://localhost:3000/static/uploads/composite.png',
    ]);
  } finally {
    globalThis.window = previousWindow;
  }
});
