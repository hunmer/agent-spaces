import assert from 'node:assert/strict';
import type { LoadedPlugin } from '../plugin-test-harness.js';

// LumiMatte 插件 v1.1 新能力集成测试（需新版服务端运行在 http://127.0.0.1:8318）
// 覆盖：批量 AI 抠图 + export_psd 图层 imageData 真实像素

const CONFIG = { baseUrl: 'http://127.0.0.1:8318' };
const fileUrl = (name: string) =>
  new URL(`./${name}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

type ActionResult = { success?: boolean; message?: string; data?: Record<string, unknown> };

export default async function run(plugin: LoadedPlugin) {
  // 0. 新版服务端就绪
  const status = (await plugin.runAction('lumimatte_status', CONFIG)) as ActionResult;
  assert.equal(status.success, true, `status failed: ${status.message}`);

  // 1. 批量 AI 抠图：2 张输入，全部成功
  const batch = (await plugin.runAction('lumimatte_batch_matting', {
    ...CONFIG,
    images: JSON.stringify([fileUrl('lumimatte-test-input.png'), fileUrl('lumimatte-test-mask.png')]),
  })) as ActionResult;
  assert.equal(batch.success, true, `batch failed: ${batch.message}`);
  const results = (batch.data?.results || []) as Array<Record<string, unknown>>;
  assert.equal(results.length, 2);
  assert.equal(batch.data?.successCount, 2);
  for (const r of results) {
    assert.equal(r.success, true, `batch item failed: ${r.error}`);
    assert.match(String(r.imageUrl), /^https?:\/\//);
  }
  console.log('batch ok:', batch.message);

  // 2. export_psd 图层真实像素：图层数组带 imageData（本地路径），下载产物验证
  const psd = (await plugin.runAction('lumimatte_export_psd', {
    ...CONFIG,
    width: 128,
    height: 96,
    filename: 'lumimatte_v2_test.psd',
    layers: JSON.stringify([
      { name: 'photo-layer', top: 8, left: 8, bottom: 88, right: 120, imageData: fileUrl('lumimatte-test-input.png') },
      { name: 'placeholder-layer', opacity: 0.5 },
    ]),
  })) as ActionResult;
  assert.equal(psd.success, true, `psd failed: ${psd.message}`);
  assert.equal(psd.data?.layerCount, 2);
  assert.match(String(psd.data?.fileUrl), /^https?:\/\//);
  assert.ok(Number(psd.data?.sizeBytes) > 36 * 1024, `psd too small for 128x96 with pixels: ${psd.data?.sizeBytes}`);
  console.log('psd ok:', psd.message, psd.data?.sizeBytes, 'bytes');

  return { success: true, batch: batch.message, psd: { fileUrl: String(psd.data?.fileUrl), sizeBytes: psd.data?.sizeBytes } };
}
