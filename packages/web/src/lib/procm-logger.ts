// 浏览器 console -> Web custom server -> 当前 Web 进程 stdout。
// 这样日志归属托管 Web 进程，可直接在 dashboard 的 LogPanel 中查看，
// 不会创建独立的 room 成员或改变 room 消息语义。

let initialized = false;
let relaySuccessLogged = false;
const levels = ['debug', 'info', 'log', 'warn', 'error'] as const;

function serializeArg(arg: unknown): unknown {
  if (arg instanceof Error) return { __type: 'Error', name: arg.name, message: arg.message, stack: arg.stack };
  if (arg === undefined) return null;
  if (typeof arg !== 'object' || arg === null) return arg;
  try { return JSON.parse(JSON.stringify(arg)); } catch { return String(arg); }
}

export function initProcmLogger(): Promise<void> {
  if (initialized || typeof window === 'undefined') return Promise.resolve();
  initialized = true;
  for (const level of levels) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      original(...args);
      // api-polyfill rewrites relative /api URLs to the backend (3100). Use
      // the current Web origin so this is handled by server.mjs (3000).
      void fetch(`${window.location.origin}/api/procm-browser-log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level, args: args.map(serializeArg) }),
      }).then((response) => {
        if (!response.ok) original('[procm-debug] browser log relay failed', response.status, window.location.origin);
        else if (!relaySuccessLogged) {
          relaySuccessLogged = true;
          original('[procm-debug] browser log relay ok', { origin: window.location.origin, status: response.status });
        }
      }).catch((error) => original('[procm-debug] browser log relay error', error));
    };
  }
  console.info('[procm] browser log bridge installed');
  return Promise.resolve();
}
