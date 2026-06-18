/**
 * SDK 初始化桥接 — 将 web 的 auth/server 配置注入 SDK
 *
 * 使用方式：
 *   import { sdk } from '@/lib/sdk';
 *   const workspaces = await sdk.workspace.list();
 */

import { createSDK } from '@agent-spaces/sdk';
import type { SDK } from '@agent-spaces/sdk';
import { getToken, removeToken } from './auth';
import { getActiveServerUrl } from './server';
import { isLoginPath, loginHrefWithRef } from './routes';
import { toStaticHref } from './navigate';

let _sdk: SDK | null = null;

function createWebSDK(): SDK {
  return createSDK({
    baseUrl: getActiveServerUrl() ?? 'http://localhost:3100',
    getToken,
    onUnauthorized: () => {
      removeToken();
      if (typeof window !== 'undefined' && !isLoginPath(window.location.pathname)) {
        window.location.replace(toStaticHref(loginHrefWithRef()));
      }
    },
    debug: typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug'),
  });
}

/**
 * 获取 SDK 单例
 *
 * 每次调用 getActiveServerUrl() 获取最新 baseUrl，
 * 因为用户可能切换了服务器。
 */
export function getSDK(): SDK {
  if (!_sdk) {
    _sdk = createWebSDK();
  }
  // 每次都同步 baseUrl（用户可能切换了服务器）
  _sdk.updateConfig({ baseUrl: getActiveServerUrl() ?? 'http://localhost:3100' });
  return _sdk;
}

/** 全局快捷引用 */
export const sdk = new Proxy({} as SDK, {
  get(_target, prop) {
    return (getSDK() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
