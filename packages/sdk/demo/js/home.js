/**
 * 首页逻辑 —— 服务器配置 + 登录 + 连通性检测
 */
import {
  sdk, store, applyBaseUrl, resetSdk,
  $, run, renderJSON, setBadge,
} from './sdk-config.js';

const baseInput = $('#cfg-base');
const statusBadge = $('#cfg-status');
const tokenStatus = $('#cfg-token-status');

// 初始化：回填已存配置 + token 状态
baseInput.value = store.getBaseUrl();
refreshTokenStatus();

function refreshTokenStatus() {
  const t = store.getToken();
  tokenStatus.textContent = t ? `已登录（${t.slice(0, 8)}…）` : '未登录';
  tokenStatus.style.color = t ? 'var(--success)' : 'var(--muted)';
}

// 保存 baseUrl
$('#cfg-save').addEventListener('click', () => {
  const url = baseInput.value.trim().replace(/\/$/, '');
  if (!url) return;
  applyBaseUrl(url);
  resetSdk();
  setBadge(statusBadge, true, '已保存');
  setTimeout(() => (statusBadge.textContent = '未检测', statusBadge.className = 'badge'), 1500);
});

// 测试连通：version.current（noAuth）
$('#cfg-test').addEventListener('click', async (e) => {
  applyBaseUrl(baseInput.value.trim().replace(/\/$/, ''));
  resetSdk();
  await run(e.target, statusBadge, async () => {
    const r = await sdk().version.current();
    setBadge(statusBadge, true, `✓ ${r.version}`);
    return r;
  });
});

// 登录：auth.login(secretKey)
const loginBtn = $('#login-btn');
const loginOut = $('#login-out');
$('#login-btn').addEventListener('click', async (e) => {
  const secret = $('#login-secret').value.trim();
  await run(loginBtn, loginOut, async () => {
    const { token } = await sdk().auth.login(secret);
    store.setToken(token);
    refreshTokenStatus();
    return { token: token.slice(0, 12) + '…', message: '登录成功，token 已保存' };
  });
});

// 校验 token：auth.check
$('#login-check').addEventListener('click', async (e) => {
  await run(e.target, loginOut, async () => {
    const r = await sdk().auth.check();
    return r;
  });
});

// 清除 token
$('#login-clear').addEventListener('click', () => {
  store.setToken(null);
  refreshTokenStatus();
  loginOut.textContent = 'token 已清除';
});
