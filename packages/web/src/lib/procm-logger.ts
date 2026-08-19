// 浏览器端 procm 结构化日志。
// 构建来源：procm-mcp 仓库 `npm run build:sdk` 产出的 packages/procm-sdk/dist/browser.js，
// 复制到 public/sdk/procm-browser.js（npm 包 @hunmer/procm-mcp-sdk 未发布 browser bundle）。
// 设置 NEXT_PUBLIC_PROCM_ROOM_ID 与 NEXT_PUBLIC_PROCM_WS_URL（如 ws://127.0.0.1:7331/room）后启用，
// 捕获 console 输出为结构化日志并发布到 procm room；未配置时保持原生 console 不变。

type ProcmBrowserModule = {
  createProcmClient: (options: {
    roomId: string;
    url: string;
    clientName: string;
  }) => unknown;
  setupLogger: (options: {
    client: unknown;
    clientName: string;
  }) => { info: (message: string, data?: unknown) => void };
};

const BUNDLE_URL = '/sdk/procm-browser.js';

let initialized = false;
let initPromise: Promise<void> | undefined;

async function setup(): Promise<void> {
  if (typeof window === 'undefined') return;

  const roomId = process.env.NEXT_PUBLIC_PROCM_ROOM_ID;
  const url = process.env.NEXT_PUBLIC_PROCM_WS_URL;
  if (!roomId || !url) return;

  // 运行时从 public 加载 ESM bundle，绕开 webpack 打包（npm 包内无 browser 入口）
  const moduleUrl = BUNDLE_URL;
  const mod = (await import(/* webpackIgnore: true */ moduleUrl)) as unknown as ProcmBrowserModule;
  const clientName = 'web-browser';
  const client = mod.createProcmClient({ roomId, url, clientName });
  const logger = mod.setupLogger({ client, clientName });
  logger.info('[procm] browser logger connected', { roomId });
}

export function initProcmLogger(): Promise<void> {
  if (initialized) return Promise.resolve();
  initialized = true;
  initPromise ??= setup().catch((error) => {
    console.warn('[procm] browser logger init failed', error);
  });
  return initPromise;
}
