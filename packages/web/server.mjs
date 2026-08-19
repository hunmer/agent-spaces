import http from "node:http";
import next from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchEditorMiddleware } from "@react-dev-inspector/middleware";
import { createLogger, createProcmClient } from "@hunmer/procm-mcp-sdk";

// procm 结构化日志：由 procm 管理时（注入 PROCM_ROOM_ID/PROCM_WS_URL）连接 room 发布日志，否则仅输出结构化帧。
// 兼容 @hunmer/procm-mcp-sdk@0.1.0（无 setupLoggerFromEnv），行为对齐新版；SDK 新版发布后可替换。
function setupProcmLogger(clientName) {
  let client;
  if (process.env.PROCM_ROOM_ID && process.env.PROCM_WS_URL) {
    try {
      client = createProcmClient({ clientName });
    } catch { /* 连接失败时仅保留结构化控制台输出 */ }
  }
  // 旧版 Logger 持有 console 对象本身（动态查找方法），必须传入绑定原始方法的 sink，否则替换 console.* 后会无限递归
  const nativeConsole = {
    debug: console.debug.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };
  const logger = createLogger({ client, clientName, console: nativeConsole });
  const format = (args) =>
    args
      .map((arg) => {
        if (arg instanceof Error) return arg.stack ?? `${arg.name}: ${arg.message}`;
        if (typeof arg === "object" && arg !== null) {
          try { return JSON.stringify(arg); } catch { return String(arg); }
        }
        return String(arg);
      })
      .join(" ");
  console.debug = (...args) => logger.debug(format(args));
  console.info = (...args) => logger.info(format(args));
  console.log = (...args) => logger.info(format(args));
  console.warn = (...args) => logger.warn(format(args));
  console.error = (...args) => logger.error(format(args));
  console.trace = (...args) => logger.debug(format(args));
}

setupProcmLogger("web");

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = Number(process.env.PORT || 3000);
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const app = next({ dev, hostname, port, dir: projectRoot, webpack: true });
const handle = app.getRequestHandler();

await app.prepare();

function normalizeHtmlAppUrl(req) {
  if (!req.url) return;

  const url = new URL(req.url, `http://${hostname}:${port}`);
  const { pathname } = url;

  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/public/") ||
    pathname.startsWith("/static/")
  ) {
    return;
  }

  if (pathname === "/index.html") {
    url.pathname = "/";
  } else if (pathname.endsWith(".html")) {
    url.pathname = pathname.slice(0, -".html".length);
  } else {
    return;
  }

  req.url = `${url.pathname}${url.search}`;
}

const server = http.createServer((req, res) => {
    if (dev) normalizeHtmlAppUrl(req);

    if (dev) {
      launchEditorMiddleware(req, res, () => handle(req, res));
      return;
    }

    handle(req, res);
  });

if (dev) {
  server.on("upgrade", app.getUpgradeHandler());
}

server.listen(port, hostname, () => {
  console.log(`> Ready on http://${hostname}:${port}`);
});
