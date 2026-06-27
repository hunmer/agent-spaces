# @agent-spaces/sdk Demo

纯 HTML + 原生 ES Modules，直接引用 SDK 构建产物 [`../dist/index.js`](../dist/index.js)，**零打包、零依赖**。每个页面聚焦一组 SDK API，方法名与真实 SDK 完全一致。

## 目录结构

```
packages/sdk/demo/
├── index.html          # 首页：服务器配置 + 登录 + 功能导航
├── version.html        # Version / 连通性检测（无需鉴权）
├── auth.html           # Auth 鉴权（login / check / changeSecret）
├── workspace.html      # Workspace（list / get / browseFolder / create）
├── agent.html          # Agent 预设（listPresets / usageDashboard / design）
├── issue.html          # Issue（list / create / start，依赖 workspaceId）
├── task.html           # Task 任务（list / create / retry / cancel，依赖 workspaceId）
├── git.html            # Git（status / log / branches，依赖 workspaceId）
├── editor.html         # Editor 文件树 & Worktree（依赖 workspaceId）
├── channel.html        # Channel 对话频道（依赖 workspaceId）
├── chat.html           # Chat 会话 / Agent / Workspace / Session
├── workflow.html       # Workflow 工作流 & 插件
├── llm.html            # LLM 模型/供应商 & 知识库
├── agent-cfg.html      # Agent 配置（prompts/skills/mcps/tools/outputStyles/hooks/command/agentCommands）
├── content.html        # 全局数据 & Search & 代码收藏
├── mini-app.html       # Mini Apps 小应用管理
├── sqlite.html         # SQLite 数据库适配器
├── settings.html       # 系统设置（npm/font/avatar/robot/订阅/语音/通知/埋点）
├── agent-store.html    # Agent Store 商店索引
├── css/style.css       # 公共样式
└── js/
    ├── sdk-config.js   # 公共：SDK 单例 + 配置持久化 + UI helpers
    ├── home.js
    ├── version.js · auth.js · workspace.js
    ├── agent.js · issue.js · task.js · git.js
    ├── editor.js · channel.js · chat.js
    ├── workflow.js · llm.js · agent-cfg.js
    ├── content.js · mini-app.js · sqlite.js
    └── settings.js · agent-store.js
```

## 模块覆盖矩阵

全部 39 个 API 模块均有对应 demo：

| demo 页 | SDK 模块 | 鉴权 | 依赖 |
|---|---|---|---|
| version | `version` | ❌ | — |
| auth | `auth` | 部分无需 | — |
| workspace | `workspace` | ✅ | — |
| agent | `agent` | ✅ | — |
| issue | `issue` | ✅ | workspaceId |
| task | `task` | ✅ | workspaceId |
| git | `git` | ✅ | workspaceId |
| editor | `editor` · `worktree` | ✅ | workspaceId |
| channel | `channel` | ✅ | workspaceId |
| chat | `chat` | ✅ | — |
| workflow | `workflow` · `workflowPlugin` | ✅ | workflowId |
| llm | `llm` · `knowledgeBase` | ✅ | workspaceId（KB） |
| agent-cfg | `prompts`·`outputStyles`·`skills`·`mcps`·`tools`·`agentCommands`·`hooks`·`command` | ✅ | 部分 workspaceId |
| content | `data` · `search` · `codeFavorites` | ✅ | 部分 workspaceId |
| mini-app | `miniApp` | ✅ | appId |
| sqlite | `sqlite` | ✅ | databaseId |
| settings | `npmSettings`·`font`·`avatar`·`robotAccounts`·`subscription`·`speech`·`notification`·`inspector` | ✅ | — |
| agent-store | `agentStore` | ✅ | baseUrl |

## 为什么能直接引用 dist

SDK 的 `dist/index.js` 编译后**没有任何 bare import**（`@agent-spaces/shared` 的类型在编译期被擦除），只剩相对路径（`./client`、`./modules/*`），且 `HttpClient` 仅用浏览器原生 `fetch`。因此 demo 通过原生 ESM 加载即可：

```js
import { createSDK } from '../../dist/index.js';
```

浏览器会自动按相对路径解析 `./client.js`、`./modules/*.js`。

## 运行方式

⚠️ **必须经 HTTP 服务打开**，不能双击用 `file://` 打开 —— 浏览器在 `file://` 下会因 CORS 拦截 ESM 的相对 import。

任选其一（在 `packages/sdk/` 目录下执行）：

```bash
# 方式 1：Python（通常已自带，零安装）
python -m http.server 8080     # → 访问 http://localhost:8080/demo/

# 方式 2：npx serve（自动下载，带目录索引）
npx --yes serve .              # → 访问输出提示的 URL/demo/

# 方式 3：npx http-server
npx --yes http-server -p 8080 .
```

打开浏览器访问 `http://localhost:<端口>/demo/`。

打开后：
1. 在首页填 **baseUrl**（默认 `http://localhost:3100`）→ 保存 → 点「测试连通」。
2. 输入服务器 **secret key** → 登录（`auth.login`），token 自动写入 localStorage。
3. 进入各功能页，点按钮即可看到真实 API 返回的 JSON。

## 调试

`createSDK({ debug: true })` 已默认开启 —— 打开浏览器 **Console** 可看到彩色请求日志：

```
[SDK →] GET http://localhost:3100/api/version
[SDK ←] GET .../api/version 200 OK 12.3ms
```

401/403 时会自动触发 `onUnauthorized` 弹出顶部横幅。

## 更新 dist

若修改了 `packages/sdk/src/**`，需重新构建产物：

```bash
pnpm --filter @agent-spaces/sdk build
```
