var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/protocol.ts
var PROCM_PROTOCOL_VERSION = 1;
var PROCM_LOG_TOPIC = "$procm/log";
var PROCM_LOG_MARKER = "@@PROCM_LOG_V1@@";
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function parseClientFrame(value) {
  if (!isRecord(value) || value.version !== PROCM_PROTOCOL_VERSION) return null;
  if (typeof value.type !== "string") return null;
  switch (value.type) {
    case "hello":
      return typeof value.roomId === "string" && typeof value.memberId === "string" && typeof value.clientName === "string" ? value : null;
    case "subscribe":
      return typeof value.subscriptionId === "string" && typeof value.topic === "string" ? value : null;
    case "unsubscribe":
      return typeof value.subscriptionId === "string" ? value : null;
    case "publish":
      return typeof value.messageId === "string" && typeof value.topic === "string" && typeof value.timestamp === "number" && (value.correlationId === void 0 || typeof value.correlationId === "string") && "payload" in value ? value : null;
    case "trace:put":
      return typeof value.requestId === "string" && typeof value.traceId === "string" && (value.ttlSeconds === void 0 || typeof value.ttlSeconds === "number") && "payload" in value ? value : null;
    case "ping":
      return typeof value.timestamp === "number" ? value : null;
    default:
      return null;
  }
}
function parseServerFrame(value) {
  if (!isRecord(value) || value.version !== PROCM_PROTOCOL_VERSION || typeof value.type !== "string") {
    return null;
  }
  return ["welcome", "message", "member", "error", "trace:stored", "pong"].includes(value.type) ? value : null;
}
function matchesTopic(topic, filter, prefix = false) {
  return prefix ? topic.startsWith(filter) : topic === filter;
}
function encodeBase64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function decodeBase64Url(text) {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - text.length % 4) % 4);
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}
function encodeStructuredLog(log) {
  return `${PROCM_LOG_MARKER}${encodeBase64Url(JSON.stringify(log))}`;
}
function decodeStructuredLogLine(line) {
  const markerIndex = line.lastIndexOf(PROCM_LOG_MARKER);
  if (markerIndex === -1) return null;
  try {
    const value = JSON.parse(decodeBase64Url(line.slice(markerIndex + PROCM_LOG_MARKER.length).trim()));
    if (!isRecord(value) || value.version !== PROCM_PROTOCOL_VERSION) return null;
    if (typeof value.timestamp !== "number" || !["debug", "info", "warn", "error"].includes(String(value.level)) || typeof value.memberId !== "string" || typeof value.clientName !== "string" || typeof value.message !== "string") return null;
    return value;
  } catch {
    return null;
  }
}
function stripStructuredLogFrame(line) {
  const markerIndex = line.lastIndexOf(PROCM_LOG_MARKER);
  return markerIndex === -1 ? line : line.slice(0, markerIndex).trimEnd();
}

// src/client.ts
function env(name) {
  const processLike = globalThis.process;
  return processLike?.env?.[name];
}
function randomId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
var ProcmClient = class {
  constructor(options = {}) {
    __publicField(this, "roomId");
    __publicField(this, "processId");
    __publicField(this, "clientName");
    __publicField(this, "memberId");
    __publicField(this, "options");
    __publicField(this, "subscriptions", /* @__PURE__ */ new Map());
    __publicField(this, "memberHandlers", /* @__PURE__ */ new Set());
    __publicField(this, "stateHandlers", /* @__PURE__ */ new Set());
    __publicField(this, "pendingTraceRequests", /* @__PURE__ */ new Map());
    __publicField(this, "socket", null);
    __publicField(this, "disposed", false);
    __publicField(this, "reconnectAttempt", 0);
    __publicField(this, "reconnectTimer", null);
    __publicField(this, "heartbeatTimer", null);
    __publicField(this, "state", "closed");
    this.options = options;
    this.roomId = options.roomId ?? env("PROCM_ROOM_ID") ?? "";
    this.processId = options.processId ?? env("PROCM_PROCESS_ID");
    this.clientName = options.clientName ?? env("PROCM_CLIENT_NAME") ?? "client";
    this.memberId = options.memberId ?? (this.processId ? `${this.processId}:${this.clientName}` : `${this.clientName}:${randomId()}`);
    if (!this.roomId) throw new Error("procm roomId is required");
    queueMicrotask(() => this.connect());
  }
  get connectionState() {
    return this.state;
  }
  get pendingTraceRequestCount() {
    return this.pendingTraceRequests.size;
  }
  // Resolved WebSocket connection target (raw URL + optional auth token) as
  // used by connect(). Exposed so companion transports, e.g. the MCP HTTP
  // endpoint derived in trace.ts, can reach the same backend.
  get connectionTarget() {
    return {
      url: this.options.url ?? env("PROCM_WS_URL") ?? "",
      token: this.options.token ?? env("PROCM_HTTP_TOKEN")
    };
  }
  connect() {
    if (this.disposed || this.socket?.readyState === WebSocket.OPEN || this.socket?.readyState === WebSocket.CONNECTING) return;
    const rawUrl = this.options.url ?? env("PROCM_WS_URL");
    if (!rawUrl) throw new Error("procm WebSocket URL is required");
    const token = this.options.token ?? env("PROCM_HTTP_TOKEN");
    const url = token ? appendToken(rawUrl, token) : rawUrl;
    const factory = this.options.webSocketFactory ?? ((target, protocols) => new WebSocket(target, protocols));
    this.setState("connecting");
    const ws = factory(url, token ? [`bearer.${token}`] : void 0);
    this.socket = ws;
    ws.addEventListener("open", () => {
      this.reconnectAttempt = 0;
      this.send({
        version: PROCM_PROTOCOL_VERSION,
        type: "hello",
        roomId: this.roomId,
        memberId: this.memberId,
        clientName: this.clientName,
        processId: this.processId,
        metadata: this.options.metadata
      });
      this.heartbeatTimer = setInterval(() => {
        this.send({ version: PROCM_PROTOCOL_VERSION, type: "ping", timestamp: Date.now() });
      }, 2e4);
    });
    ws.addEventListener("message", (event) => this.handleMessage(event.data));
    ws.addEventListener("close", () => this.handleClose(ws));
    ws.addEventListener("error", () => ws.close());
  }
  subscribe(topic, handler, options = {}) {
    if (!topic) throw new Error("subscription topic is required");
    const subscription = { id: randomId(), topic, prefix: options.prefix === true, handler };
    this.subscriptions.set(subscription.id, subscription);
    if (this.state === "open") this.sendSubscription(subscription);
    return () => {
      if (!this.subscriptions.delete(subscription.id)) return;
      this.send({ version: PROCM_PROTOCOL_VERSION, type: "unsubscribe", subscriptionId: subscription.id });
    };
  }
  publish(topic, payload, options = {}) {
    if (!topic) throw new Error("publish topic is required");
    const messageId = randomId();
    this.send({
      version: PROCM_PROTOCOL_VERSION,
      type: "publish",
      messageId,
      topic,
      timestamp: Date.now(),
      payload,
      retain: options.retain,
      correlationId: options.correlationId
    });
    return messageId;
  }
  waitFor(topic, options = {}) {
    return new Promise((resolve, reject) => {
      let timer = null;
      const cleanup = this.subscribe(topic, (message) => {
        const typed = message;
        if (options.filter && !options.filter(typed.payload, typed)) return;
        finish(() => resolve(typed));
      }, { prefix: options.prefix });
      const onAbort = () => finish(() => reject(new DOMException("waitFor aborted", "AbortError")));
      const finish = (done) => {
        cleanup();
        if (timer) clearTimeout(timer);
        options.signal?.removeEventListener("abort", onAbort);
        done();
      };
      if (options.signal?.aborted) return onAbort();
      options.signal?.addEventListener("abort", onAbort, { once: true });
      if (options.timeout !== void 0) {
        timer = setTimeout(() => finish(() => reject(new Error(`waitFor timed out after ${options.timeout}ms`))), options.timeout);
      }
    });
  }
  onMember(handler) {
    this.memberHandlers.add(handler);
    return () => this.memberHandlers.delete(handler);
  }
  onState(handler) {
    this.stateHandlers.add(handler);
    handler(this.state);
    return () => this.stateHandlers.delete(handler);
  }
  close() {
    this.disposed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.socket?.close(1e3, "client disposed");
    this.socket = null;
    this.rejectPendingTraceRequests(new Error("procm client closed"));
    this.setState("closed");
  }
  requestTraceStore(requestId, traceId, payload, ttlSeconds) {
    if (this.state !== "open") return Promise.reject(new Error("procm client is not connected"));
    return new Promise((resolve, reject) => {
      this.pendingTraceRequests.set(requestId, { resolve, reject });
      try {
        this.send({
          version: PROCM_PROTOCOL_VERSION,
          type: "trace:put",
          requestId,
          traceId,
          ttlSeconds,
          payload
        });
      } catch (error) {
        this.pendingTraceRequests.delete(requestId);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }
  cancelTraceStore(requestId, error) {
    const pending = this.pendingTraceRequests.get(requestId);
    if (!pending) return;
    this.pendingTraceRequests.delete(requestId);
    pending.reject(error);
  }
  handleMessage(raw) {
    try {
      const text = typeof raw === "string" ? raw : raw instanceof ArrayBuffer ? new TextDecoder().decode(raw) : String(raw);
      const frame = parseServerFrame(JSON.parse(text));
      if (!frame) return;
      if (frame.type === "welcome") {
        this.setState("open");
        for (const subscription of this.subscriptions.values()) this.sendSubscription(subscription);
      } else if (frame.type === "message") {
        for (const subscription of this.subscriptions.values()) {
          if (matchesTopic(frame.topic, subscription.topic, subscription.prefix)) subscription.handler(frame);
        }
      } else if (frame.type === "member") {
        for (const handler of this.memberHandlers) handler(frame.event, frame.member);
      } else if (frame.type === "trace:stored") {
        const pending = this.pendingTraceRequests.get(frame.requestId);
        if (pending) {
          this.pendingTraceRequests.delete(frame.requestId);
          pending.resolve(frame.traceId);
        }
      } else if (frame.type === "error" && frame.requestId) {
        const pending = this.pendingTraceRequests.get(frame.requestId);
        if (pending) {
          this.pendingTraceRequests.delete(frame.requestId);
          const error = new Error(frame.message);
          error.code = frame.code;
          pending.reject(error);
        }
      }
    } catch {
    }
  }
  handleClose(socket) {
    if (socket !== this.socket) return;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.socket = null;
    this.rejectPendingTraceRequests(new Error("procm WebSocket closed"));
    this.setState("closed");
    if (!this.disposed && this.options.reconnect !== false) {
      const base = Math.min(500 * 2 ** this.reconnectAttempt++, 1e4);
      const delay = Math.round(base * (0.8 + Math.random() * 0.4));
      this.reconnectTimer = setTimeout(() => this.connect(), delay);
    }
  }
  send(frame) {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      if (frame.type === "publish") throw new Error("procm client is not connected");
      return;
    }
    this.socket.send(JSON.stringify(frame));
  }
  sendSubscription(subscription) {
    this.send({
      version: PROCM_PROTOCOL_VERSION,
      type: "subscribe",
      subscriptionId: subscription.id,
      topic: subscription.topic,
      prefix: subscription.prefix
    });
  }
  setState(state) {
    if (this.state === state) return;
    this.state = state;
    for (const handler of this.stateHandlers) handler(state);
  }
  rejectPendingTraceRequests(error) {
    for (const pending of this.pendingTraceRequests.values()) pending.reject(error);
    this.pendingTraceRequests.clear();
  }
};
function appendToken(rawUrl, token) {
  const url = new URL(rawUrl);
  if (!url.searchParams.has("token")) url.searchParams.set("token", token);
  return url.toString();
}
function createProcmClient(options = {}) {
  return new ProcmClient(options);
}

// src/logger.ts
var LEVEL_ORDER = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4
};
var Logger = class {
  constructor(options = {}) {
    this.options = options;
    __publicField(this, "output");
    __publicField(this, "level");
    const nativeConsole = {
      debug: console.debug.bind(console),
      info: console.info.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console)
    };
    this.output = options.console ?? nativeConsole;
    this.level = options.level ?? "debug";
    if (options.captureConsole) installConsoleCapture(this);
  }
  setLevel(level) {
    this.level = level;
  }
  getLevel() {
    return this.level;
  }
  debug(message, data, context) {
    this.write("debug", message, data, context);
  }
  info(message, data, context) {
    this.write("info", message, data, context);
  }
  warn(message, data, context) {
    this.write("warn", message, data, context);
  }
  error(message, data, context) {
    this.write("error", message, data, context);
  }
  log(level, message, data, context) {
    this.write(level, message, data, context);
  }
  write(level, message, data, context) {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.level]) return;
    const client = this.options.client;
    const entry = {
      version: PROCM_PROTOCOL_VERSION,
      timestamp: Date.now(),
      level,
      memberId: this.options.memberId ?? client?.memberId ?? "standalone",
      clientName: this.options.clientName ?? client?.clientName ?? "app",
      processId: this.options.processId ?? client?.processId,
      message,
      data,
      traceId: context?.traceId
    };
    try {
      this.options.onLog?.(entry);
    } catch {
    }
    const readable = `${entry.timestamp ? new Date(entry.timestamp).toISOString() : ""} ${level.toUpperCase()} ${entry.clientName}: ${message}${data === void 0 ? "" : ` ${JSON.stringify(data)}`}`;
    this.output[level](`${readable} ${encodeStructuredLog(entry)}`);
    if (client?.connectionState === "open") {
      try {
        client.publish(PROCM_LOG_TOPIC, entry);
      } catch {
      }
    }
  }
};
var restoreConsole;
function installConsoleCapture(logger) {
  restoreConsole?.();
  const originals = {
    debug: console.debug.bind(console),
    info: console.info.bind(console),
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    trace: console.trace.bind(console)
  };
  console.debug = (...args) => logger.debug(formatConsoleArgs(args));
  console.info = (...args) => logger.info(formatConsoleArgs(args));
  console.log = (...args) => logger.info(formatConsoleArgs(args));
  console.warn = (...args) => logger.warn(formatConsoleArgs(args));
  console.error = (...args) => logger.error(formatConsoleArgs(args));
  console.trace = (...args) => logger.debug(formatConsoleArgs(args));
  restoreConsole = () => {
    console.debug = originals.debug;
    console.info = originals.info;
    console.log = originals.log;
    console.warn = originals.warn;
    console.error = originals.error;
    console.trace = originals.trace;
    restoreConsole = void 0;
  };
}
function formatConsoleArgs(args) {
  return args.map((arg) => {
    if (arg instanceof Error) return arg.stack || `${arg.name}: ${arg.message}`;
    if (typeof arg === "object" && arg !== null) {
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    }
    return String(arg);
  }).join(" ");
}
var defaultLogger = new Logger({ level: "silent" });
function setLogger(options = {}) {
  restoreConsole?.();
  defaultLogger = new Logger(options);
  return defaultLogger;
}
function setupLogger(options = {}) {
  return setLogger({ ...options, captureConsole: options.captureConsole ?? true });
}
function setupLoggerFromEnv(options = {}) {
  const processLike = globalThis.process;
  const env2 = processLike?.env ?? {};
  const clientName = options.clientName ?? env2.PROCM_CLIENT_NAME;
  let client = options.client;
  if (!client && env2.PROCM_ROOM_ID && env2.PROCM_WS_URL) {
    try {
      client = createProcmClient({ clientName });
    } catch {
    }
  }
  return setupLogger({ ...options, client, clientName });
}
function getLogger() {
  return defaultLogger;
}
function createLogger(options = {}) {
  return new Logger(options);
}
async function collectLogs(client, options = {}) {
  const target = client.connectionTarget;
  if (!target.url) throw new Error("procm HTTP URL is required to collect logs");
  if (options.startTime !== void 0 && options.endTime !== void 0 && options.startTime > options.endTime) {
    throw new Error("log collection startTime must be before endTime");
  }
  const base = target.url.replace(/^ws(s?):\/\//, "http$1://").replace(/\/room\/?$/, "");
  const query = new URLSearchParams();
  if (options.startTime !== void 0) query.set("startTime", String(options.startTime));
  if (options.endTime !== void 0) query.set("endTime", String(options.endTime));
  if (options.count !== void 0) query.set("count", String(options.count));
  if (options.minLevel && options.minLevel !== "silent") query.set("level", options.minLevel);
  if (options.clientNames?.length === 1) query.set("memberPrefix", options.clientNames[0]);
  if (options.memberIds?.length === 1) query.set("memberPrefix", options.memberIds[0]);
  const token = target.token;
  const response = await fetch(`${base}/api/rooms/${encodeURIComponent(client.roomId)}/logs?${query}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : void 0
  });
  if (!response.ok) throw new Error(`log collection failed with HTTP ${response.status}`);
  const payload = await response.json();
  return (payload.entries ?? []).filter(
    (entry) => (options.startTime === void 0 || entry.timestamp >= options.startTime) && (options.endTime === void 0 || entry.timestamp <= options.endTime) && matchesLogFilter(entry, options)
  );
}
function matchesLogFilter(entry, filter = {}) {
  if (filter.minLevel !== void 0 && LEVEL_ORDER[entry.level] < LEVEL_ORDER[filter.minLevel]) return false;
  if (filter.clientNames?.length && !filter.clientNames.includes(entry.clientName)) return false;
  if (filter.memberIds?.length && !filter.memberIds.includes(entry.memberId)) return false;
  return true;
}
function subscribeLogs(client, handler, filter = {}) {
  return client.subscribe(PROCM_LOG_TOPIC, (message) => {
    const entry = message.payload;
    if (!entry || typeof entry !== "object" || typeof entry.level !== "string" || typeof entry.message !== "string") return;
    if (!matchesLogFilter(entry, filter)) return;
    handler(entry, message);
  });
}

// src/trace.ts
var TRACE_MAX_BYTES = 262144;
var TRACE_MIN_TTL_SECONDS = 1;
var TRACE_MAX_TTL_SECONDS = 604800;
function randomId2() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
function byteLength(value) {
  return new TextEncoder().encode(value).byteLength;
}
function validateData(data) {
  let serialized;
  try {
    serialized = JSON.stringify(data);
  } catch {
    throw new Error("trace data must be JSON serializable");
  }
  if (serialized === void 0) throw new Error("trace data must be JSON serializable");
  if (byteLength(serialized) > TRACE_MAX_BYTES) {
    throw new Error(`trace data exceeds ${TRACE_MAX_BYTES} bytes`);
  }
}
async function saveTrace(client, data, options = {}) {
  if (client.connectionState !== "open") throw new Error("procm client is not connected");
  if (options.ttlSeconds !== void 0 && (!Number.isInteger(options.ttlSeconds) || options.ttlSeconds < TRACE_MIN_TTL_SECONDS || options.ttlSeconds > TRACE_MAX_TTL_SECONDS)) {
    throw new Error(`trace ttlSeconds must be an integer from ${TRACE_MIN_TTL_SECONDS} to ${TRACE_MAX_TTL_SECONDS}`);
  }
  validateData(data);
  if (options.signal?.aborted) throw new DOMException("trace save aborted", "AbortError");
  const attempts = options.id === void 0 ? 3 : 1;
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const traceId = options.id ?? randomId2();
    const requestId = randomId2();
    let timer;
    let onAbort;
    try {
      const request = client.requestTraceStore(requestId, traceId, data, options.ttlSeconds);
      const guarded = new Promise((resolve, reject) => {
        const finish = (done) => {
          if (timer) clearTimeout(timer);
          if (onAbort) options.signal?.removeEventListener("abort", onAbort);
          done();
        };
        request.then((id) => finish(() => resolve(id)), (error) => finish(() => reject(error)));
        onAbort = () => {
          const error = new DOMException("trace save aborted", "AbortError");
          client.cancelTraceStore(requestId, error);
        };
        options.signal?.addEventListener("abort", onAbort, { once: true });
        const timeout = options.timeout ?? 1e4;
        timer = setTimeout(() => {
          const error = new Error(`trace request timed out after ${timeout}ms`);
          error.code = "TRACE_REQUEST_TIMEOUT";
          client.cancelTraceStore(requestId, error);
        }, timeout);
      });
      return await guarded;
    } catch (error) {
      lastError = error;
      if (error.code !== "TRACE_STORE_CONFLICT" || options.id !== void 0) throw error;
    }
  }
  throw lastError;
}
var MCP_PROTOCOL_VERSION = "2025-06-18";
var mcpSessions = /* @__PURE__ */ new WeakMap();
function mcpEndpoint(client) {
  const { url, token } = client.connectionTarget;
  if (!url) throw new Error("procm WebSocket URL is required to resolve the MCP endpoint");
  const httpUrl = new URL(url);
  httpUrl.protocol = httpUrl.protocol === "wss:" ? "https:" : "http:";
  httpUrl.pathname = "/mcp";
  httpUrl.search = "";
  return { url: httpUrl.toString(), token };
}
async function mcpPost(endpoint, body, timeout, signal) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeout);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": MCP_PROTOCOL_VERSION
    };
    if (endpoint.token) headers.Authorization = `Bearer ${endpoint.token}`;
    const response = await fetch(endpoint.url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`MCP HTTP request failed with status ${response.status}`);
    return await response.text();
  } catch (error) {
    if (timedOut) throw new Error(`MCP request timed out after ${timeout}ms`);
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}
async function mcpFetch(endpoint, body, timeout, signal) {
  const text = await mcpPost(endpoint, body, timeout, signal);
  for (const line of text.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    try {
      return JSON.parse(line.slice(6));
    } catch {
    }
  }
  return JSON.parse(text);
}
async function ensureMcpSession(client, timeout, signal) {
  let session = mcpSessions.get(client);
  if (!session) {
    const endpoint = mcpEndpoint(client);
    session = (async () => {
      await mcpFetch(endpoint, {
        jsonrpc: "2.0",
        id: randomId2(),
        method: "initialize",
        params: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: "procm-sdk", version: "1.0" }
        }
      }, timeout, signal);
      await mcpPost(endpoint, {
        jsonrpc: "2.0",
        method: "notifications/initialized"
      }, timeout, signal);
    })().catch((error) => {
      mcpSessions.delete(client);
      throw error;
    });
    mcpSessions.set(client, session);
  }
  return session;
}
async function getTrace(client, id, options = {}) {
  if (!id || typeof id !== "string") throw new Error("trace id is required");
  const timeout = options.timeout ?? 1e4;
  await ensureMcpSession(client, timeout, options.signal);
  const response = await mcpFetch(mcpEndpoint(client), {
    jsonrpc: "2.0",
    id: randomId2(),
    method: "tools/call",
    params: { name: "trace-get", arguments: { id } }
  }, timeout, options.signal);
  if (response.error) throw new Error(`MCP tools/call failed: ${response.error.message ?? "unknown MCP error"}`);
  const text = response.result?.content?.find((part) => part.type === "text")?.text;
  let payload;
  try {
    payload = text === void 0 ? void 0 : JSON.parse(text);
  } catch {
    throw new Error("trace-get returned a malformed payload");
  }
  if (!payload?.ok || !payload.trace) {
    const detail = payload?.error;
    throw new Error(typeof detail === "string" ? detail : detail && typeof detail === "object" ? `${detail.code ?? "TRACE_ERROR"}: ${detail.message ?? "no message"}` : `trace "${id}" was not found`);
  }
  return payload.trace;
}

// ../../node_modules/callsites/index.js
function callsites() {
  const _prepareStackTrace = Error.prepareStackTrace;
  try {
    let result = [];
    Error.prepareStackTrace = (_, callSites) => {
      const callSitesWithoutCurrent = callSites.slice(1);
      result = callSitesWithoutCurrent;
      return callSitesWithoutCurrent;
    };
    new Error().stack;
    return result;
  } finally {
    Error.prepareStackTrace = _prepareStackTrace;
  }
}

// src/hook.ts
function randomId3() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
function captureCallChain(filterFrame) {
  const frames = callsites().map((site, index) => ({
    index,
    functionName: site.getFunctionName() ?? site.getMethodName() ?? "<anonymous>",
    file: site.getFileName() ?? "<unknown>",
    line: site.getLineNumber(),
    column: site.getColumnNumber(),
    async: site.isAsync()
  })).filter((frame) => !frame.file.endsWith("/hook.js") && !frame.file.endsWith("/hook.ts")).filter((frame) => filterFrame?.(frame) ?? true).slice(0, 100).map((frame, index) => ({ ...frame, index }));
  return frames;
}
function jsonValueOrPlaceholder(value) {
  try {
    const text = JSON.stringify(value);
    if (text === void 0) return { unavailable: "not JSON serializable" };
    return JSON.parse(text);
  } catch {
    return { unavailable: "not JSON serializable" };
  }
}
function errorDetails(error) {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack };
  return { name: "Error", message: String(error) };
}
function assertSynchronous(result, phase) {
  if (result !== null && (typeof result === "object" || typeof result === "function") && typeof result.then === "function") {
    throw new Error(`${phase} hook handlers must be synchronous`);
  }
}
function store(options, trace) {
  if (!options.client) return;
  void saveTrace(options.client, trace, { id: trace.traceId, ttlSeconds: options.ttlSeconds }).then((id) => options.onStored?.(id)).catch((error) => options.onStoreError?.(error instanceof Error ? error : new Error(String(error)), trace.traceId));
}
function createHook(fn, options = {}) {
  if (typeof fn !== "function") throw new TypeError("createHook requires a function");
  const beforeHandlers = [];
  const afterHandlers = [];
  const hooked = function(...initialArgs) {
    const traceId = randomId3();
    const startedAt = Date.now();
    const started = performance.now();
    const callChain = captureCallChain(options.filterFrame);
    let args = initialArgs;
    let skipped = false;
    let currentResult;
    options.onTraceCreated?.(traceId);
    for (const handler of beforeHandlers) {
      const returned = handler({
        traceId,
        args,
        callChain,
        setArgs(next) {
          args = next;
        },
        skip(result2) {
          skipped = true;
          currentResult = result2;
        }
      });
      assertSynchronous(returned, "before");
    }
    const complete = (status, result2, error) => {
      currentResult = result2;
      for (const handler of afterHandlers) {
        const returned = handler({
          traceId,
          args,
          result: currentResult,
          error,
          callChain,
          setResult(next) {
            currentResult = next;
          }
        });
        assertSynchronous(returned, "after");
      }
      const trace = {
        kind: "function",
        traceId,
        name: options.name ?? fn.name ?? "<anonymous>",
        startedAt,
        durationMs: performance.now() - started,
        status,
        callChain
      };
      if (options.captureArgs) trace.args = jsonValueOrPlaceholder(args);
      if (options.captureResult && error === void 0) trace.result = jsonValueOrPlaceholder(currentResult);
      if (error !== void 0) trace.error = errorDetails(error);
      store(options, trace);
      return currentResult;
    };
    if (skipped) return complete("skipped", currentResult);
    let result;
    try {
      result = fn.apply(this, args);
    } catch (error) {
      complete("threw", void 0, error);
      throw error;
    }
    if (result !== null && (typeof result === "object" || typeof result === "function") && typeof result.then === "function") {
      return Promise.resolve(result).then(
        (value) => complete("resolved", value),
        (error) => {
          complete("rejected", void 0, error);
          throw error;
        }
      );
    }
    return complete("returned", result);
  };
  Object.defineProperties(hooked, {
    original: { value: fn, enumerable: true },
    before: { value: (handler) => {
      beforeHandlers.push(handler);
      return hooked;
    } },
    after: { value: (handler) => {
      afterHandlers.push(handler);
      return hooked;
    } }
  });
  return hooked;
}
function hookProperty(target, key, options = {}) {
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  if (!descriptor) throw new Error(`property ${String(key)} must be an own property`);
  if (!descriptor.configurable) throw new Error(`property ${String(key)} must be configurable`);
  let restored = false;
  let currentValue = descriptor.value;
  const originalGet = descriptor.get;
  const originalSet = descriptor.set;
  const getValue = function() {
    return originalGet ? originalGet.call(this) : currentValue;
  };
  const setValue = function(value) {
    if (originalSet) originalSet.call(this, value);
    else if ("writable" in descriptor && descriptor.writable) currentValue = value;
  };
  const hookedGet = options.captureGet === false ? getValue : createHook(getValue, { ...options, name: options.name ?? `${String(key)}:get`, captureResult: options.captureResult ?? true });
  const hookedSet = options.captureSet === false ? setValue : createHook(setValue, { ...options, name: options.name ?? `${String(key)}:set`, captureArgs: options.captureArgs ?? true });
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: descriptor.enumerable,
    get: hookedGet,
    set: originalSet || "writable" in descriptor && descriptor.writable ? hookedSet : void 0
  });
  return () => {
    if (restored) return;
    restored = true;
    const restoredDescriptor = "value" in descriptor ? { ...descriptor, value: currentValue } : descriptor;
    Object.defineProperty(target, key, restoredDescriptor);
  };
}
export {
  Logger,
  PROCM_LOG_MARKER,
  PROCM_LOG_TOPIC,
  PROCM_PROTOCOL_VERSION,
  ProcmClient,
  TRACE_MAX_BYTES,
  TRACE_MAX_TTL_SECONDS,
  TRACE_MIN_TTL_SECONDS,
  collectLogs,
  createHook,
  createLogger,
  createProcmClient,
  decodeStructuredLogLine,
  encodeStructuredLog,
  getLogger,
  getTrace,
  hookProperty,
  isRecord,
  matchesLogFilter,
  matchesTopic,
  parseClientFrame,
  parseServerFrame,
  saveTrace,
  setLogger,
  setupLogger,
  setupLoggerFromEnv,
  stripStructuredLogFrame,
  subscribeLogs
};
//# sourceMappingURL=browser.js.map
