import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SERVER_PORT = "3100";

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

function getDefaultServerUrl(): string {
  return normalizeServerUrl(process.env.NEXT_PUBLIC_SERVER_URL || "127.0.0.1");
}

export function proxy(request: NextRequest) {
  const activeServer = normalizeServerUrl(request.cookies.get("active-server")?.value || getDefaultServerUrl());

  try {
    const targetUrl = `${activeServer}${request.nextUrl.pathname}${request.nextUrl.search}`;
    return NextResponse.rewrite(new URL(targetUrl));
  } catch {
    return NextResponse.next();
  }
}

export const config = {
  matcher: ["/api/:path*"],
};
