import { isFlutterEnvironment, isNativeEnvironment } from './native-notification';

export function nativeNavigate(router: { push: (href: string) => void; replace: (href: string) => void }, href: string, replace = false) {
  // Vite SPA 适配：无 Next 静态导出（_/xxx.html）产物，浏览器环境永远走客户端路由。
  // 原 Next 版本此处为 `process.env.NODE_ENV === "development"`。
  const isDev = true;
  // Flutter local asset server (port 8080) can't serve dynamic Next.js routes
  const isLocalAssets = typeof window !== 'undefined' &&
    isFlutterEnvironment() &&
    window.location.port === '8080';

  if ((isDev && !isNativeEnvironment()) || (isFlutterEnvironment() && !isLocalAssets)) {
    if (replace) {
      router.replace(href);
    } else {
      router.push(href);
    }
    return;
  }

  href = toStaticHref(href);
  if (replace) {
    window.location.replace(href);
  } else {
    window.location.href = href;
  }
}

/** @deprecated Use nativeNavigate */
export const tauriNavigate = nativeNavigate;

export function toStaticHref(href: string) {
  const [pathWithQuery, hash = ""] = href.split("#", 2);
  const [path, queryString = ""] = pathWithQuery.split("?", 2);

  if (!path.startsWith("/") || path.startsWith("/api/")) {
    return href;
  }

  if (path === "/") {
    return `/${queryString ? `?${queryString}` : ""}${hash ? `#${hash}` : ""}`;
  }

  if (path.startsWith("/workspace/")) {
    const workspaceId = path.slice("/workspace/".length).split("/")[0];
    const query = new URLSearchParams(queryString);
    query.set("workspaceId", workspaceId);
    return `/workspace/_.html${query.toString() ? `?${query.toString()}` : ""}${hash ? `#${hash}` : ""}`;
  }

  if (path === "/workflows/share") {
    return `/workflows/share.html${queryString ? `?${queryString}` : ""}${hash ? `#${hash}` : ""}`;
  }

  if (path.startsWith("/workflows/")) {
    const workflowId = path.slice("/workflows/".length).split("/")[0];
    const query = new URLSearchParams(queryString);
    query.set("workflowId", workflowId);
    return `/workflows/_.html${query.toString() ? `?${query.toString()}` : ""}${hash ? `#${hash}` : ""}`;
  }

  if (path.startsWith("/mini-apps/")) {
    const projectId = path.slice("/mini-apps/".length).split("/")[0];
    const query = new URLSearchParams(queryString);
    query.set("id", projectId);
    return `/mini-apps.html${query.toString() ? `?${query.toString()}` : ""}${hash ? `#${hash}` : ""}`;
  }

  if (path.startsWith("/mini-apps-preview/")) {
    const projectId = path.slice("/mini-apps-preview/".length).split("/")[0];
    const query = new URLSearchParams(queryString);
    query.set("id", projectId);
    return `/mini-apps-preview.html${query.toString() ? `?${query.toString()}` : ""}${hash ? `#${hash}` : ""}`;
  }

  const staticPath = path.endsWith(".html") ? path : `${path}.html`;
  return `${staticPath}${queryString ? `?${queryString}` : ""}${hash ? `#${hash}` : ""}`;
}
