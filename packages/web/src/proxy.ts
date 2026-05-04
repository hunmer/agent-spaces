import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const activeServer = request.cookies.get("active-server")?.value;

  if (!activeServer) {
    return NextResponse.next();
  }

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
