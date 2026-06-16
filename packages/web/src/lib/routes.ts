export function normalizeAppPath(pathname: string): string {
  if (pathname === "/index.html") return "/";
  if (pathname.endsWith(".html")) return pathname.slice(0, -".html".length);
  return pathname;
}

export function isLoginPath(pathname: string): boolean {
  return normalizeAppPath(pathname) === "/login";
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
