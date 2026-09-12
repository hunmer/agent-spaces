import assert from 'node:assert/strict';
import type { LoadedPlugin } from '../plugin-test-harness.js';

// LumiMatte inpaint / super-res 集成测试（需服务运行在 http://127.0.0.1:8317）
// 首次调用需加载 LaMa / Real-ESRGAN 模型（约 10~30s）

const fileUrl = (name: string) =>
  new URL(`./${name}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

type ActionResult = { success?: boolean; message?: string; data?: Record<string, unknown> };

export default async function run(plugin: LoadedPlugin) {
  // 1. 智能局部消除（真实 POST /api/process/inpaint）
  const inpaint = (await plugin.runAction('lumimatte_inpaint', {
    image: fileUrl('lumimatte-test-input.png'),
    mask: fileUrl('lumimatte-test-mask.png'),
  })) as ActionResult;
  assert.equal(inpaint.success, true, `inpaint failed: ${inpaint.message}`);
  assert.match(String(inpaint.data?.imageUrl), /^https?:\/\//);
  console.log('inpaint ok:', inpaint.data?.model, inpaint.data?.durationMs, 'ms');

  // 2. 画质超分（真实 POST /api/process/super-res，2x）
  const superRes = (await plugin.runAction('lumimatte_super_res', {
    image: fileUrl('lumimatte-test-input.png'),
    scale: 2,
  })) as ActionResult;
  assert.equal(superRes.success, true, `super-res failed: ${superRes.message}`);
  assert.match(String(superRes.data?.imageUrl), /^https?:\/\//);
  assert.equal(superRes.data?.model != null, true);
  console.log('super-res ok:', superRes.data?.model, superRes.data?.durationMs, 'ms');

  return {
    success: true,
    inpaint: { imageUrl: inpaint.data?.imageUrl, model: inpaint.data?.model, durationMs: inpaint.data?.durationMs },
    superRes: { imageUrl: superRes.data?.imageUrl, model: superRes.data?.model, durationMs: superRes.data?.durationMs },
  };
}
