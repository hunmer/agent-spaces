export type ServerConfig = {
  id: string;
  name: string;
  url: string;
  secret?: string;
};

const STORAGE_KEY = "agent-spaces-servers";
const ACTIVE_KEY = "agent-spaces-active-server";
const COOKIE_KEY = "active-server";
const SERVER_PORT = "3100";

function getDefaultServerUrl(): string {
  const configuredUrl = process.env.NEXT_PUBLIC_SERVER_URL?.trim();
  if (configuredUrl) return normalizeServerUrl(configuredUrl);
  if (typeof window !== "undefined" && window.location.hostname) {
    return normalizeServerUrl(window.location.hostname);
  }
  return normalizeServerUrl("127.0.0.1");
}

const DEFAULT_SERVERS: ServerConfig[] = [
  { id: "default", name: "Default", url: getDefaultServerUrl() },
];

function normalizeServers(servers: ServerConfig[]): ServerConfig[] {
  return servers.map((server) => {
    if (server.id === "default") {
      return { ...server, url: getDefaultServerUrl() };
    }
    return { ...server, url: normalizeServerUrl(server.url || getDefaultServerUrl()) };
  });
}

export function normalizeServerUrl(input: string): string {
  const value = input.trim();
  if (!value) return `http://127.0.0.1:${SERVER_PORT}`;

  try {
    const parsed = new URL(value.includes("://") ? value : `http://${value}`);
    return `http://${parsed.hostname}:${SERVER_PORT}`;
  } catch {
    return `http://${value.replace(/^https?:\/\//, "").split("/")[0].split(":")[0]}:${SERVER_PORT}`;
  }
}

export function loadServers(): ServerConfig[] {
  if (typeof window === "undefined") return normalizeServers(DEFAULT_SERVERS);
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? normalizeServers(JSON.parse(data)) : normalizeServers(DEFAULT_SERVERS);
  } catch {
    return normalizeServers(DEFAULT_SERVERS);
  }
}

export function saveServers(servers: ServerConfig[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeServers(servers)));
}

export function loadActiveId(): string {
  if (typeof window === "undefined") return "default";
  return localStorage.getItem(ACTIVE_KEY) || "default";
}

export function saveActiveId(id: string) {
  localStorage.setItem(ACTIVE_KEY, id);
}

export function getActiveServer(): ServerConfig | null {
  const servers = loadServers();
  const activeId = loadActiveId();
  return servers.find((s) => s.id === activeId) || servers[0] || null;
}

export function getActiveServerUrl(): string | null {
  return getActiveServer()?.url ?? null;
}

export function resolveServerAssetUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (/^(?:[a-z][a-z\d+\-.]*:)?\/\//i.test(url) || url.startsWith("data:") || url.startsWith("blob:")) {
    return url;
  }

  const baseUrl = getActiveServerUrl();
  if (!baseUrl) return url;

  return `${baseUrl.replace(/\/$/, "")}${url.startsWith("/") ? "" : "/"}${url}`;
}

export function setActiveServerCookie(url: string | null) {
  if (url) {
    document.cookie = `${COOKIE_KEY}=${encodeURIComponent(normalizeServerUrl(url))}; path=/; max-age=31536000; SameSite=Lax`;
  } else {
    document.cookie = `${COOKIE_KEY}=; path=/; max-age=0`;
  }
}
