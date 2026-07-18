# FAQ

## Q: 如何启动开发环境？

需要同时启动 Web 和 Server：

```bash
# 终端 1
pnpm --filter @agent-spaces/server dev    # :3100

# 终端 2
pnpm --filter @agent-spaces/web dev        # :3000
```

Web 通过 `next.config.ts` 的 rewrites 将 `/api/*` 和 `/ws` 代理到 Server。

## Q: Web 如何嵌入桌面/移动壳？

1. `pnpm --filter @agent-spaces/web build`（需 `NEXT_STATIC_EXPORT=1`）
2. `pnpm run copy-web` 将输出复制到 Electron/Flutter/Server
3. Electron 通过本地 HTTP 服务加载；Flutter 通过 WebView 加载

## Q: AI Agent 有哪些运行时？

Server 在 `src/adapters/` 中适配多种 AI Agent SDK：
- **Claude Code SDK** — Anthropic 官方
- **OpenAI Codex SDK**
- **Grok** — `grok-runtime.ts`，spawn 子进程，JSON 事件流
- **LangChain** — 支持 Anthropic/OpenAI/Google
- **Hermes** — 自研运行时
- **Pi SDK** — `@earendil-works/pi-coding-agent`（原 oh-my-pi 已迁移为 pi）
- **Open Agent SDK** (@codeany)

## Q: SkyOffice 是什么？怎么启动 / 关闭？

SkyOffice 是多 Agent 可视化办公空间（Colyseus 0.15 房间服务），合并进主后端单进程，与主后端共用端口 3100。

- **默认启用**：随 `node dist/app.js` 一起启动，日志见 `[skyoffice] realtime attached to main server`
- **关闭**：`SKYOFFICE_ENABLED=false`
- **HTTP**：`/api/skyoffice/rooms`（房间 CRUD）、`/api/skyoffice/map`（地图）、`/skyoffice/colyseus`（monitor，**无鉴权**）
- **Agent 推送**：`ws://localhost:3100/agent-ws?roomId=...&token=...`，消息格式见 `packages/server/src/skyoffice/examples/README.md`
- **Viewer**：浏览器用 Phaser 客户端连 `ws://localhost:3100/<colyseusRoomId>`
- **关键约束**：colyseus 纯 CJS，skyoffice 用独立 tsconfig 隔离编译，不要并入主 tsc；房间状态纯内存，进程重启即丢
- **skyoffice-web 空壳**：`packages/skyoffice-web/` 仅有 `.gitignore` + 空 `src/`，原 Vite 前端实际未迁入；真正的前端集成在 `packages/web/src/features/skyoffice/`

## Q: 如何添加新的 API 端点？

1. 在 `packages/server/src/routes/` 创建路由文件
2. 在 `packages/server/src/app.ts` 注册路由
3. 在 `packages/shared/src/types/` 添加类型
4. 在 `packages/sdk/src/modules/` 添加 SDK 封装
5. 在 `packages/sdk/src/index.ts` 注册模块

## Q: agent-spaces-data 目录是什么？

`packages/server/agent-spaces-data/` 是运行时数据目录，存储插件、工作流、上传等。不应手动修改，不在版本控制中。

## Q: Docker 部署流程？

```bash
docker compose up
```

Server 镜像内置 Web 前端，单进程服务。CI 在 tag push 时自动构建推送到 ghcr.io。
