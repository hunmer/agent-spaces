export function normalizeAppPath(pathname: string): string {
  if (pathname === "/index.html") return "/";
  if (pathname.endsWith(".html")) return pathname.slice(0, -".html".length);
  return pathname;
}

export function isLoginPath(pathname: string): boolean {
  return normalizeAppPath(pathname) === "/login";
}

function isSafeInternalHref(href: string): boolean {
  return href.startsWith("/") && !href.startsWith("//");
}

export function currentRefUrl(): string {
  if (typeof window === "undefined") return "/";

  const href = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (!isSafeInternalHref(href) || isLoginPath(window.location.pathname)) return "/";
  return href;
}

export function loginHrefWithRef(refUrl = currentRefUrl()): string {
  const query = new URLSearchParams();
  if (isSafeInternalHref(refUrl) && !isLoginPath(refUrl.split(/[?#]/, 1)[0])) {
    query.set("ref_url", refUrl);
  }
  return `/login${query.toString() ? `?${query.toString()}` : ""}`;
}

export function loginRedirectUrl(search: string): string {
  const refUrl = new URLSearchParams(search).get("ref_url");
  if (!refUrl || !isSafeInternalHref(refUrl)) return "/";
  if (isLoginPath(refUrl.split(/[?#]/, 1)[0])) return "/";
  return refUrl;
}

export function isWorkspacePath(pathname: string): boolean {
  return normalizeAppPath(pathname).startsWith("/workspace/");
}

export function isWorkflowSharePath(pathname: string): boolean {
  return normalizeAppPath(pathname) === "/workflows/share";
}

export function isMiniAppPreviewPath(pathname: string): boolean {
  const path = normalizeAppPath(pathname);
  return path === "/mini-apps-preview" || path.startsWith("/mini-apps-preview/");
}

export function workspaceIdFromLocation(pathname: string, search: string): string | null {
  const queryId = new URLSearchParams(search).get("workspaceId");
  if (queryId) return queryId;

  const normalizedPath = normalizeAppPath(pathname);
  const match = normalizedPath.match(/^\/workspace\/([^/]+)/);
  return match?.[1] ?? null;
}
