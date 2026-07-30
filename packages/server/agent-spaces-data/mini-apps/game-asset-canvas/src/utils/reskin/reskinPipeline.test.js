import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import Babel from '@babel/standalone';

function loadUploadDataUrl() {
  const source = fs.readFileSync(new URL('./reskinPipeline.js', import.meta.url), 'utf8');
  const { code } = Babel.transform(`${source}\nexport { uploadDataUrl as __testUploadDataUrl };`, {
    plugins: ['transform-modules-commonjs'],
    sourceType: 'module',
  });
  const exports = {};
  const localRequire = (id) => {
    if (id === '../workflow') {
      return {
        generateImages: async () => [],
        normalizeImageUrl: (url) => (
          String(url).startsWith('/') ? `http://127.0.0.1:3000${url}` : url
        ),
      };
    }
    return {};
  };
  new Function('exports', 'require', code)(exports, localRequire);
  return exports.__testUploadDataUrl;
}

test('uploadDataUrl returns an absolute URL for plugin image inputs', async () => {
  const uploadDataUrl = loadUploadDataUrl();
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
