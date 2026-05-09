export type ServerConfig = {
  id: string;
  name: string;
  url: string;
  secret?: string;
};

const STORAGE_KEY = "agent-spaces-servers";
const ACTIVE_KEY = "agent-spaces-active-server";
const COOKIE_KEY = "active-server";

function getDefaultServerUrl(): string {
  const configuredUrl = process.env.NEXT_PUBLIC_SERVER_URL?.trim();
  if (configuredUrl) return configuredUrl.replace(/\/$/, "");

  if (typeof window === "undefined") return "http://localhost:3100";

  const { hostname, port } = window.location;

  // Tauri or other non-standard hosts: always resolve to localhost:3100
  if (hostname !== "localhost" && hostname !== "127.0.0.1") {
    return "http://localhost:3100";
  }

  if (port === "3000") {
    return `http://${hostname}:3100`;
  }

  return window.location.origin;
}

const DEFAULT_SERVERS: ServerConfig[] = [
  { id: "default", name: "Default", url: getDefaultServerUrl() },
];

function normalizeServers(servers: ServerConfig[]): ServerConfig[] {
  return servers.map((server) => {
    if (server.id !== "default") return server;
    if (server.url) return server;
    return { ...server, url: getDefaultServerUrl() };
  });
}

export function loadServers(): ServerConfig[] {
  if (typeof window === "undefined") return DEFAULT_SERVERS;
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? normalizeServers(JSON.parse(data)) : DEFAULT_SERVERS;
  } catch {
    return DEFAULT_SERVERS;
  }
}

export function saveServers(servers: ServerConfig[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(servers));
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

export function setActiveServerCookie(url: string | null) {
  if (url) {
    document.cookie = `${COOKIE_KEY}=${encodeURIComponent(url)}; path=/; max-age=31536000; SameSite=Lax`;
  } else {
    document.cookie = `${COOKIE_KEY}=; path=/; max-age=0`;
  }
}
