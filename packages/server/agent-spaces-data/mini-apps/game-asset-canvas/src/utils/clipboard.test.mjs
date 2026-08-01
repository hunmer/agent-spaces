import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('./clipboard.js', import.meta.url), 'utf8');
const { applyClipboardProperties, canApplyClipboardProperties, getClipboardProperties } = await import(
  `data:text/javascript,${encodeURIComponent(source)}`
);

const copied = {
  type: 'textToImage',
  data: { label: '来源', params: { prompt: 'hero', size: '2k' }, output: { images: ['old.png'] } },
};
assert.equal(canApplyClipboardProperties(copied, [{ type: 'textToImage' }, { type: 'textToImage' }]), true);
assert.equal(canApplyClipboardProperties(copied, [{ type: 'editImage' }]), false);
assert.equal(canApplyClipboardProperties(copied, []), false);
assert.deepEqual(
  getClipboardProperties(copied, [{ key: 'prompt', label: '提示词' }]),
  [
    { path: 'params.prompt', label: '提示词' },
    { path: 'params.size', label: 'size' },
    { path: 'label', label: 'label' },
  ],
);
assert.deepEqual(
  applyClipboardProperties(
    { label: '目标', params: { prompt: 'old', model: 'keep' } },
    copied.data,
    ['params.prompt', 'label'],
  ),
  { label: '来源', params: { prompt: 'hero', model: 'keep' } },
);
