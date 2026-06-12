# Workflow-UI 内置路由能力 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 workflow-ui 项目提供宿主级公共路由接口（`Router` 组件 + `useRouter()` hook + `<Link>`），收敛地址栏同步、参数序列化、刷新/分享链接恢复逻辑，项目代码零同步代码。

**Architecture:** 路由能力作为纯前端 React 组件/Hook 放在 `packages/web/src/lib/ui-exports.ts` 暴露的导出中，预览代码通过 `@agent-spaces/ui` bare import 或 `window.AgentSpacesUI` 使用。两层同步：iframe 内 `Router` 操作自身 `window.location.hash` 保证刷新恢复；iframe ↔ 宿主编辑器经 `postMessage` 双向通信，宿主把 `route` 写进宿主页 URL 实现分享链接恢复。无后端改动。

**Tech Stack:** React 19 Context + Hook、`window.location.hash` + `hashchange` 事件、`window.postMessage`、Next.js App Router（宿主侧 `useRouter`/`useSearchParams`）。

**Spec:** `docs/superpowers/specs/2026-06-12-workflow-ui-routing-design.md`

---

## 关键代码事实（实现者必读）

- `packages/web/src/lib/ui-exports.ts` 是宿主 UI 导出聚合文件，所有 `export` 的符号会被 `workflow-ui-renderer.tsx` 的外部模块映射 `@agent-spaces/ui` 自动暴露给预览代码（见 renderer 行 104-106：`{ __esModule: true, ...AgentSpacesUI }`）。**所以新增 `Router`/`useRouter`/`Link` 只需在此文件 export，无需改 renderer allowlist。**
- `installAgentSpacesUiGlobals()`（renderer 行 77-96）把 `AgentSpacesUI` spread 进 `window.AgentSpacesUI`，新增导出自动覆盖到全局。
- 编辑器预览是 **iframe**：`workflow-ui-editor.tsx` 行 583-588 `<iframe src={previewUrl} />`，`previewUrl = /workflows-ui-preview/${id}?embedded=1&refresh=${key}`（行 435）。手动刷新时 `refresh` key 变化导致 iframe reload，hash 会丢失——必须由宿主在 iframe load 后经 postMessage 重发当前 route。
- 预览页 `preview-page-client.tsx` 在 iframe 内运行，挂载 `useWorkflowUiHostApi(projectId)` 注入全局。
- `shareUrl`（editor 行 134-136）是 `${origin}/workflows-ui-preview/${projectId}`，分享链接需要拼接 `?route=...`。

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `packages/web/src/components/workflows-ui/workflow-ui-router.tsx` | 新建 | `Router`/`useRouter`/`Link` + 序列化函数 `serializeRoute`/`parseRoute` + postMessage 收发。单一职责：路由状态与地址栏同步。 |
| `packages/web/src/lib/ui-exports.ts` | 修改 | re-export 路由符号，使其进入 `@agent-spaces/ui` 与 `window.AgentSpacesUI`。 |
| `packages/web/src/components/workflows-ui/workflow-ui-editor.tsx` | 修改 | iframe 加 ref；监听 iframe postMessage 把 route 写宿主页 URL（`history.replaceState`，保留 `embedded`/`refresh`）；iframe load 后向其 postMessage 当前 route（处理手动刷新丢 hash）。 |
| `packages/web/src/app/workflows-ui-preview/[id]/preview-page-client.tsx` | 修改 | 无需改（`Router` 在用户代码里用）。确认 `embedded` 模式下 iframe 内 `window.location` 可读写 hash（默认即可）。 |
| `docs/workflow-ui-renderer.md` | 修改 | 增加「内置路由」章节。 |

---

## Task 1: 路由序列化与解析（纯函数）

**Files:**
- Create: `packages/web/src/components/workflows-ui/workflow-ui-router.tsx`

路由状态 `RouteState = { path: string[]; query: Record<string, string> }` 需要可逆序列化为字符串（如 `/history?filter=done`）。

- [ ] **Step 1: 创建文件，写序列化与解析函数**

创建 `packages/web/src/components/workflows-ui/workflow-ui-router.tsx`：

```tsx
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
```

- [ ] **Step 2: 在浏览器控制台快速验证（无需测试框架，本项目无单测）**

此项目无自动化测试框架。序列化/解析是纯函数，可在 dev server 起后于浏览器控制台验证。但为确保实现者信心，临时在文件末尾加一段 `if (typeof window !== 'undefined' && (window as any).__ROUTE_SELFTEST)` 自检块，dev 期间手动触发：

```tsx
// 仅 dev 自检，发布前可删
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
      const okRoundtrip = JSON.stringify(back) === JSON.stringify(state)
        || (got === '' && back.path.length === 0);
      console.assert(got === expected, `serialize ${JSON.stringify(state)} -> "${got}" expected "${expected}"`);
      console.assert(okRoundtrip, `roundtrip ${JSON.stringify(state)} -> ${JSON.stringify(back)}`);
    }
    // 容错
    console.assert(JSON.stringify(parseRoute('garbage/../bad')) !== null, 'parse never throws');
    console.assert(parseRoute('').path.length === 0, 'empty -> root');
    console.log('route self-test done');
  };
}
```

启动 dev 后在浏览器控制台执行 `__routeSelfTest()`，预期最后一行打印 `route self-test done`，无断言失败。

- [ ] **Step 3: 提交**

```bash
git add packages/web/src/components/workflows-ui/workflow-ui-router.tsx
git commit -m "feat(workflow-ui): add route serialize/parse pure functions"
```

---

## Task 2: Router Context 与 useRouter hook（hash 同步）

**Files:**
- Modify: `packages/web/src/components/workflows-ui/workflow-ui-router.tsx`

`Router` 在 iframe（预览页）内挂载，从 `window.location` 初始化状态，`push/replace/back` 写 hash，监听 `hashchange`。

- [ ] **Step 1: 追加 Context、Provider、Hook 到文件末尾（self-test 块之前）**

在 `packages/web/src/components/workflows-ui/workflow-ui-router.tsx` 的纯函数之后、self-test 块之前插入：

```tsx
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

export function Router({ children }: { children: React.ReactNode }) {
  const projectIdRef = useRef<string>('');
  const [state, setState] = useState<RouteState>(() => readInitialRouteFromLocation());

  // 取 projectId：从 <Router projectId="..."> 或 URL path 推断（/workflows-ui-preview/<id>）
  // 这里支持可选 prop，否则从 location pathname 解析。
  // 为简单：从 location.pathname 的 /workflows-ui-preview/<id> 段取。
  useEffect(() => {
    try {
      const m = window.location.pathname.match(/\/workflows-ui-preview\/([^/]+)/);
      projectIdRef.current = m ? decodeURIComponent(m[1]) : '';
    } catch { /* noop */ }
  }, []);

  // hashchange：前进/后退或外部改 hash 时同步状态
  useEffect(() => {
    const onHashChange = () => {
      setState(readInitialRouteFromLocation());
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
        // replaceState 改 hash 不入栈
        const url = hash || window.location.pathname + window.location.search;
        window.history.replaceState(null, '', hash || window.location.pathname + window.location.search);
        if (window.location.hash !== hash) {
          // replaceState 不会改 hash 字段除非 URL 含 #，这里直接设置
          window.history.replaceState(null, '', (window.location.pathname + window.location.search + hash).replace(/#$/, ''));
        }
      } else {
        // push：直接赋 hash 触发入栈 + hashchange
        if (window.location.hash !== hash) {
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
```

注意 `applyRoute` 里 replace 分支的 URL 拼接较绕，简化为更清晰的版本（替换上面 replace 分支整段）：

```tsx
      if (replace) {
        const base = window.location.pathname + window.location.search.replace(/([?&]route=)[^&]*/, '');
        const cleanBase = base.replace(/[?&]$/, '');
        window.history.replaceState(null, '', cleanBase + (hash || ''));
      } else {
        if (window.location.hash !== hash) {
          window.location.hash = hash;
        }
      }
```

（`replace` 分支用 `replaceState` 改整体 URL 含 hash，避免 hashchange 抖动；`push` 分支赋 `location.hash` 自然入栈。）

- [ ] **Step 2: 添加 Link 组件**

在 `useRouter` 之后追加：

```tsx
export function Link(props: {
  to: string | string[];
  query?: Record<string, unknown>;
  replace?: boolean;
  children: React.ReactNode;
  className?: string;
}): JSX.Element {
  const router = useRouter();
  const handleClick = (e: React.MouseEvent) => {
    // 允许 ctrl/cmd 点击由浏览器处理（新标签）
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    if (props.replace) router.replace(props.to, props.query);
    else router.push(props.to, props.query);
  };
  const state = { path: normalizePath(props.to), query: normalizeQuery(props.query) };
  const href = `/workflows-ui-preview${serializeRoute(state) ? '/' + serializeRoute(state).replace(/^\//, '') : ''}`;
  return React.createElement('a', { href, onClick: handleClick, className: props.className }, props.children);
}
```

- [ ] **Step 3: 手动验证（dev server）**

创建一个临时测试项目或改现有项目的 `index.jsx`：

```jsx
import { Router, useRouter, Link } from '@agent-spaces/ui';

export default function App() {
  return (
    <Router>
      <Nav />
      <Views />
    </Router>
  );
}
function Nav() {
  return <div>
    <Link to="">首页</Link>{' '}
    <Link to="history" query={{ filter: 'done' }}>历史</Link>
  </div>;
}
function Views() {
  const { path, query } = useRouter();
  if (path[0] === 'history') return <div>History filter={query.filter}</div>;
  return <div>Home</div>;
}
```

启动 `pnpm dev`，打开该项目预览。预期：
- 点「历史」→ iframe 地址栏 hash 变为 `#/history?filter=done`，显示 `History filter=done`。
- 点「首页」→ hash 清空，显示 `Home`。
- 浏览器前进/后退能切换。

- [ ] **Step 4: 提交**

```bash
git add packages/web/src/components/workflows-ui/workflow-ui-router.tsx
git commit -m "feat(workflow-ui): add Router context, useRouter, Link with hash sync"
```

---

## Task 3: 暴露到 ui-exports（进入 @agent-spaces/ui 与 window.AgentSpacesUI）

**Files:**
- Modify: `packages/web/src/lib/ui-exports.ts`

- [ ] **Step 1: 在 ui-exports.ts 末尾追加 re-export**

在 `packages/web/src/lib/ui-exports.ts` 末尾（`export * from 'lucide-react';` 之后）追加：

```ts
// Workflow-UI 内置路由能力
export { Router, useRouter, Link, serializeRoute, parseRoute } from '@/components/workflows-ui/workflow-ui-router';
export type { RouteState, RouterApi } from '@/components/workflows-ui/workflow-ui-router';
```

- [ ] **Step 2: 验证可用性**

dev server 下，预览代码 `import { Router } from '@agent-spaces/ui'` 不报模块未找到；`window.AgentSpacesUI.Router` 存在（renderer 的 `installAgentSpacesUiGlobals` 自动 spread）。在预览页控制台执行 `window.AgentSpacesUI.Router` 应为函数。

- [ ] **Step 3: 提交**

```bash
git add packages/web/src/lib/ui-exports.ts
git commit -m "feat(workflow-ui): expose Router/useRouter/Link via @agent-spaces/ui"
```

---

## Task 4: 宿主侧 postMessage 接收 + 写宿主页 URL

**Files:**
- Modify: `packages/web/src/components/workflows-ui/workflow-ui-editor.tsx`

iframe 内 `Router` 每次 route 变化 postMessage 给 `parent`。宿主 editor 监听，把 `route` 写进宿主页 URL（`history.replaceState`，保留 `embedded`/`refresh`），实现「分享/刷新宿主页可恢复」。

- [ ] **Step 1: 给 iframe 加 ref**

在 `workflow-ui-editor.tsx` 顶部已有 `useRef` import。在组件内（与其他 ref 同区，约行 137-143 附近）添加：

```tsx
const previewIframeRef = useRef<HTMLIFrameElement | null>(null);
```

- [ ] **Step 2: 改 iframe 标签挂 ref**

行 583-588 的 `<iframe>` 改为：

```tsx
                        <iframe
                            key={previewUrl}
                            src={previewUrl}
                            ref={previewIframeRef}
                            title={project.name}
                            className="flex-1 min-h-0 w-full border-0 bg-background"
                        />
```

- [ ] **Step 3: 添加 message 监听 + 初始透传 effect**

在组件内（其他 `useEffect` 附近）添加：

```tsx
    // ---- 路由同步：iframe <-> 宿主页 URL ----
    // 接收 iframe Router 的 route 变化，写进宿主页 URL（replaceState，保留 embedded/refresh）。
    // iframe load 后把宿主当前 route 透传回去（处理手动刷新 key 变导致 iframe reload 丢 hash）。
    useEffect(() => {
        if (!project) return;
        const ROUTE_MSG_SOURCE = 'agent-spaces:workflow-ui-router';

        const syncRouteToHostUrl = (route: string) => {
            try {
                const url = new URL(window.location.href);
                if (route) url.searchParams.set('route', route);
                else url.searchParams.delete('route');
                window.history.replaceState(null, '', url.pathname + url.search);
            } catch { /* noop */ }
        };

        const onMessage = (e: MessageEvent) => {
            const iframe = previewIframeRef.current;
            if (!iframe || e.source !== iframe.contentWindow) return;
            const data = e.data;
            if (!data || data.source !== ROUTE_MSG_SOURCE) return;
            if (data.projectId && data.projectId !== project.id) return;
            syncRouteToHostUrl(typeof data.route === 'string' ? data.route : '');
        };

        const sendRouteToIframe = () => {
            const iframe = previewIframeRef.current;
            if (!iframe?.contentWindow) return;
            let route = '';
            try {
                const sp = new URLSearchParams(window.location.search);
                route = sp.get('route') || '';
            } catch { /* noop */ }
            iframe.contentWindow.postMessage(
                { source: ROUTE_MSG_SOURCE + ':init', projectId: project.id, route },
                '*',
            );
        };

        window.addEventListener('message', onMessage);
        const iframe = previewIframeRef.current;
        if (iframe) {
            iframe.addEventListener('load', sendRouteToIframe);
            // 已 loaded（缓存）的情况
            if (iframe.contentDocument?.readyState === 'complete') sendRouteToIframe();
        }
        return () => {
            window.removeEventListener('message', onMessage);
            const ifr = previewIframeRef.current;
            if (ifr) ifr.removeEventListener('load', sendRouteToIframe);
        };
    }, [project, previewRefreshKey]);
```

依赖 `previewRefreshKey`（手动刷新 key）确保 iframe reload 后重新挂 load 监听并重发 route。

- [ ] **Step 4: 让 iframe Router 接收 init 透传**

回到 `workflow-ui-router.tsx` 的 `Router`，在 `hashchange` 监听 effect 之后再加一个 effect 接收宿主 init 消息：

```tsx
  // 接收宿主 init 透传（iframe reload 后宿主重发当前 route）
  useEffect(() => {
    const ROUTE_INIT_SOURCE = 'agent-spaces:workflow-ui-router:init';
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window.parent) return;
      const data = e.data;
      if (!data || data.source !== ROUTE_INIT_SOURCE) return;
      if (typeof data.route === 'string' && data.route) {
        const next = parseRoute(data.route);
        const serialized = serializeRoute(next);
        const hash = serialized ? `#${serialized}` : '';
        try {
          const base = window.location.pathname + window.location.search.replace(/([?&]route=)[^&]*/, '');
          window.history.replaceState(null, '', base.replace(/[?&]$/, '') + (hash || ''));
        } catch { /* noop */ }
        setState(next);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);
```

- [ ] **Step 5: 端到端验证**

dev server 下用 Task 2 的测试项目：
1. 点「历史」→ 宿主页（编辑器所在 tab）地址栏出现 `?...&route=%2Fhistory%3Ffilter%3Ddone`。
2. 手动刷新编辑器预览（点 refresh 按钮，`refresh` key 变，iframe reload）→ 视图应恢复到 history（宿主透传生效）。
3. 浏览器前进/后退 → 视图与 iframe hash 同步。
4. 控制台无「useRouter must be used within Router」之外的报错。

- [ ] **Step 6: 提交**

```bash
git add packages/web/src/components/workflows-ui/workflow-ui-editor.tsx packages/web/src/components/workflows-ui/workflow-ui-router.tsx
git commit -m "feat(workflow-ui): sync iframe route to host URL via postMessage"
```

---

## Task 5: 分享链接支持

**Files:**
- Modify: `packages/web/src/components/workflows-ui/workflow-ui-editor.tsx`

`shareUrl` 需携带当前 `route`，让分享出去的链接打开即落到对应视图。独立打开（非 iframe）时预览页 `Router` 从 `?route=` 初始化（Task 2 的 `readInitialRouteFromLocation` 已处理 search 优先）。

- [ ] **Step 1: 让 shareUrl 包含当前 route**

`shareUrl` 是 `const`（editor 行 134-136）。改为从当前 URL 读 route 拼接。由于它是普通 `const` 而非 state，每次渲染都会重算，可直接读 `window.location.search`：

将：
```tsx
    const shareUrl = typeof window !== 'undefined'
        ? `${window.location.origin}/workflows-ui-preview/${projectId}`
        : '';
```

改为：
```tsx
    const shareUrl = (() => {
        if (typeof window === 'undefined') return '';
        let route = '';
        try { route = new URLSearchParams(window.location.search).get('route') || ''; } catch { /* noop */ }
        const base = `${window.location.origin}/workflows-ui-preview/${projectId}`;
        return route ? `${base}?route=${encodeURIComponent(route)}` : base;
    })();
```

注意：`shareUrl` 在用户打开 ShareDialog 时被读取。若希望反映「打开 dialog 那一刻」的 route，可改为在 `ShareDialog` 打开时计算。但当前 `shareUrl` 是 render 时常量，由于地址栏 route 经 `replaceState` 实时更新，render 时读取已是最新。为保险，可在 `setShareOpen(true)` 前不额外处理（render 重算足够）。

- [ ] **Step 2: 验证**

1. 在预览里导航到 history（带 filter）。
2. 点分享按钮打开 ShareDialog → 链接应含 `?route=%2Fhistory%3Ffilter%3Ddone`。
3. 复制链接到新标签（无 `embedded`）打开 → 应直接显示 `History filter=done`（`readInitialRouteFromLocation` 走 search 分支）。

- [ ] **Step 3: 提交**

```bash
git add packages/web/src/components/workflows-ui/workflow-ui-editor.tsx
git commit -m "feat(workflow-ui): include route in share url"
```

---

## Task 6: 移除 self-test 块 + 文档

**Files:**
- Modify: `packages/web/src/components/workflows-ui/workflow-ui-router.tsx`
- Modify: `docs/workflow-ui-renderer.md`

- [ ] **Step 1: 删除 workflow-ui-router.tsx 末尾的 self-test 块**

删除 Task 1 Step 2 添加的 `if (typeof window !== 'undefined') { (window as any).__routeSelfTest = ... }` 整段。保留纯函数与组件。

- [ ] **Step 2: 在 docs/workflow-ui-renderer.md 增「内置路由」章节**

在「项目 Services」章节之后、「SQLite 数据库」之前插入新章节：

````markdown
## 内置路由（项目内多视图）

复杂项目常需多个视图（生成 / 历史 / 设置 / 详情）。宿主提供**公共路由接口**，收敛地址栏同步、参数序列化、刷新与分享链接恢复逻辑——项目代码零同步代码。

### 用法

通过 `@agent-spaces/ui` 或 `window.AgentSpacesUI` 获取 `Router`、`useRouter`、`Link`：

```jsx
import { Router, useRouter, Link } from '@agent-spaces/ui';

export default function App() {
  return (
    <Router>
      <Nav />
      <Views />
    </Router>
  );
}

function Nav() {
  return <Link to="history" query={{ filter: 'done' }}>历史</Link>;
}

function Views() {
  const { path, query } = useRouter();
  if (path[0] === 'history') return <History filter={query.filter} />;
  if (path[0] === 'detail' && path[1]) return <Detail id={path[1]} />;
  return <Generate />;
}
```

### API

| 符号 | 说明 |
|------|------|
| `<Router>` | 路由 Provider，必须在顶层包裹。从地址栏恢复初始路由。 |
| `useRouter()` | 返回 `{ path, query, push, replace, back }`。未包裹时抛 `useRouter must be used within <Router>`。 |
| `<Link to query replace>` | 声明式导航，封装 `push`/`replace`。 |
| `push(path, query?)` | 路径段 + query，入历史栈。`path` 接受字符串（按 `/` 拆）或数组。 |
| `replace(path, query?)` | 替换当前项，不入栈。 |
| `back()` | 浏览器回退。 |

### URL 编码

路由状态序列化为单个 `route` 参数：path 段用 `/` 拼接，query 用 `URLSearchParams` 拼到后面。如 `{ path: ['history'], query: { filter: 'done' } }` → `/history?filter=done` → URL 中 `?route=%2Fhistory%3Ffilter%3Ddone`。

### 同步机制

- **iframe hash**：`Router` 操作预览 iframe 自身 `location.hash`（`#/history?filter=done`），刷新 iframe 即可恢复。
- **宿主页 URL**：iframe 经 `postMessage` 把 route 透传给宿主编辑器，写入宿主页 URL 的 `route` 参数。手动刷新预览（iframe reload 丢 hash）时，宿主在 iframe load 后重发当前 route。
- **分享链接**：分享按钮生成的链接携带 `route`，独立打开时 `Router` 从 `?route=` 恢复初始视图。

### 注意

- query 值仅 `string`，传非 string 会被 `String()` 强转。
- 路径段建议传数组而非含 `/` 的字符串，避免歧义。
- 非法 `route` 值（手改 URL）会 fallback 到根路由，不报错。
- 路由是纯客户端状态，不落盘、不进 SQLite / config，与 Services 正交。
````

- [ ] **Step 3: 提交**

```bash
git add packages/web/src/components/workflows-ui/workflow-ui-router.tsx docs/workflow-ui-renderer.md
git commit -m "docs(workflow-ui): document built-in routing; remove self-test"
```

---

## Task 7: 全量验证清单

**Files:** 无（仅验证）

- [ ] **Step 1: 逐项验证**

用 Task 2 的多视图 demo 项目，确认 spec §5 全部通过：

1. 点 `<Link>` / `push` → 地址栏 hash 变化、视图切换。✅
2. 刷新 iframe → 视图与参数恢复。✅（Task 4 宿主透传）
3. 宿主编辑器预览导航 → 宿主页 URL 出现 `route`。✅
4. 复制宿主页 URL（或 shareUrl）到新标签打开 → 落到对应视图。✅
5. 浏览器前进/后退 → 视图正确切换。✅（hashchange）
6. 手改 URL `route=garbage` → 不白屏，fallback 根路由。✅（parseRoute 容错）
7. 未包 `<Router>` 调 `useRouter()` → 抛 `useRouter must be used within <Router>`，渲染边界捕获显示错误。✅
8. 多 iframe 共存（编辑器预览 + 独立预览页同开）→ 各自独立，postMessage 按 `projectId` + `event.source` 校验不串扰。✅

- [ ] **Step 2: lint 通过**

```bash
pnpm lint
```

预期无新增 error。

- [ ] **Step 3: 最终提交（若有 lint 修复）**

```bash
git add -A
git commit -m "chore(workflow-ui): lint cleanup for routing"
```

---

## Self-Review 已完成

- **Spec 覆盖**：§3.1 接口（Task 1-3）、§3.3 编码（Task 1）、§3.4 两层同步（Task 2 iframe hash + Task 4 postMessage + Task 5 分享）、§3.5 历史栈（Task 2 push/replace/back）、§3.6 边界（parseRoute 容错、projectId/source 校验、未包裹报错）均有对应 Task。§4 落点表与文件结构一致。
- **占位符**：无 TBD/TODO，每步含完整代码。
- **类型一致**：`RouteState`、`RouterApi`、`serializeRoute`/`parseRoute` 签名在所有 Task 一致；`source` 字面量 `agent-spaces:workflow-ui-router` 与 `:init` 后缀在 Task 4 收发两端匹配。
