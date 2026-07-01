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
