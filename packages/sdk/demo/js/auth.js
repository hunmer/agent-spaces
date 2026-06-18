/**
 * Auth 演示 —— 登录 / 校验 / 改密
 */
import { sdk, store, $, run, renderJSON, setBadge } from './sdk-config.js';

const badge = $('#badge');
refreshBadge();

function refreshBadge() {
  const t = store.getToken();
  setBadge(badge, !!t, t ? `已登录 ${t.slice(0, 6)}…` : '未登录');
}

// 登录
$('#btn-login').addEventListener('click', (e) =>
  run(e.target, $('#out-login'), async () => {
    const secret = $('#in-secret').value.trim();
    if (!secret) throw new Error('请输入 secret key');
    const { token } = await sdk().auth.login(secret);
    store.setToken(token);
    refreshBadge();
    return { token: token.slice(0, 12) + '…', saved: true };
  }, { onDone: refreshBadge }),
);

// 校验
$('#btn-check').addEventListener('click', (e) =>
  run(e.target, $('#out-login'), async () => {
    const r = await sdk().auth.check();
    setBadge(badge, r.valid, r.valid ? '✓ token 有效' : '✗ token 无效');
    return r;
  }),
);

// 改密
$('#btn-change').addEventListener('click', (e) =>
  run(e.target, $('#out-change'), async () => {
    const newSecret = $('#in-newsecret').value.trim();
    if (!newSecret) throw new Error('请输入新 secret');
    await sdk().auth.changeSecret(newSecret);
    return { message: 'secret 已修改（后续请用新 secret 重新登录）' };
  }),
);
