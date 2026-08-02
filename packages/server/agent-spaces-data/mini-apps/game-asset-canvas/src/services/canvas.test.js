import assert from 'node:assert/strict';
import test from 'node:test';
import canvasService from './canvas.js';

function createConfigContext(initial = null) {
  let value = initial;
  let path = '';
  return {
    ctx: {
      updateConfig(nextPath, update) {
        path = nextPath;
        value = update(value);
        return value;
      },
    },
    read: () => ({ path, value }),
  };
}

function createContext() {
  const configs = new Map();
  return {
    configs,
    readConfig: (path) => configs.get(path),
    writeConfig: (path, value) => configs.set(path, value),
    updateConfig: (path, updater) => configs.set(path, updater(configs.get(path))),
  };
}

test('Spine reskin history is isolated by asset signature and replaces the same skin name', () => {
  const state = createConfigContext();
  canvasService.save_spine_reskin_history({
    assetSignature: 'spine-a', item: { id: '1', name: 'dark', assets: { pngUrl: '/a.png' } },
  }, state.ctx);
  canvasService.save_spine_reskin_history({
    assetSignature: 'spine-a', item: { id: '2', name: 'dark', assets: { pngUrl: '/b.png' } },
  }, state.ctx);
  canvasService.save_spine_reskin_history({
    assetSignature: 'spine-b', item: { id: '3', name: 'gold' },
  }, state.ctx);

  const { path, value } = state.read();
  assert.equal(path, 'spine-reskin-history.json');
  assert.deepEqual(value['spine-a'].map((item) => item.id), ['2']);
  assert.deepEqual(value['spine-b'].map((item) => item.id), ['3']);
});

test('Spine reskin history deletion only changes the selected asset', () => {
  const state = createConfigContext({
    a: [{ id: '1' }, { id: '2' }],
    b: [{ id: '1' }],
  });
  canvasService.delete_spine_reskin_history({ assetSignature: 'a', id: '1' }, state.ctx);
  assert.deepEqual(state.read().value, {
    a: [{ id: '2' }],
    b: [{ id: '1' }],
  });
});

test('save_generation_history replaces the workspace list without duplicating entries', () => {
  const ctx = createContext();
  canvasService.save_generation_history({
    workspaceId: 'ws-1',
    history: [{ id: 'hist-1', images: ['full.png'], resources: [{ url: 'full.png', thumb: 'thumb.jpg' }] }],
  }, ctx);

  assert.deepEqual(ctx.configs.get('workspaces/ws-1/generation-history.json'), [
    { id: 'hist-1', images: ['full.png'], resources: [{ url: 'full.png', thumb: 'thumb.jpg' }] },
  ]);
});

test('save_asset_library preserves thumbnail metadata', () => {
  const ctx = createContext();
  canvasService.save_asset_library({
    workspaceId: 'ws-1',
    lib: {
      categories: [{
        id: 'cat-1',
        name: '角色',
        assets: [{ id: 'asset-1', url: 'full.png', thumb: 'thumb.jpg', name: 'hero.png' }],
      }],
    },
  }, ctx);

  const asset = ctx.configs.get('workspaces/ws-1/asset-library.json').categories[0].assets[0];
  assert.equal(asset.url, 'full.png');
  assert.equal(asset.thumb, 'thumb.jpg');
});
