import { isTauriEnvironment } from './native-notification';

export function tauriNavigate(router: { push: (href: string) => void; replace: (href: string) => void }, href: string, replace = false) {
  const isDev = process.env.NODE_ENV === "development";

  if (isDev && !isTauriEnvironment()) {
    replace ? router.replace(href) : router.push(href);
    return;
  }

  href = toStaticHref(href);
  if (replace) {
    window.location.replace(href);
  } else {
    window.location.href = href;
  }
}

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

  const target = path.endsWith(".html") ? path : `${path}.html`;
  return `${target}${queryString ? `?${queryString}` : ""}${hash ? `#${hash}` : ""}`;
}
