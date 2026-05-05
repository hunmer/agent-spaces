const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

type RouteContext = {
  params: Promise<{ path?: string[] }> | { path?: string[] };
};

async function proxy(req: Request, context: RouteContext) {
  const serverUrl = process.env.SERVER_URL || 'http://localhost:3100';
  const params = await context.params;
  const path = (params.path ?? []).map(encodeURIComponent).join('/');
  const incomingUrl = new URL(req.url);
  const target = new URL(`/api/${path}${incomingUrl.search}`, serverUrl);

  const headers = new Headers(req.headers);
  headers.delete('host');
  headers.delete('content-length');

  const init: RequestInit = {
    method: req.method,
    headers,
    body: req.method === 'GET' || req.method === 'HEAD'
      ? undefined
      : await req.arrayBuffer(),
    redirect: 'manual',
  };

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown proxy error';
    console.error(`[api-proxy] failed to proxy ${target.toString()}:`, error);
    return Response.json(
      { error: 'Upstream API is unavailable', target: target.origin, detail: message },
      { status: 502 },
    );
  }
  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      responseHeaders.set(key, value);
    }
  });

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const HEAD = proxy;
