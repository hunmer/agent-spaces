import { createLogger, createProcmClient, type Logger, type ProcmClient } from '@hunmer/procm-mcp-sdk';

// 兼容 npm @hunmer/procm-mcp-sdk@0.1.0（尚无 setupLoggerFromEnv/captureConsole）：
// 行为对齐新版 setupLoggerFromEnv —— PROCM_ROOM_ID/PROCM_WS_URL 存在时自动连 room，
// 并捕获全局 console 输出结构化帧；SDK 发布新版后可直接替换为 setupLoggerFromEnv。
export function setupProcmLogger(clientName: string): Logger {
  let client: ProcmClient | undefined;
  if (process.env.PROCM_ROOM_ID && process.env.PROCM_WS_URL) {
    try {
      client = createProcmClient({ clientName });
    } catch { /* 连接失败时仅保留结构化控制台输出 */ }
  }
  // 旧版 Logger 持有 console 对象本身（动态查找方法），必须传入绑定原始方法的 sink，
  // 否则下方 captureConsole 替换 console.* 后会无限递归。
  const nativeConsole = {
    debug: console.debug.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };
  const logger = createLogger({ client, clientName, console: nativeConsole });
  captureConsole(logger);
  return logger;
}

function captureConsole(logger: Logger): void {
  console.debug = (...args: unknown[]) => logger.debug(formatConsoleArgs(args));
  console.info = (...args: unknown[]) => logger.info(formatConsoleArgs(args));
  console.log = (...args: unknown[]) => logger.info(formatConsoleArgs(args));
  console.warn = (...args: unknown[]) => logger.warn(formatConsoleArgs(args));
  console.error = (...args: unknown[]) => logger.error(formatConsoleArgs(args));
  console.trace = (...args: unknown[]) => logger.debug(formatConsoleArgs(args));
}

function formatConsoleArgs(args: unknown[]): string {
  return args.map((arg) => {
    if (arg instanceof Error) return arg.stack ?? `${arg.name}: ${arg.message}`;
    if (typeof arg === 'object' && arg !== null) {
      try { return JSON.stringify(arg); } catch { return String(arg); }
    }
    return String(arg);
  }).join(' ');
}
