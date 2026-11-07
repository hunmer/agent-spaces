/**
 * Version 演示 —— 连通性探针 + 版本检查
 */
import { sdk, $, run, setBadge } from './sdk-config.js';

const out = $('#out');
const badge = $('#badge');

// 获取版本（noAuth）—— 进入页面自动跑一次探活
$('#btn-current').addEventListener('click', (e) =>
  run(e.target, out, () => sdk().version.current(), {
    onDone: (r) => setBadge(badge, true, `✓ ${r.version}`),
  }),
);

// 检查更新
$('#btn-check').addEventListener('click', (e) =>
  run(e.target, out, () => sdk().version.check()),
);

// 触发更新
$('#btn-update').addEventListener('click', (e) =>
  run(e.target, out, () => sdk().version.triggerUpdate()),
);

// 页面载入即探活一次
window.addEventListener('load', async () => {
  try {
    const r = await sdk().version.current();
    setBadge(badge, true, `✓ ${r.version}`);
    out.textContent = `服务器在线 ✓\nversion: ${r.version}\nbaseUrl: ${sdk().http.baseUrl}`;
  } catch {
    setBadge(badge, false, '未连通');
    out.textContent = '未能连接服务器，请检查 baseUrl 与 HTTP 打开方式。';
    out.classList.add('output--error');
  }
});
