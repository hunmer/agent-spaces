import assert from 'node:assert/strict';
import type { LoadedPlugin } from '../plugin-test-harness.js';

// 1x1 透明 PNG（resolveImage 下载图片时返回）
const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x62, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

type ApiMock = {
  __setScenario(s: { submitResponse?: unknown; pollSequence: unknown[] }): void;
  __saved(): Array<{ ext: string; size: number }>;
};

type FetchRecord = { url: string; method: string; body?: Buffer; contentType?: string };

export default async function run(plugin: LoadedPlugin) {
  const api = plugin.api as ApiMock & Record<string, unknown>;

  // 校验 action 注册
  const actions = plugin.listActions();
  assert.ok(actions.includes('ai_image_generate'), 'should register ai_image_generate');
  assert.ok(actions.includes('ai_image_edit'), 'should register ai_image_edit');
  assert.ok(actions.includes('ai_image_query_task'), 'should register ai_image_query_task');

  // stub setTimeout：让轮询 sleep 立即推进，避免真实等待 5s/轮
  const origSetTimeout = globalThis.setTimeout;
  (globalThis as { setTimeout: unknown }).setTimeout = ((fn: unknown) => {
    if (typeof fn === 'function') (fn as () => void)();
    return 0 as unknown as NodeJS.Timeout;
  }) as unknown as typeof setTimeout;

  // stub globalThis.fetch：edit 的 multipart 提交 + resolveImage 图片下载
  const origFetch = globalThis.fetch;
  const fetchCalls: FetchRecord[] = [];
  (globalThis as { fetch: unknown }).fetch = (async (url: string, opts?: { method?: string; body?: Buffer; headers?: Record<string, string> }) => {
    const u = String(url);
    const method = (opts && opts.method) || 'GET';
    fetchCalls.push({ url: u, method, body: opts && opts.body, contentType: opts && opts.headers && opts.headers['Content-Type'] });
    if (u.includes('/images/edits')) {
      return new Response(JSON.stringify({ task_id: 'task-edit-1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    // 图片下载（resolveImage）
    return new Response(PNG, { status: 200, headers: { 'content-type': 'image/png' } });
  }) as unknown as typeof fetch;

  try {
    // 1) generate 成功：多轮轮询 + URL 结果
    api.__setScenario({
      submitResponse: { task_id: 'task-1' },
      pollSequence: [
        { code: 'success', data: { status: 'NOT_START', progress: '0%', data: null } },
        { code: 'success', data: { status: 'IN_PROGRESS', progress: '50%', data: null } },
        { code: 'success', data: { status: 'SUCCESS', progress: '100%', data: { data: [{ url: 'https://example.com/a.png' }], model: 'gpt-image-2-all', created: 1700 } } },
      ],
    });
    const r1 = (await plugin.runAction('ai_image_generate', { prompt: '测试', model: 'gpt-image-2-all', aspectRatio: '1:1' })) as { success: boolean; data: { taskId: string; images: string[] } };
    assert.equal(r1.success, true);
    assert.equal(r1.data.taskId, 'task-1');
    assert.deepEqual(r1.data.images, ['https://example.com/a.png']);
    console.log('✓ generate (url, multi-poll)');

    // 2) generate 成功：b64_json 结果 → 落盘成 httpPath
    api.__setScenario({
      submitResponse: { task_id: 'task-2' },
      pollSequence: [
        { code: 'success', data: { status: 'SUCCESS', progress: '100%', data: { data: [{ b64_json: 'iVBORw0KGgo=' }], model: 'gpt-image-2-all', created: 1701 } } },
      ],
    });
    const r2 = (await plugin.runAction('ai_image_generate', { prompt: 'b64' })) as { success: boolean; data: { images: string[] } };
    assert.equal(r2.success, true);
    assert.equal(api.__saved().length, 1, 'b64_json should be saved once');
    assert.match(r2.data.images[0], /\/static\/uploads\//);
    console.log('✓ generate (b64 → saved)');

    // 3) edit 成功：multipart 提交 + 轮询
    api.__setScenario({
      submitResponse: { task_id: 'task-edit-1' },
      pollSequence: [
        { code: 'success', data: { status: 'SUCCESS', progress: '100%', data: { data: [{ url: 'https://example.com/edited.png' }], model: 'gpt-image-2-all', created: 1702 } } },
      ],
    });
    const r3 = (await plugin.runAction('ai_image_edit', {
      image: ['https://example.com/in.png'],
      mask: 'https://example.com/mask.png',
      prompt: '戴上墨镜',
      model: 'gpt-image-2-all',
      aspectRatio: '',
    })) as { success: boolean; data: { images: string[] } };
    assert.equal(r3.success, true);
    assert.deepEqual(r3.data.images, ['https://example.com/edited.png']);

    const editCall = fetchCalls.find((c) => c.url.includes('/images/edits'));
    assert.ok(editCall, 'edit should be submitted via fetch');
    assert.ok(editCall!.contentType?.includes('multipart/form-data'), 'edit content-type should be multipart/form-data');
    const editBody = editCall!.body;
    assert.ok(editBody, 'edit body should exist');
    assert.ok(editBody!.includes('name="image"'), 'multipart should contain image field');
    assert.ok(editBody!.includes('name="mask"; filename="mask.png"'), 'URL mask should become a PNG multipart file');
    assert.ok(!editBody!.includes('name="aspect_ratio"'), 'empty aspect ratio should be omitted');
    assert.ok(editBody!.includes('戴上墨镜'), 'multipart should contain prompt');
    console.log('✓ edit (multipart submit)');

    // 4) query SUCCESS
    api.__setScenario({
      submitResponse: {},
      pollSequence: [
        { code: 'success', data: { status: 'SUCCESS', progress: '100%', data: { data: [{ url: 'https://example.com/q.png' }], model: 'gpt-image-2-all', created: 1703 } } },
      ],
    });
    const rq = (await plugin.runAction('ai_image_query_task', { taskId: 'task-q' })) as { data: { status: string; images: string[] } };
    assert.equal(rq.data.status, 'SUCCESS');
    assert.deepEqual(rq.data.images, ['https://example.com/q.png']);
    console.log('✓ query (success)');

    // 5) query IN_PROGRESS（单次查询，不轮询）
    api.__setScenario({
      submitResponse: {},
      pollSequence: [
        { code: 'success', data: { status: 'IN_PROGRESS', progress: '30%', data: null } },
      ],
    });
    const rip = (await plugin.runAction('ai_image_query_task', { taskId: 'task-ip' })) as { data: { status: string; progress: string } };
    assert.equal(rip.data.status, 'IN_PROGRESS');
    assert.equal(rip.data.progress, '30%');
    console.log('✓ query (in-progress)');

    // 6) error: 缺 apiKey
    await assert.rejects(plugin.runAction('ai_image_generate', { prompt: 'x', apiKey: '' }), /apiKey/i);
    console.log('✓ error: missing apiKey');

    // 7) error: 提交无 task_id
    api.__setScenario({ submitResponse: { code: 'error', message: 'bad model' }, pollSequence: [] });
    await assert.rejects(plugin.runAction('ai_image_generate', { prompt: 'x' }), /提交失败/);
    console.log('✓ error: submit without task_id');

    // 8) error: 轮询 FAILURE
    api.__setScenario({
      submitResponse: { task_id: 'task-f' },
      pollSequence: [
        { code: 'success', data: { status: 'FAILURE', fail_reason: 'content policy', data: null } },
      ],
    });
    await assert.rejects(plugin.runAction('ai_image_generate', { prompt: 'x' }), /失败|policy/);
    console.log('✓ error: poll FAILURE');

    return { success: true, cases: 8, fetchCalls: fetchCalls.length };
  } finally {
    (globalThis as { setTimeout: unknown }).setTimeout = origSetTimeout;
    globalThis.fetch = origFetch;
  }
}
