# Workflow-UI 项目内置路由能力

- **日期**：2026-06-12
- **状态**：已确认（待实现）
- **涉及模块**：`packages/web`
- **入口文件**：`packages/web/src/components/workflows-ui/workflow-ui-renderer.tsx`、`packages/web/src/app/workflows-ui-preview/[id]/preview-page-client.tsx`

## 1. 背景与目标

Workflow-UI 项目运行在预览 iframe 中（`/workflows-ui-preview/[id]`），用户代码经 Babel 编译后在 `new Function()` 沙箱执行，宿主通过 `window.AgentSpacesUI` / `window.AgentSpaces` / `window.AgentSpacesAPI` 注入能力。当前所有项目都是「单视图」形态——一个 `App` 组件即整个界面，没有路由概念。

随着项目变复杂（生成页 / 历史页 / 设置页 / 详情页），需要**项目内多视图切换**，并且：

- 切换视图后**更新地址栏**，带上路径段与 query 参数。
- **刷新或分享链接**时能恢复到带参数的对应视图。

目前没有任何路由能力。如果任由各项目自行实现（自己拼 URL、监听 popstate、序列化参数），每个项目会复制一套易错的同步逻辑——这违反项目「能力收敛在宿主层」的既有约定（参见 `docs/workflow-ui-renderer.md` 的 Services / config 事件设计）。

### 目标

- 提供**单一公共接口**：宿主 `Router` 组件 + `useRouter()` hook，收敛地址栏同步、参数序列化、刷新恢复逻辑。
- 项目代码零同步代码：只声明「某 route 渲染什么」，导航用 `useRouter().push(path, query)` 或 `<Link>`。
- 路由参数支持**路径段 + query**（类传统路由）：`history/detail?filter=done`。
- 分享链接可恢复：宿主页 URL 携带 `route` 参数，重新打开时透传给 iframe 并恢复到对应视图。

### 非目标（YAGNI）

- **不**做声明式路由表 + manifest 注册（`<Route path="...">` 匹配、zod 参数校验）。路由有哪些、路径模式怎么设计，全部由项目代码决定，宿主不感知路由表。
- **不**做嵌套路由 / 布局路由 / outlet（React Router v6 风格）。一个 `Router` 提供当前 `path + query`，项目自己分支渲染。
- **不**做服务端路由（SSR）。iframe 内纯客户端。
- **不**做跨项目跳转（从一个 workflow-ui 项目跳到另一个）。本设计只解决单项目内多视图。
- **不**做 history 栈的可视化或深度定制。仅暴露 `back()`，内部维护最小历史栈。

## 2. 现状分析

### 预览页结构

- 宿主编辑器（`workflow-ui-editor.tsx`）以 iframe 加载独立预览页 `/workflows-ui-preview/[id]`。
- 预览页客户端（`preview-page-client.tsx`）拉取项目文件，挂载 `WorkflowUiPreview`，并通过 `useWorkflowUiHostApi(projectId)` 注入 `window.AgentSpaces*` 全局对象。
- iframe URL 形如 `/workflows-ui-preview/{id}?embedded=1`（embedded 模式）或纯 `/workflows-ui-preview/{id}`（独立打开）。

### 外部模块映射（renderer allowlist）

渲染器在 `workflow-ui-renderer.tsx` 维护一份外部模块映射，预览代码的 bare import（`react`、`react-dom/client`、`embla-carousel-react`、`@agent-spaces/ui`）命中映射后才可用。新增的 `Router` / `useRouter` / `Link` 通过 `@agent-spaces/ui` 暴露，符合「外部依赖收敛在宿主层」的既有规则。

### 既有的「宿主收敛」范式

- **config 事件**：服务端为唯一写入方，UI 维护内存缓存 + 订阅 `onConfigChanged`。
- **任务事件**：宿主 `onTaskEvent` 转发 WS 事件，项目只订阅。

本设计的路由能力沿用同一范式：**同步逻辑收敛在宿主 `Router`，项目只声明渲染**。

## 3. 设计

### 3.1 公共接口

在 `packages/web/src/lib/ui-exports.ts` 中新增并默认导出（同时挂到 `window.AgentSpacesUI`，可通过 `@agent-spaces/ui` bare import 获取）：

```tsx
// 宿主路由上下文与 Hook —— 项目代码只用这些
type RouteState = {
  path: string[];              // 路径段，如 ['history']、['detail', '123']；根路由为 []
  query: Record<string, string>; // query 参数
};

type RouterApi = RouteState & {
  push(path: string | string[], query?: Record<string, string>): void;   // 压入历史栈
  replace(path: string | string[], query?: Record<string, string>): void; // 替换当前项，不入栈
  back(): void;               // 回退一步
};

function Router({ children }: { children: React.ReactNode }): JSX.Element;
function useRouter(): RouterApi;
function Link(props: {
  to: string | string[];
  query?: Record<string, string>;
  replace?: boolean;
  children: React.ReactNode;
  className?: string;
}): JSX.Element;
```

`path` 接受字符串（按 `/` 拆分）或字符串数组。空 path / `[]` 表示根路由。

### 3.2 项目用法

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
  return (
    <nav>
      <Link to="generate">生成</Link>
      <Link to="history" query={{ filter: 'done' }}>历史</Link>
    </nav>
  );
}

function Views() {
  const { path, query } = useRouter();
  if (path[0] === 'history') return <History filter={query.filter} />;
  if (path[0] === 'detail' && path[1]) return <Detail id={path[1]} />;
  return <Generate />;   // 默认 / 根路由
}

// 程序化导航
function goHistory() {
  useRouter().push('history', { filter: 'done' });
}
```

### 3.3 URL 编码

路由状态序列化为**单个 `route` query 参数**，值是「path 段拼接 + 子 query」的字符串，整体 `encodeURIComponent`：

| RouteState | iframe hash | 宿主页 query |
|------------|-------------|--------------|
| `{ path: [], query: {} }` | （空） | （无 route 参数） |
| `{ path: ['history'], query: { filter: 'done' } }` | `#/history?filter=done` | `?route=%2Fhistory%3Ffilter%3Ddone` |
| `{ path: ['detail', '123'], query: {} }` | `#/detail/123` | `?route=%2Fdetail%2F123` |

内部序列化规则（宿主层实现，对项目不可见）：

1. `path` 用 `/` 拼接成 path 段（空数组 → 空串）。
2. 若 `query` 非空，用 `URLSearchParams` 编码，前缀 `?`，拼到 path 段后。
3. 整串 `encodeURIComponent` 后作为 `route` 参数值。

**单 `route` 参数**而非平铺 `path=`/`filter=`：语义清晰（「route 是一个整体」），不与宿主既有 query（`embedded`）冲突，实现简单，对项目无侵入。

### 3.4 同步机制（iframe hash ↔ 宿主页 URL）

两层同步，满足「刷新恢复」+「分享链接恢复」：

**第一层：iframe 内部 hash（刷新恢复）**

- `Router` 在 iframe（预览页）内挂载时：
  - 从 `window.location.hash` 读 `route`，解析为初始 `RouteState`。
  - `push` / `replace` 写入 `window.location.hash`。
  - 监听 `window.addEventListener('hashchange', ...)`，外部修改 hash（前进/后退）时更新状态并通知订阅者。
- 选用 hash 而非 history API：iframe 内不触发宿主页 reload，hashchange 事件可靠，无需服务端配合。

**第二层：postMessage 透传到宿主页（分享链接恢复）**

- 预览页 `Router` 每次 `RouteState` 变化，向 `window.parent` postMessage：

  ```js
  window.parent.postMessage(
    { source: 'agent-spaces:workflow-ui-router', projectId, route: serializeRoute(state) },
    '*',   // 或宿主 origin
  );
  ```

- 宿主编辑器 / 宿主预览容器（监听 iframe message 的一方）收到后，用 `history.replaceState` 把 `route` 写进宿主页 URL（保留其余 query 如 `embedded`）。
- 用户从宿主页 URL（带 `route`）进入时：
  - 宿主预览容器读 URL 的 `route`，在 iframe `src` 或 iframe load 后 postMessage 给 iframe。
  - iframe `Router` 收到初始 route，覆盖 hash，渲染对应视图。

**独立打开预览页**（非 iframe，直接访问 `/workflows-ui-preview/{id}?route=...`）：`Router` 初始化时优先读 `window.location.search` 的 `route`（宿主透传场景），否则读 hash。两者解析规则一致。

### 3.5 历史栈

- `push` 写 hash（hashchange 自然入浏览器历史栈），内部额外维护一个 `RouteState[]` 栈用于 `back()`。
- `replace` 用 `history.replaceState` 改 hash（不入栈），同步更新当前栈顶。
- `back()` 调 `window.history.back()`，依赖 hashchange 回填状态。最小实现，不暴露栈深度。

### 3.6 边界与异常

- **非法 route 字符串**（如解析失败）：fallback 到根路由 `{ path: [], query: {} }`，不抛错（预览代码不该因 URL 被改坏而白屏）。
- **路径段含 `/` 的值**：`push(['a/b'])` 视为单段含 `/`；序列化时该段会被 encode，解析时按 encode 后的 `/` 切分。约定：项目应传数组而非含 `/` 的字符串段，避免歧义。
- **query 值类型**：仅 `string`。项目传非 string 值时 `String()` 强转。
- **postMessage origin**：发送方用 `'*'`，接收方校验 `event.source === iframe.contentWindow` 且 `data.source === 'agent-spaces:workflow-ui-router'` 且 `data.projectId` 匹配，避免跨 iframe 串扰。
- **未包裹 `<Router>` 调用 `useRouter()`**：抛明确错误 `useRouter must be used within <Router>`。

## 4. 实现落点

| 单元 | 文件 | 说明 |
|------|------|------|
| `Router` / `useRouter` / `Link` + 序列化 | `packages/web/src/lib/ui-exports.ts`（或拆出 `workflow-ui-router.tsx` 由 ui-exports re-export） | 纯前端，无服务端依赖 |
| 挂载到 `window.AgentSpacesUI` | `use-workflow-ui-host-api.ts`（`installAgentSpacesUiGlobals` 已覆盖 ui-exports，确认 `Router` 等被导出即可） | 复用现有注入 |
| iframe ↔ 宿主 postMessage 接收 | `preview-page-client.tsx`（预览页发起）+ 宿主编辑器侧 iframe wrapper（接收并写宿主 URL） | 新增 message 监听 |
| 文档 | `docs/workflow-ui-renderer.md` 增「内置路由」章节 | 用法 + 编码规则 |

**无需改后端**：路由纯客户端状态，不落盘、不进 SQLite、不进 config。与 Services / config 事件正交。

## 5. 测试验证

本项目无自动化测试框架。验证方式：

- 造一个多视图 demo 项目（generate / history / detail/:id），验证：
  1. 点 `<Link>` / `push` 后地址栏 hash 变化、视图切换。
  2. 刷新 iframe，视图与参数恢复。
  3. 从宿主编辑器打开预览，宿主页 URL 出现 `route` 参数。
  4. 复制宿主页 URL 到新标签打开，直接落到对应视图。
  5. 浏览器前进/后退按钮正确切换视图。
  6. 非法 `route` 值（手改 URL）不白屏，fallback 根路由。
  7. 未包 `<Router>` 调 `useRouter()` 抛明确错误。

## 6. 风险

- **postMessage 双向同步循环**：宿主写 URL → 不应再 postMessage 回 iframe（iframe 已是源）。实现时单向：iframe → 宿主（状态变化）；宿主 → iframe 仅在初始 load 透传一次。避免 ping-pong。
- **iframe reload 丢状态**：hash 保证刷新恢复；若用户 hard reload 宿主页，宿主从 URL `route` 重新透传给 iframe，覆盖 iframe 默认。
- **多 iframe 共存**（编辑器预览 + 独立预览页同开）：postMessage 按 `projectId` + `event.source` 校验，各 iframe 各自维护自己的 Router 状态，互不干扰（与既有 task/config 按 projectId 隔离一致）。
