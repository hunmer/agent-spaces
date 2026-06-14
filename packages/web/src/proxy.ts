import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SERVER_PORT = "3100";
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

function normalizeServerUrl(input: string): string {
  const value = input.trim();
  if (!value) return `http://127.0.0.1:${SERVER_PORT}`;

  try {
    const parsed = new URL(value.includes("://") ? value : `http://${value}`);
    return `http://${parsed.hostname}:${SERVER_PORT}`;
  } catch {
    return `http://${value.replace(/^https?:\/\//, "").split("/")[0].split(":")[0]}:${SERVER_PORT}`;
  }
}

function isLoopbackUrl(url: string): boolean {
  try {
    return LOOPBACK_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

function getDefaultServerUrl(request: NextRequest): string {
  return normalizeServerUrl(process.env.NEXT_PUBLIC_SERVER_URL || request.nextUrl.hostname || "127.0.0.1");
}

export function proxy(request: NextRequest) {
  const defaultServer = getDefaultServerUrl(request);
  const cookieServer = request.cookies.get("active-server")?.value;
  const activeServer = cookieServer ? normalizeServerUrl(cookieServer) : defaultServer;
  const requestIsLoopback = LOOPBACK_HOSTS.has(request.nextUrl.hostname);
  const targetServer = !requestIsLoopback && isLoopbackUrl(activeServer) ? defaultServer : activeServer;

  try {
    const targetUrl = `${targetServer}${request.nextUrl.pathname}${request.nextUrl.search}`;
    return NextResponse.rewrite(new URL(targetUrl));
  } catch {
    return NextResponse.next();
  }
}

export const config = {
  matcher: ["/api/:path*"],
};
