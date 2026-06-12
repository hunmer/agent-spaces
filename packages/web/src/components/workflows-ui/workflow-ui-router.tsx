'use client';

import React, { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';

// ---- 路由状态类型 ----
export type RouteState = {
  path: string[];
  query: Record<string, string>;
};

// ---- 序列化：RouteState -> 字符串（如 /history?filter=done）----
// path 用 / 拼接（空数组 -> 空串 -> "/"）；query 非空时用 URLSearchParams 拼到后面。
export function serializeRoute(state: RouteState): string {
  const pathPart = '/' + state.path.map(encodeURIComponent).join('/');
  const entries = Object.entries(state.query || {}).filter(([, v]) => v !== undefined && v !== null);
  if (entries.length === 0) return pathPart === '/' ? '' : pathPart;
  const qs = new URLSearchParams();
  for (const [k, v] of entries) qs.set(k, String(v));
  return `${pathPart}?${qs.toString()}`;
}

// ---- 解析：字符串 -> RouteState（容错，失败回退根路由）----
export function parseRoute(raw: string): RouteState {
  try {
    let s = (raw || '').trim();
    // 去掉前导 #（hash 形式）
    if (s.startsWith('#')) s = s.slice(1);
    // 去掉前导 ?（若整体是 query 形式如 route=/history?filter=done 解包后）
    if (s.startsWith('?')) s = s.slice(1);
    if (!s || s === '/') return { path: [], query: {} };
    if (!s.startsWith('/')) s = '/' + s;

    const [pathPart, queryPart] = s.split('?');
    const path = pathPart.split('/').filter(Boolean).map(decodeURIComponent);
    const query: Record<string, string> = {};
    if (queryPart) {
      const params = new URLSearchParams(queryPart);
      params.forEach((v, k) => { query[k] = v; });
    }
    return { path, query };
  } catch {
    return { path: [], query: {} };
  }
}

// ---- 规范化 path 输入：string | string[] -> string[] ----
function normalizePath(path: string | string[]): string[] {
  if (Array.isArray(path)) return path.filter((s) => s != null && s !== '').map(String);
  const s = String(path).trim();
  if (!s) return [];
  return s.split('/').filter(Boolean);
}

// ---- 规范化 query 输入：值非 string 时强转 ----
function normalizeQuery(query?: Record<string, unknown>): Record<string, string> {
  if (!query) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null) continue;
    out[k] = String(v);
  }
  return out;
}

// ---- Router Context ----
export type RouterApi = RouteState & {
  push(path: string | string[], query?: Record<string, unknown>): void;
  replace(path: string | string[], query?: Record<string, unknown>): void;
  back(): void;
};

const RouterContext = createContext<RouterApi | null>(null);

// 从当前 window.location 读初始 route：
// 优先 search 的 route 参数（宿主透传场景 / 独立打开带 ?route=），
// 否则 hash（#/history?filter=done）。
function readInitialRouteFromLocation(): RouteState {
  if (typeof window === 'undefined') return { path: [], query: {} };
  try {
    const sp = new URLSearchParams(window.location.search);
    const routeParam = sp.get('route');
    if (routeParam) return parseRoute(decodeURIComponent(routeParam));
    if (window.location.hash) return parseRoute(window.location.hash);
  } catch { /* noop */ }
  return { path: [], query: {} };
}

// hashchange 时只读 hash（用户主动前进/后退），忽略可能残留的 ?route=
function readRouteFromHash(): RouteState {
  if (typeof window === 'undefined') return { path: [], query: {} };
  try {
    if (window.location.hash) return parseRoute(window.location.hash);
  } catch { /* noop */ }
  return { path: [], query: {} };
}

export function Router({ children }: { children: React.ReactNode }) {
  const projectIdRef = useRef<string>('');
  const [state, setState] = useState<RouteState>(() => readInitialRouteFromLocation());

  // 取 projectId：从 location pathname 的 /workflows-ui-preview/<id> 段取（用于 postMessage 校验）。
  useEffect(() => {
    try {
      const m = window.location.pathname.match(/\/workflows-ui-preview\/([^/]+)/);
      projectIdRef.current = m ? decodeURIComponent(m[1]) : '';
    } catch { /* noop */ }
  }, []);

  // hashchange：前进/后退或外部改 hash 时同步状态
  useEffect(() => {
    const onHashChange = () => {
      setState(readRouteFromHash());
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // 写 hash 并广播给宿主（postMessage，单向：iframe -> 宿主）
  const applyRoute = useCallback((next: RouteState, replace: boolean) => {
    const serialized = serializeRoute(next);
    const hash = serialized ? `#${serialized}` : '';
    try {
      if (replace) {
        const base = window.location.pathname + window.location.search.replace(/([?&]route=)[^&]*/, '');
        window.history.replaceState(null, '', base.replace(/[?&]$/, '') + (hash || ''));
      } else {
        if (hash === '') {
          // 根路由：清掉 hash，避免末尾残留 #
          if (window.location.hash) {
            window.history.pushState(null, '', window.location.pathname + window.location.search);
          }
        } else if (window.location.hash !== hash) {
          window.location.hash = hash;
        }
      }
    } catch { /* noop */ }
    setState(next);

    // 广播给宿主
    try {
      window.parent?.postMessage(
        {
          source: 'agent-spaces:workflow-ui-router',
          projectId: projectIdRef.current,
          route: serialized,
        },
        '*',
      );
    } catch { /* noop */ }
  }, []);

  const push = useCallback((path: string | string[], query?: Record<string, unknown>) => {
    applyRoute({ path: normalizePath(path), query: normalizeQuery(query) }, false);
  }, [applyRoute]);

  const replace = useCallback((path: string | string[], query?: Record<string, unknown>) => {
    applyRoute({ path: normalizePath(path), query: normalizeQuery(query) }, true);
  }, [applyRoute]);

  const back = useCallback(() => {
    try { window.history.back(); } catch { /* noop */ }
  }, []);

  const api: RouterApi = useMemo(
    () => ({ path: state.path, query: state.query, push, replace, back }),
    [state, push, replace, back],
  );

  return React.createElement(RouterContext.Provider, { value: api }, children);
}

export function useRouter(): RouterApi {
  const ctx = useContext(RouterContext);
  if (!ctx) {
    throw new Error('useRouter must be used within <Router>');
  }
  return ctx;
}

export function Link(props: {
  to: string | string[];
  query?: Record<string, unknown>;
  replace?: boolean;
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  const router = useRouter();
  const handleClick = (e: React.MouseEvent) => {
    // 允许 ctrl/cmd/shift 点击由浏览器处理（新标签）
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    if (props.replace) router.replace(props.to, props.query);
    else router.push(props.to, props.query);
  };
  const serialized = serializeRoute({ path: normalizePath(props.to), query: normalizeQuery(props.query) });
  const href = serialized ? `/${serialized.replace(/^\//, '')}` : '/';
  return React.createElement('a', { href, onClick: handleClick, className: props.className }, props.children);
}

// 仅 dev 自检，发布前可删（Task 6 会删）
if (typeof window !== 'undefined') {
  (window as any).__routeSelfTest = () => {
    const cases: Array<[RouteState, string]> = [
      [{ path: [], query: {} }, ''],
      [{ path: ['history'], query: {} }, '/history'],
      [{ path: ['history'], query: { filter: 'done' } }, '/history?filter=done'],
      [{ path: ['detail', '123'], query: {} }, '/detail/123'],
      [{ path: ['a b'], query: { x: '1 2' } }, '/a%20b?x=1+2'],
    ];
    for (const [state, expected] of cases) {
      const got = serializeRoute(state);
      const back = parseRoute(got);
      const okRoundtrip = got === '' ? back.path.length === 0 : JSON.stringify(back) === JSON.stringify(state);
      console.assert(got === expected, `serialize ${JSON.stringify(state)} -> "${got}" expected "${expected}"`);
      console.assert(okRoundtrip, `roundtrip ${JSON.stringify(state)} -> ${JSON.stringify(back)}`);
    }
    console.assert(JSON.stringify(parseRoute('garbage/../bad')) !== null, 'parse never throws');
    console.assert(parseRoute('').path.length === 0, 'empty -> root');
    console.log('route self-test done');
  };
}
