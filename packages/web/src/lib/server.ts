export type ServerConfig = {
  id: string;
  name: string;
  url: string;
};

const STORAGE_KEY = "agent-spaces-servers";
const ACTIVE_KEY = "agent-spaces-active-server";
const COOKIE_KEY = "active-server";

const DEFAULT_SERVERS: ServerConfig[] = [
  { id: "default", name: "Local", url: "http://localhost:3100" },
];

export function loadServers(): ServerConfig[] {
  if (typeof window === "undefined") return DEFAULT_SERVERS;
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : DEFAULT_SERVERS;
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
  if (url && url !== DEFAULT_SERVERS[0].url) {
    document.cookie = `${COOKIE_KEY}=${encodeURIComponent(url)}; path=/; max-age=31536000; SameSite=Lax`;
  } else {
    document.cookie = `${COOKIE_KEY}=; path=/; max-age=0`;
  }
}
