# Flow Spaces 迁移笔记（Migration Notes）

从 agent-spaces（pnpm monorepo，`packages/web` 为 Next.js 16）迁移 **workflow 可视化编辑器**与 **miniapp（mini-apps）** 到本独立项目 `documents/flow_spaces`。

- 技术栈：Vite 7 + React 19 + TypeScript (strict) + Tailwind CSS v4（`@tailwindcss/vite` 插件）
- 结构：pnpm workspace，根 `flow-spaces` + `apps/web`（`@flow-spaces/web`）

## 迁移原则（全队共识）

1. **业务组件原样复制、不改写**（`src/components/workflow*`、`src/components/mini-apps*` 等保持字节级不变）。
2. 所有适配集中在 **脚手架 / 入口 / shim / 配置层**。
3. 原仓库 `documents/flow_spaces` 之外的文件零改动。

## 目录结构

```
flow_spaces/
├── pnpm-workspace.yaml        # packages: apps/*（同时充当 workspace root 屏障，见下）
├── package.json               # 根，仅 filter 转发 scripts
├── MIGRATION-NOTES.md         # 本文件
└── apps/web/
    ├── package.json           # @flow-spaces/web，依赖自原 web 迁移（见"依赖变化"）
    ├── vite.config.ts         # alias/define/proxy，见下
    ├── tsconfig.json          # extends tsconfig.web.json
    ├── tsconfig.web.json      # DOM lib + react-jsx + strict + paths
    ├── tsconfig.node.json     # vite.config.ts 用
    ├── index.html             # Vite SPA 入口
    ├── public/                # 静态资源（monaco vs 由 postinstall 拷入）
    └── src/
        ├── main.tsx / App.tsx # 入口 + 占位路由（待接 react-router-dom）
        ├── index.css          # Tailwind v4 入口 + 基础 CSS 变量
        ├── pages/             # workflow-editor.tsx / miniapp.tsx 占位页
        └── shims/next/        # next/* 兼容 shim（见"next shim 约定"）
```

## 构建配置约定（vite.config.ts）

- **alias**：
  - `@` → `apps/web/src`
  - `/^next\/(.*)$/` → `apps/web/src/shims/next/$1`（resolver 自动补 `.ts`）
- **define**：`process.env.NEXT_PUBLIC_SERVER_URL` = `env.NEXT_PUBLIC_SERVER_URL ?? ""`（原项目唯一的 NEXT_PUBLIC_* 变量，见原 `src/lib/server.ts:14`、`src/proxy.ts:28`）。
- **proxy（dev server）**：`/api`、`/ws`（ws:true）、`/public` → `SERVER_URL || http://127.0.0.1:3110`。
- `@tailwindcss/vite` + `@vitejs/plugin-react` 双插件。

## next shim 约定（src/shims/next/，文件由后续任务创建）

原代码使用的 next 模块 → shim 文件：

| 原导入 | shim | 说明 |
|---|---|---|
| `next/navigation`（useRouter/usePathname/useSearchParams/useParams/ReadonlyURLSearchParams） | `shims/next/navigation.ts` | 基于 react-router-dom v7 实现 |
| `next/navigation`（useServerInsertedHTML） | 同上 | SSR 专属，shim 为 no-op |
| `next/image` | `shims/next/image.ts` | default = 原生 img 包装 |
| `next/dynamic` | `shims/next/dynamic.ts` | 基于 React.lazy 的简化版 |
| `next/link` | `shims/next/link.ts` | 转发 react-router Link（href→to） |
| `next/server`（NextResponse/NextRequest） | **不 shim** | 仅 `src/proxy.ts`（Next middleware）使用，**该文件不迁移**，其能力由 vite proxy 承担 |

## 依赖变化（相对原 packages/web/package.json）

**移除（Next 专属 / workspace 专属）**：`next`、`next-intl`、`next-themes`、`eslint-config-next`、`@tailwindcss/postcss`（换 `@tailwindcss/vite`）、`react-dev-inspector`、`@react-dev-inspector/babel-plugin`、`@react-dev-inspector/middleware`、`cross-env`、`eslint`、`@agent-spaces/sdk`、`@agent-spaces/shared`（workspace:*）。

**新增**：`vite ^7`、`@vitejs/plugin-react ^5`、`@tailwindcss/vite ^4`（dev）、`react-router-dom ^7`（dep）。

**其余依赖（@xyflow/react、zustand、monaco 全家、tiptap、radix、dnd-kit、flexlayout-react、recharts、sonner 等）版本号原样保留**。

**保留 postinstall**：从 `node_modules/monaco-editor/min/vs` 拷贝到 `public/monaco/vs`（与原项目一致）。

## ⚠️ 坑：pnpm workspace 穿透

本目录位于 agent_spaces 仓库内部，父目录有 `pnpm-workspace.yaml`。若本目录**没有**自己的 `pnpm-workspace.yaml`，在其中执行 `pnpm install` 会向上找到父 workspace 并**污染原仓库的 pnpm-lock.yaml**。根目录的 `pnpm-workspace.yaml`（packages: apps/*）正是屏障——**不要删除**。

## 未决问题（待后续任务/Lead 决策）

1. **SDK 层**：业务组件大量 `import ... from "@agent-spaces/sdk"` / `"@agent-spaces/shared"`。需要 shim（vite alias → 本地实现）或复制原包源码进本项目，方案待定。
2. **i18n**：原用 next-intl（`src/i18n/`、`src/locales/{en,zh}/`）。Vite 下需换轻量方案（自写 provider 或改用 react-intl 等），业务组件中 `useTranslations` 调用不改写的前提下 shim `next-intl` 亦可。
3. **路由表**：原 Next App Router 文件路由 → react-router-dom v7 路由表映射（`workflow/[id]`、`mini-apps/[id]` 等），待组件迁移时逐个登记。
4. monaco `postinstall` 依赖 install 才会执行；T1 不执行 install，首次 install 时注意验证。

## T2 更新（2026-11-07，四包与前端闭包复制）

1. **pnpm-workspace.yaml**：`packages` 由 `["apps/*"]` 扩为 `["packages/*", "apps/*"]`，使 server/sdk/shared 的 `workspace:*` 互引与 web 对二者的引用可解析（该文件同时仍是 workspace root 屏障，不删除）。
2. **apps/web/package.json**：dependencies 加回 `"@agent-spaces/sdk": "workspace:*"` 与 `"@agent-spaces/shared": "workspace:*"`（与原 packages/web/package.json 的分区写法一致，均在 dependencies）。未决问题 1（SDK 层）按用户决策落定为「复制源码并作为 workspace 包引用」。
3. **四包源码**（shared 45 / sdk 98 / server 494 / templates 697 文件）已复制到 `flow_spaces/packages/`：按 git 跟踪文件复制（天然排除 node_modules/dist/out 等生成物），另显式排除 `server/agent-spaces-data/**`（git 跟踪的运行时数据，含 mini-apps 用户实例，非源码）与 `.DS_Store`。**注意**：server 复制未含 agent-spaces-data，运行时数据不迁移。
4. **前端闭包与资产**：`apps/web/src` 下 workflow+mini-app 依赖闭包已定稿——Lead 口径（9 种子目录 + import/export from、dynamic import、相对路径四类静态解析，排除 `app` 下 `page.tsx`/`layout.tsx` 壳）得 **ts/tsx 460**（规划预期 594，规划数为规划期快照估计、超出磁盘全量故不可复现；差距 134 个文件逐个列于 `scripts/copy-report.txt` 末尾，均无种子可达静态引用，T4 build 需要时按清单补拷即可）；另闭包含非 ts 79（.css 1/.json 78）。`src/locales` 全量 81、`src/styles/globals.css`（源自 `packages/web/src/app/globals.css`，按任务简报落此路径、内容原样）、`public/{monaco,monaco-themes,icons,devices,sdk}`（122/55/1086/4/1）已就位。脚本 `scripts/copy-closure.mjs`（幂等可重跑）与校验 `scripts/verify-copy.mjs`：packages 1334 + web/src 541（另 6 个 T1 脚手架文件）+ public 1268 全部字节一致。

## T3 更新（2026-11-07，adapter：Next → Vite 适配层）

### next shim（apps/web/src/shims/，业务文件零改动，经 vite alias 生效）

| 文件 | 覆盖 | 实现要点 |
|---|---|---|
| `shims/next/navigation.ts` | useRouter / usePathname / useSearchParams / useParams<T> / type ReadonlyURLSearchParams / useServerInsertedHTML | react-router-dom v7 之上实现。usePathname 去尾斜杠（Next 语义）；useSearchParams 返回 RR 实例（类型别名 ReadonlyURLSearchParams = URLSearchParams，业务存在 .set/.delete 后 toString 用法，与 Next 一致不回写地址栏）；useParams 泛型 undefined→""；useServerInsertedHTML 用 useInsertionEffect 在首次挂载向 document.head 注入回调返回的元素（支持 dangerouslySetInnerHTML / 字符串 children，`data-next-shim=<key>` 防重）——复刻 theme-provider/locale-provider 防 FOUC 内联脚本 |
| `shims/next/link.tsx` | default Link | 闭包内无使用，转发 RRouterLink（href→to）保类型 |
| `shims/next/dynamic.tsx` | default dynamic<P> | lazy+Suspense；loader resolve 出组件或 module（取 .default）两种形态都归一（覆盖 monaco-code-editor 与 team-message-card 两处用法） |
| `shims/next/image.tsx` | default Image | 原生 img；fill/priority/unoptimized/StaticImageData 兼容（闭包内仅 file-icon.tsx 一处静态 svg 用法） |
| `shims/next-intl.tsx` | NextIntlClientProvider / useTranslations / useLocale / useNow / useTimeZone / useFormatter / createTranslator | Context 存 {locale,messages,timeZone,now,onError}；dot-path 查找 + `{var}` 插值（语言包无 ICU 复数，未实现）；t.has / t.raw；缺 key 时 onError({code:'MISSING_MESSAGE'}) 并返回全路径 key。不传 messages 时继承外层 Provider。alias：`next-intl` → 本文件（vite.config.ts + tsconfig.web.json paths 均已登记） |

### 路由表（apps/web/src/app/router.tsx）

Next App Router 的 7 个 page.tsx 壳（被 T2 排除）→ react-router 路由的映射：

| 原壳 | 路由 | 渲染 |
|---|---|---|
| app/page.tsx | `/` | `<Navigate to="/workflows" replace>`（新项目无工作台首页） |
| app/workflows/page.tsx | `/workflows` | `<WorkflowsPage />` |
| app/workflows/share/page.tsx | `/workflows/share` | `<WorkflowSharePage />`（见下「补复制」） |
| app/workflows/[id]/page.tsx | `/workflows/:id` | `<WorkflowEditorPageClient />` |
| app/mini-apps/page.tsx | `/mini-apps` | `<MiniAppPage />` |
| app/mini-apps/[id]/page.tsx | `/mini-apps/:id` | `<MiniAppEditorPageClient />` |
| app/mini-apps-preview/page.tsx | `/mini-apps-preview` | `<MiniAppPreviewPageClient />`（query `?id=` 形态） |
| app/mini-apps-preview/[id]/page.tsx | `/mini-apps-preview/:id` | 同上（path 参数形态） |
| （新增） | `/login`、`*` | `app/placeholders.tsx` 占位页 |

原壳的 `generateStaticParams` 导出为 Next 静态导出生成物，SPA 无对应物，自然丢弃。

### 入口（apps/web/src/main.tsx + index.html）

- Provider 树对齐原 `app/layout.tsx`：`ThemeProvider（闭包内原实现，非 next-themes）> LocaleProvider > BrowserRouter > AppRoutes + Toaster(sonner, richColors, bottom-right)`。
- **AuthGuard / AppShell / ThemeStyleInit / CustomCursor / ViewportInsets / DeferredLayoutFeatures 不迁移**（workspace 壳组件不在闭包内；workflows/mini-apps 为独立全屏页）。免鉴权：main.tsx 模块加载即预置 `localStorage['agent-spaces-auth-verified']='1'`（lib/auth.ts 读取）+ server 侧新数据目录无 auth.json 双保险；/login 仅占位兜底。
- 样式链对齐原 layout.tsx:11-13：`flexlayout-react/style/light.css` → `tippy.js/dist/tippy.css` → `@/app/globals.css`。**globals.css 位置**：T2 原落在 `src/styles/globals.css`，copier 23:44 定稿重跑后已改落 `src/app/globals.css`（与原仓库路径一致），`src/styles/` 残留已删除，上方 T2 记录中的路径以本条为准。
- index.html：`<html>`/`<body>` 加 `h-[var(--app-content-height)] overflow-hidden antialiased font-sans`（对齐原 layout.tsx 的 html/body className）；viewport 参数对齐原 viewport 导出。

### 业务文件 diff（仅 3 处，均经 Lead 授权或其自然延伸）

| 文件 | diff | 原因 |
|---|---|---|
| `src/lib/server.ts:11-13` | `SERVER_PORT "3100" → "3110"` | 独立 server 实例端口；normalizeServerUrl 以此强制重写所有 URL 端口 |
| `src/lib/navigate.ts:3-6` | `const isDev = process.env.NODE_ENV === "development"` → `const isDev = true`（带注释） | Vite 生产无 Next 静态导出产物（`/workflows/_.html`），原生产分支必 404；浏览器环境永远走客户端路由 |
| `src/lib/sdk.ts:20,43` | fallback `baseUrl 'http://localhost:3100' → 'http://localhost:3110'`（两处） | 上一条端口迁移的自然延伸：getActiveServerUrl() 返回 null 的极端场景下避免连回旧实例端口 |

### 补复制（T2 闭包遗漏，从原仓库字节级原样复制，零改动）

`app/workflows/share/page.tsx` 实质是**完整业务页**（约 500 行，非壳），被 T2「排除 page.tsx 壳」的口径误伤；其依赖闭包未随之收集的 3 个 UI 文件一并补齐：

- `apps/web/src/app/workflows/share/page.tsx`
- `apps/web/src/components/ui/checklist-cell.tsx`
- `apps/web/src/components/ui/modern-loader.tsx`
- `apps/web/src/components/ui/typeanimation.tsx`（modern-loader 的依赖）

### server 独立实例配置

- `packages/server/.env`（新建）：`PORT=3110`、`AGENT_SPACES_DATA_DIR=/Users/Zhuanz/.flow-spaces-data`。dotenv 由 `src/app.ts:2-3` 的 `loadDotenv()` 以 cwd（= packages/server）加载；新数据目录与原 `~/.agent-spaces-data` 完全隔离，无 auth.json → `getSecret()=''` → authMiddleware 全放行（免鉴权模式）。
- 根 `package.json` scripts 新增：`build:packages`（shared → sdk 顺序 build，二者 main/exports 均指向 dist，web 的 workspace 引用需要）、`dev:server`（`pnpm --filter @agent-spaces/server dev` → tsx watch）、`dev:all`；`build` 改为先 build:packages 再 build web。

### 脚手架清理（T1 占位文件）

删除：`src/App.tsx`（hash 占位路由）、`src/index.css`（简易 token，被 globals.css 取代）、`src/pages/{miniapp,workflow-editor}.tsx`。
⚠️ 更正：globals.css 最终落点为 `src/styles/globals.css`（T2 copier 23:47 终版口径，源自 `packages/web/src/app/globals.css` 27389B 原样）；S4 清理时曾误当作旧口径残留删除，S6 已从原仓库字节级恢复，`main.tsx` import `@/styles/globals.css`。

### S6 验证与修复（typecheck 0 错 + vite build 通过 + dev 冒烟通过）

**验证结果**：`tsc --noEmit`（tsconfig.web.json / tsconfig.node.json）均 0 错误；`pnpm build`（shared→sdk→web vite build 43s）通过；dev 冒烟通过（server 3110 `/api/auth/check` → `{"authenticated":true,"secretSet":false}` 免鉴权生效；web 5173 HTML 正常、`/api/*` 代理转发正常、`/api/workflows` 与 `/api/mini-apps` 返回 `[]` 空列表；main.tsx/router.tsx/workflows-page.tsx/shims 模块 vite transform 全 200）。

**⚠️ 原仓库既有问题发现**：原 `packages/web` 删除 `.tsbuildinfo` 缓存后冷跑 `tsc --noEmit` 有 **46 个既有类型错误**（workspace-shell 8 / file-upload 5 / resizable 4 / image-cropper 4 / workflow-node-body 3 / dropzone 3 / morphing-spinner 1 等）。此前"原仓库 typecheck 干净"是 incremental 缓存假象；原仓库 next build 无 ignoreBuildErrors，一直带错构建。flow_spaces 闭包是子集且修复后比原仓库冷跑更干净（0 错）。

**本轮修复清单**：
1. `tsconfig.web.json` 终版口径：`target ES2022`、`lib ["ESNext","DOM","DOM.Iterable"]`（findLastIndex 需 ES2023，原仓库 lib 为 esnext）、`"types": []`（防 @types/node 全局泄漏）、skipLibCheck、strict；**不加** noUnusedLocals/noUnusedParameters/verbatimModuleSyntax（原仓库无这三项，业务闭包不满足）。
2. `apps/web/package.json` 依赖修正：加 `"@tiptap/pm": "^3.22.5"`（修 tsc 沿 node_modules 上爬解析 `@tiptap/pm/*` 穿出 flow_spaces、命中外层 agent_spaces 旧 prosemirror 类型集的双版本冲突 TS2322/TS2345；原仓库单仓库内解析命中自己无此问题；vite 运行时同样受益）；`"@xyflow/react"` pin 精确 `"12.10.2"`（新 lockfile 漂移到 12.12.1 导致 OnNodeDrag 签名收紧 workflow-canvas.tsx:1461,1463 TS2322；对齐原 lockfile 12.10.2）。
3. 新建 `src/shims/styled-jsx.d.ts`：declare module 'react' 给 StyleHTMLAttributes 增 `jsx?: boolean; global?: boolean`（业务 morphing-spinner.tsx 用 `<style jsx>`；Next 环境由 next-env.d.ts 类型提供，Vite 缺失需补环境；原仓库冷跑同样报此错）。
4. **业务 diff 第 4 处**：`src/stores/terminal.ts:165` `.reduce(` → `.reduce<string>(`（显式泛型 + 注释）。根因：无 next 类型环境时 TS 5.9 将 `''` initialValue 推断为字面量类型 `""` 导致 TS2769；原仓库项目内由 next-env.d.ts 类型环境掩盖。一行最小改动。
5. shim 自身修复：navigation.ts navigate options 映射 `preventScrollReset: options?.scroll === false`（RR7 NavigateOptions 无 scroll 字段）；dynamic.tsx lazy/Loading 断言 ComponentType（泛型 JSX 展开报 TS2769/TS2322）；next-intl.tsx `Intl.Formatters` → 本地 ShimFormatters 接口（TS 全局 Intl 无此类型）。
6. 根 `tsconfig.base.json` 从原仓库补复制（T2 漏复制；shared/sdk 的 tsconfig extends 失效致 build:packages 报 TS18028）。

**业务文件 diff 汇总（共 4 处，均最小一行式，全部带 flow-spaces 注释）**：`lib/server.ts:11`（端口 3110）、`lib/navigate.ts:3-6`（isDev 恒真）、`lib/sdk.ts:20,43`（fallback baseUrl 3110 ×2）、`stores/terminal.ts:165`（reduce<string>）。其余业务文件零改动。

## T4 更新（2026-11-08，install/构建/冷启动/冒烟联调终验）

### 验证结果（全部通过）

| 验收项 | 结果 | 证据 |
|---|---|---|
| 根 `pnpm install` | ✅ 6 workspace 项目，lockfile up to date，server postinstall（node-pty prebuild）+ web postinstall（monaco→public）正常 | — |
| 独立性复现 | ✅ 删除 `apps/web/{node_modules,.vite,dist}` 后重装重跑：node_modules/monaco 资产重建，typecheck/build 照常通过 | — |
| `pnpm typecheck` | ✅ tsconfig.web.json + tsconfig.node.json 双 0 错误 | — |
| `pnpm build` | ✅ shared→sdk→web vite build 41.1s 通过（主 chunk 11.7MB gzip 3.3MB，含 mermaid/katex/monaco 全量语言） | — |
| `packages/server` `tsc` | ✅ dist/app.js 生成 | — |
| server 冷启动 | ✅ procm 重启 cold start：dotenv 注入 2 变量，`listening on http://0.0.0.0:3110`，`websocket on ws://0.0.0.0:3110/ws`，TriggerService 启动 | procm flow-server (WtJ2W5VE) |
| 数据目录初始化 | ✅ `~/.flow-spaces-data/`（agent-templates、plugins） | — |
| 免鉴权 | ✅ `/api/auth/check` → `{"authenticated":true,"secretSet":false}` | — |
| 5 路由冒烟 | ✅ /workflows、/workflows/share、/mini-apps、/mini-apps-preview、/login 全 200 且真实渲染（DOM 探测确认中文 UI/按钮），console 零 error/warn | `docs/smoke/`（smoke-curl.md + route-*.png ×5） |
| SDK 连通 | ✅ web(5173)→vite proxy→server(3110)：`/api/workflows`、`/api/mini-apps` 均返回 200 `[]` | `docs/smoke/smoke-curl.md` |
| 原仓库零改动 | ✅ `git status` 仅 `?? documents/flow_spaces/` | — |

### 复制校验终版（scripts/verify-copy.mjs，T4 修正口径后 exit 0）

- 修正：walk 跳过 `node_modules`/`dist`/`logs`（install/build/运行期生成物，与原仓库同名产物无比对意义）；新增「已记录diff」分类承接 MIGRATION-NOTES 中 5 处有意 diff（业务 4 + server/.env）；`app/router.tsx`、`app/placeholders.tsx` 归入脚手架。
- 结果：**packages 1335**（一致 1334 + 已记录diff 1=server/.env）、**apps/web/src 555**（一致 541 + 脚手架 10 + 已记录diff 4）、**apps/web/public 1268**（全一致）——源码层零漂移。

### 全部业务 diff（终版口径，共 4 处 + server/.env，其余业务文件字节级一致）

1. `apps/web/src/lib/server.ts:11` — SERVER_PORT `"3100"→"3110"`
2. `apps/web/src/lib/navigate.ts:3-6` — `isDev` 恒 `true`（Vite 无 Next 静态导出产物）
3. `apps/web/src/lib/sdk.ts:20,43` — fallback baseUrl `3110` ×2
4. `apps/web/src/stores/terminal.ts:165` — `.reduce<string>(`（无 next-env.d.ts 类型环境时 TS2769）
5. `packages/server/.env` — 新建（PORT=3110、AGENT_SPACES_DATA_DIR=/Users/Zhuanz/.flow-spaces-data）

### 启动步骤（用户视角）

```bash
cd documents/flow_spaces
pnpm install                 # 首次/依赖变更后；幂等
pnpm build                   # 可选：shared→sdk→web 全量构建（dev 模式可跳过）
# 终端 1：server（3110，数据目录 ~/.flow-spaces-data）
pnpm dev:server
# 终端 2：web（5173，/api /ws /public 已代理到 3110）
pnpm dev
# 浏览器打开
open http://localhost:5173/workflows
```

> 进程托管形态：procm 中 `flow-server`(WtJ2W5VE, `pnpm run dev`)、`flow-web`(07IOTaqn, `pnpm dev`) 常驻，可直接复用或 stop。

### 用户验收步骤

1. `cd documents/flow_spaces && pnpm install && pnpm build` —— 两条命令均应零错误退出。
2. 起服务：`pnpm dev:server`（另一终端）+ `pnpm dev`；日志应出现 `listening on http://0.0.0.0:3110`。
3. 打开 `http://localhost:5173/workflows`：应看到「工作流」列表页（空态文案「暂无工作流模板」）；`http://localhost:5173/mini-apps`：Mini App 管理页（空态「暂无自定义页面」）。
4. 在 /workflows 页点「创建第一个工作流」→ 进入编辑器画布可拖拽节点即通过；回列表再进详情可打开。
5. 冒烟证据备查：`docs/smoke/smoke-curl.md`（接口/路由状态码与响应体）+ `route-*.png`（5 路由真实渲染截图）。
