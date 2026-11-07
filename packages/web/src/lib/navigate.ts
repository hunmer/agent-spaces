import { isFlutterEnvironment, isNativeEnvironment } from './native-notification';

export function nativeNavigate(router: { push: (href: string) => void; replace: (href: string) => void }, href: string, replace = false) {
  const isDev = process.env.NODE_ENV === "development";
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

  const staticPath = path.endsWith(".html") ? path : `${path}.html`;
  return `${staticPath}${queryString ? `?${queryString}` : ""}${hash ? `#${hash}` : ""}`;
}
