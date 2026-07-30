import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import Babel from '@babel/standalone';

function loadPipeline({ generateImages = async () => [] } = {}) {
  const source = fs.readFileSync(new URL('./reskinPipeline.js', import.meta.url), 'utf8');
  const { code } = Babel.transform(`${source}\nexport { uploadDataUrl as __testUploadDataUrl, resolveReskinnedImage as __testResolveReskinnedImage };`, {
    plugins: ['transform-modules-commonjs'],
    sourceType: 'module',
  });
  const exports = {};
  const localRequire = (id) => {
    if (id === '../workflow') {
      return {
        generateImages,
        normalizeImageUrl: (url) => (
          String(url).startsWith('/') ? `http://127.0.0.1:3000${url}` : url
        ),
      };
    }
    return {};
  };
  new Function('exports', 'require', code)(exports, localRequire);
  return exports;
}

test('uploadDataUrl returns an absolute URL for plugin image inputs', async () => {
  const { __testUploadDataUrl: uploadDataUrl } = loadPipeline();
  const previousWindow = globalThis.window;
  const previousFetch = globalThis.fetch;
  const previousFile = globalThis.File;
  globalThis.window = {
    location: { origin: 'http://127.0.0.1:3000' },
    AgentSpaces: {
      uploadFile: async () => ({ url: '/static/uploads/region.png' }),
    },
  };
  globalThis.fetch = async () => ({
    blob: async () => new Blob(['png'], { type: 'image/png' }),
  });
  globalThis.File = class TestFile extends Blob {
    constructor(parts, name, options) {
      super(parts, options);
      this.name = name;
    }
  };

  try {
    assert.equal(
      await uploadDataUrl('data:image/png;base64,cG5n', 'region.png'),
      'http://127.0.0.1:3000/static/uploads/region.png',
    );
  } finally {
    globalThis.window = previousWindow;
    globalThis.fetch = previousFetch;
    globalThis.File = previousFile;
  }
});

test('resolveReskinnedImage reuses an existing image without generating again', async () => {
  let generateCalls = 0;
  let callbackCalls = 0;
  const { __testResolveReskinnedImage: resolveReskinnedImage } = loadPipeline({
    generateImages: async () => { generateCalls += 1; return []; },
  });

  const result = await resolveReskinnedImage({
    generatedImageUrl: 'https://example.com/generated.png',
    compositeCanvas: { toDataURL: () => { throw new Error('must not upload'); } },
    log: () => {},
    onGeneratedImage: () => { callbackCalls += 1; },
  });

  assert.deepEqual(result, {
    url: 'https://example.com/generated.png',
    durationMs: 0,
    reused: true,
  });
  assert.equal(generateCalls, 0);
  assert.equal(callbackCalls, 0);
});

test('resolveReskinnedImage reports a newly generated image before segmentation', async () => {
  let generatedInput;
  let callbackUrl;
  const { __testResolveReskinnedImage: resolveReskinnedImage } = loadPipeline({
    generateImages: async (_workflowId, input) => {
      generatedInput = input;
      return ['https://example.com/generated.png'];
    },
  });
  const previousWindow = globalThis.window;
  const previousFetch = globalThis.fetch;
  const previousFile = globalThis.File;
  globalThis.window = {
    location: { origin: 'http://127.0.0.1:3000' },
    AgentSpaces: {
      uploadFile: async () => ({ url: '/static/uploads/composite.png' }),
    },
  };
  globalThis.fetch = async () => ({
    blob: async () => new Blob(['png'], { type: 'image/png' }),
  });
  globalThis.File = class TestFile extends Blob {
    constructor(parts, name, options) {
      super(parts, options);
      this.name = name;
    }
  };

  try {
    const result = await resolveReskinnedImage({
      compositeCanvas: { width: 160, height: 90, toDataURL: () => 'data:image/png;base64,cG5n' },
      skinName: 'violet',
      prompt: 'purple hair',
      workflowId: 'edit-image',
      model: 'image-model',
      size: '2k',
      log: () => {},
      onGeneratedImage: (url) => { callbackUrl = url; },
    });

    assert.equal(result.url, 'https://example.com/generated.png');
    assert.equal(result.reused, false);
    assert.equal(callbackUrl, 'https://example.com/generated.png');
    assert.deepEqual(generatedInput.images, ['http://127.0.0.1:3000/static/uploads/composite.png']);
  } finally {
    globalThis.window = previousWindow;
    globalThis.fetch = previousFetch;
    globalThis.File = previousFile;
  }
});

test('samBoxPrompt uses full-image bbox coordinates', () => {
  const { samBoxPrompt } = loadPipeline();
  assert.deepEqual(
    samBoxPrompt({ x: 10.4, y: 20.6, w: 30.2, h: 40.1 }),
    { type: 'box', data: [10, 21, 41, 61], label: 1 },
  );
});
