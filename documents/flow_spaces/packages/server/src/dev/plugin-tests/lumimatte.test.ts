import assert from 'node:assert/strict';
import type { LoadedPlugin } from '../plugin-test-harness.js';

// LumiMatte 插件集成测试（需 LumiMatte 服务运行在 http://127.0.0.1:8317）
// 覆盖：status / models / export_psd / matting（真实推理，首次加载模型约 10~30s）

type ActionResult = {
  success?: boolean;
  message?: string;
  data?: Record<string, unknown>;
};

export default async function run(plugin: LoadedPlugin) {
  // 1. action 注册齐全
  const actions = plugin.listActions();
  for (const name of [
    'lumimatte_matting',
    'lumimatte_inpaint',
    'lumimatte_super_res',
    'lumimatte_export_psd',
    'lumimatte_status',
    'lumimatte_models',
  ]) {
    assert.ok(actions.includes(name), `missing action: ${name}`);
  }

  // 2. 健康检查（真实 GET /api/system/status）
  const status = (await plugin.runAction('lumimatte_status', {})) as ActionResult;
  assert.equal(status.success, true, `status failed: ${status.message}`);
  assert.equal(status.data?.status, 'ok');
  console.log('status ok:', status.data?.version, status.data?.accel);

  // 3. 模型清单（真实 GET /api/system/models）
  const models = (await plugin.runAction('lumimatte_models', {})) as ActionResult;
  assert.equal(models.success, true, `models failed: ${models.message}`);
  assert.ok(Number(models.data?.count) > 0, 'no offline models listed');
  console.log('models ok:', models.data?.count, 'installed');

  // 4. PSD 导出（真实 POST /api/export/psd，纯 struct 生成，无需模型）
  const psd = (await plugin.runAction('lumimatte_export_psd', {
    width: 320,
    height: 240,
    layers: [
      { name: 'bg' },
      { name: 'subject', top: 10, left: 10, bottom: 230, right: 310, opacity: 0.8 },
    ],
    filename: 'lumimatte_plugin_test.psd',
  })) as ActionResult;
  assert.equal(psd.success, true, `psd failed: ${psd.message}`);
  assert.match(String(psd.data?.fileUrl), /^https?:\/\//);
  assert.equal(psd.data?.layerCount, 2);
  assert.ok(Number(psd.data?.sizeBytes) > 0);
  console.log('psd ok:', psd.data?.fileUrl, psd.data?.sizeBytes, 'bytes');

  // 5. AI 抠图（真实 POST /api/process/matting，首次加载 ISNet 约 10~30s）
  const matting = (await plugin.runAction('lumimatte_matting', {
    image: new URL('./lumimatte-test-input.png', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
  })) as ActionResult;
  assert.equal(matting.success, true, `matting failed: ${matting.message}`);
  assert.match(String(matting.data?.imageUrl), /^https?:\/\//);
  assert.ok(Number(matting.data?.size) > 0);
  console.log('matting ok:', matting.data?.model, matting.data?.durationMs, 'ms');

  return {
    success: true,
    actions,
    status: status.data,
    psd: { fileUrl: psd.data?.fileUrl, sizeBytes: psd.data?.sizeBytes },
    matting: { imageUrl: matting.data?.imageUrl, model: matting.data?.model, durationMs: matting.data?.durationMs },
  };
}
