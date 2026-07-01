const MINI_APP_RUNTIME_EVENT = "agent-spaces:mini-app-runtime";

function readHostRuntime() {
  if (typeof window === "undefined") {
    return null;
  }

  const runtimeFromApi = window.AgentSpaces?.getRuntimeContext?.();
  if (runtimeFromApi && typeof runtimeFromApi === "object") {
    return runtimeFromApi;
  }

  const runtimeFromWindow = window.__AGENT_SPACES_MINIAPP_RUNTIME__;
  return runtimeFromWindow && typeof runtimeFromWindow === "object" ? runtimeFromWindow : null;
}

export function getPayloadFromQuery(query) {
  const raw = typeof query?.payload === "string" ? query.payload : "";
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function getPayloadFromRuntime() {
  const params = readHostRuntime()?.params;
  return params && typeof params === "object" && !Array.isArray(params) ? params : {};
}

export function subscribeRuntimePayload(onChange) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleRuntime = (event) => {
    const params = event?.detail?.params;
    onChange(params && typeof params === "object" && !Array.isArray(params) ? params : {});
  };

  window.addEventListener(MINI_APP_RUNTIME_EVENT, handleRuntime);
  return () => window.removeEventListener(MINI_APP_RUNTIME_EVENT, handleRuntime);
}

export function getRouteStateFromLocation(parseRoute) {
  if (typeof window === "undefined") {
    return { path: [], query: {} };
  }

  try {
    const params = new URLSearchParams(window.location.search);
    const rawRoute = params.get("route");
    if (!rawRoute) return { path: [], query: {} };
    return parseRoute(rawRoute);
  } catch {
    return { path: [], query: {} };
  }
}
